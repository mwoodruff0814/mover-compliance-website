const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { generateRightsAndResponsibilitiesPDF, generateReadyToMovePDF } = require('../utils/pdf');

const router = express.Router();

// Store active SSE connections
const sseClients = new Map();

// Get dashboard overview data
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all service statuses in parallel
    const [arbitration, tariff, boc3, recentOrders] = await Promise.all([
      // Arbitration enrollment status
      query(
        `SELECT * FROM arbitration_enrollments
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId]
      ),
      // Most recent tariff order
      query(
        `SELECT * FROM tariff_orders
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId]
      ),
      // Most recent BOC-3 order
      query(
        `SELECT * FROM boc3_orders
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId]
      ),
      // Recent activity (all orders)
      query(
        `SELECT 'arbitration' as type, id, status, created_at, amount_paid FROM arbitration_enrollments WHERE user_id = $1
         UNION ALL
         SELECT 'tariff' as type, id, status, created_at, amount_paid FROM tariff_orders WHERE user_id = $1
         UNION ALL
         SELECT 'boc3' as type, id, status, created_at, amount_paid FROM boc3_orders WHERE user_id = $1
         UNION ALL
         SELECT 'bundle' as type, id, status, created_at, amount_paid FROM bundle_orders WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [userId]
      )
    ]);

    // Calculate service statuses
    const arbitrationData = arbitration.rows[0] || null;
    const tariffData = tariff.rows[0] || null;
    const boc3Data = boc3.rows[0] || null;

    const now = new Date();
    const arbitrationActive = arbitrationData &&
      arbitrationData.status === 'active' &&
      new Date(arbitrationData.expiry_date) > now;

    // Calculate upcoming renewals
    const renewals = [];
    if (arbitrationData && arbitrationData.expiry_date) {
      const expiryDate = new Date(arbitrationData.expiry_date);
      const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry <= 60 && daysUntilExpiry > 0) {
        renewals.push({
          service: 'Arbitration Program',
          expiry_date: arbitrationData.expiry_date,
          days_remaining: daysUntilExpiry
        });
      }
    }

    // Count active services
    let activeServices = 0;
    if (arbitrationActive) activeServices++;
    if (tariffData && tariffData.status === 'completed') activeServices++;
    if (boc3Data && (boc3Data.status === 'active' || boc3Data.status === 'filed')) activeServices++;

    res.json({
      success: true,
      data: {
        overview: {
          active_services: activeServices,
          total_possible: 3,
          upcoming_renewals: renewals.length
        },
        services: {
          arbitration: {
            active: arbitrationActive,
            status: arbitrationData?.status || 'none',
            enrolled_date: arbitrationData?.enrolled_date || null,
            expiry_date: arbitrationData?.expiry_date || null,
            document_url: arbitrationData?.document_url || null
          },
          tariff: {
            status: tariffData?.status || 'none',
            created_at: tariffData?.created_at || null,
            document_url: tariffData?.document_url || null
          },
          boc3: {
            active: boc3Data && ['active', 'filed'].includes(boc3Data.status),
            status: boc3Data?.status || 'none',
            filing_type: boc3Data?.filing_type || null,
            filed_date: boc3Data?.filed_date || null
          }
        },
        renewals,
        recent_activity: recentOrders.rows
      }
    });
  } catch (error) {
    console.error('Dashboard overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load dashboard data'
    });
  }
});

// Get all documents for user
router.get('/documents', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const [arbitrationDocs, tariffDocs, boc3Docs] = await Promise.all([
      query(
        `SELECT id, 'Arbitration Summary' as name, document_url, enrolled_date as created_at, expiry_date
         FROM arbitration_enrollments
         WHERE user_id = $1 AND document_url IS NOT NULL
         ORDER BY created_at DESC`,
        [userId]
      ),
      query(
        `SELECT id, 'Tariff Document' as name, document_url, created_at
         FROM tariff_orders
         WHERE user_id = $1 AND document_url IS NOT NULL AND status = 'completed'
         ORDER BY created_at DESC`,
        [userId]
      ),
      query(
        `SELECT id, 'BOC-3 Filing' as name, document_url, created_at
         FROM boc3_orders
         WHERE user_id = $1 AND document_url IS NOT NULL AND status IN ('completed', 'active', 'filed')
         ORDER BY created_at DESC`,
        [userId]
      )
    ]);

    const documents = [
      ...arbitrationDocs.rows.map(d => ({ ...d, type: 'arbitration' })),
      ...tariffDocs.rows.map(d => ({ ...d, type: 'tariff' })),
      ...boc3Docs.rows.map(d => ({ ...d, type: 'boc3' }))
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({
      success: true,
      data: { documents }
    });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load documents'
    });
  }
});

// Generate FMCSA required documents
router.get('/fmcsa-documents/:type', authenticateToken, async (req, res) => {
  try {
    const { type } = req.params;
    const user = req.user;

    let documentUrl;
    let filename;

    switch (type) {
      case 'rights-responsibilities':
        documentUrl = await generateRightsAndResponsibilitiesPDF(user);
        filename = `Rights-and-Responsibilities-${user.mc_number || 'document'}.pdf`;
        break;
      case 'ready-to-move':
        documentUrl = await generateReadyToMovePDF(user);
        filename = `Ready-to-Move-Guide-${user.mc_number || 'document'}.pdf`;
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid document type. Use: rights-responsibilities or ready-to-move'
        });
    }

    res.json({
      success: true,
      data: {
        document_url: documentUrl,
        filename: filename,
        type: type
      }
    });
  } catch (error) {
    console.error('Generate FMCSA document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate document'
    });
  }
});

// Get order history
router.get('/orders', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, limit = 20, offset = 0 } = req.query;

    let orders;

    if (type && type !== 'all') {
      // Specific order type
      const tableMap = {
        arbitration: 'arbitration_enrollments',
        tariff: 'tariff_orders',
        boc3: 'boc3_orders',
        bundle: 'bundle_orders'
      };

      const table = tableMap[type];
      if (!table) {
        return res.status(400).json({
          success: false,
          message: 'Invalid order type'
        });
      }

      orders = await query(
        `SELECT *, '${type}' as type FROM ${table}
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );
    } else {
      // All orders
      orders = await query(
        `SELECT 'arbitration' as type, id, status, created_at, amount_paid, 'Arbitration Program' as product FROM arbitration_enrollments WHERE user_id = $1
         UNION ALL
         SELECT 'tariff' as type, id, status, created_at, amount_paid, 'Tariff Publishing' as product FROM tariff_orders WHERE user_id = $1
         UNION ALL
         SELECT 'boc3' as type, id, status, created_at, amount_paid, 'BOC-3 Process Agent' as product FROM boc3_orders WHERE user_id = $1
         UNION ALL
         SELECT 'bundle' as type, id, status, created_at, amount_paid, bundle_type || ' Bundle' as product FROM bundle_orders WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );
    }

    res.json({
      success: true,
      data: { orders: orders.rows }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load orders'
    });
  }
});

// SSE endpoint for real-time updates
router.get('/events', authenticateToken, (req, res) => {
  const userId = req.user.id;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to real-time updates' })}\n\n`);

  // Store client connection
  const clientId = `${userId}-${Date.now()}`;
  sseClients.set(clientId, { userId, res });

  // Send keepalive every 30 seconds
  const keepalive = setInterval(() => {
    res.write(`:keepalive\n\n`);
  }, 30000);

  // Cleanup on close
  req.on('close', () => {
    clearInterval(keepalive);
    sseClients.delete(clientId);
  });
});

// Helper function to send SSE event to specific user
const sendSSEEvent = (userId, eventType, data) => {
  sseClients.forEach((client, clientId) => {
    if (client.userId === userId) {
      try {
        client.res.write(`data: ${JSON.stringify({ type: eventType, ...data })}\n\n`);
      } catch (error) {
        console.error('SSE send error:', error);
        sseClients.delete(clientId);
      }
    }
  });
};

// Export for use in other routes
module.exports = router;
module.exports.sendSSEEvent = sendSSEEvent;
