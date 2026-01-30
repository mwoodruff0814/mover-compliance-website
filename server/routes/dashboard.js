const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { generateRightsAndResponsibilitiesPDF, generateReadyToMovePDF, generateArbitrationPDF, generateArbitrationConsumerPDF, generateTariffPDF, generateCarrierArbitrationInfoPDF } = require('../utils/pdf');

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

    // Calculate upcoming renewals for all services
    const renewals = [];

    // Check arbitration expiry
    if (arbitrationData && arbitrationData.expiry_date) {
      const expiryDate = new Date(arbitrationData.expiry_date);
      const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry <= 60 && daysUntilExpiry > 0) {
        renewals.push({
          service: 'Arbitration Program',
          service_type: 'arbitration',
          service_id: arbitrationData.id,
          expiry_date: arbitrationData.expiry_date,
          days_remaining: daysUntilExpiry
        });
      }
    }

    // Check tariff expiry
    if (tariffData && tariffData.expiry_date) {
      const expiryDate = new Date(tariffData.expiry_date);
      const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry <= 60 && daysUntilExpiry > 0) {
        renewals.push({
          service: 'Tariff Publishing',
          service_type: 'tariff',
          service_id: tariffData.id,
          expiry_date: tariffData.expiry_date,
          days_remaining: daysUntilExpiry
        });
      }
    }

    // Check BOC-3 expiry
    if (boc3Data && boc3Data.expiry_date) {
      const expiryDate = new Date(boc3Data.expiry_date);
      const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry <= 60 && daysUntilExpiry > 0) {
        renewals.push({
          service: 'BOC-3 Process Agent',
          service_type: 'boc3',
          service_id: boc3Data.id,
          expiry_date: boc3Data.expiry_date,
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
            id: arbitrationData?.id || null,
            active: arbitrationActive,
            status: arbitrationData?.status || 'none',
            enrolled_date: arbitrationData?.enrolled_date || null,
            expiry_date: arbitrationData?.expiry_date || null,
            document_url: arbitrationActive ? '/api/dashboard/download/arbitration-certificate' : null
          },
          tariff: {
            id: tariffData?.id || null,
            active: tariffData && tariffData.status === 'completed' && (!tariffData.expiry_date || new Date(tariffData.expiry_date) > now),
            status: tariffData?.status || 'none',
            enrolled_date: tariffData?.enrolled_date || tariffData?.created_at || null,
            expiry_date: tariffData?.expiry_date || null,
            document_url: tariffData?.status === 'completed' ? '/api/dashboard/download/tariff' : null,
            pricing_method: tariffData?.pricing_method || null
          },
          boc3: {
            id: boc3Data?.id || null,
            active: boc3Data && ['active', 'filed'].includes(boc3Data.status) && (!boc3Data.expiry_date || new Date(boc3Data.expiry_date) > now),
            status: boc3Data?.status || 'none',
            filing_type: boc3Data?.filing_type || null,
            filed_date: boc3Data?.filed_date || null,
            enrolled_date: boc3Data?.enrolled_date || null,
            expiry_date: boc3Data?.expiry_date || null
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

// Get all documents for user (generates missing documents automatically)
router.get('/documents', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = req.user;

    // Get all services (including those without documents)
    const [arbitrationDocs, tariffDocs, boc3Docs] = await Promise.all([
      query(
        `SELECT id, document_url, documents, enrolled_date as created_at, expiry_date
         FROM arbitration_enrollments
         WHERE user_id = $1 AND status = 'active'
         ORDER BY created_at DESC`,
        [userId]
      ),
      query(
        `SELECT id, 'Tariff Document' as name, document_url, created_at, enrolled_date, expiry_date, rates, pricing_method
         FROM tariff_orders
         WHERE user_id = $1 AND status = 'completed'
         ORDER BY created_at DESC`,
        [userId]
      ),
      query(
        `SELECT id, 'BOC-3 Filing' as name, document_url, created_at
         FROM boc3_orders
         WHERE user_id = $1 AND status IN ('completed', 'active', 'filed')
         ORDER BY created_at DESC`,
        [userId]
      )
    ]);

    // Build document list with on-demand download URLs (generates fresh PDFs each download)
    const expandedArbDocs = [];
    for (const arb of arbitrationDocs.rows) {
      // All arbitration documents use on-demand generation
      expandedArbDocs.push({
        id: `arb-${arb.id}-cert`,
        name: 'Arbitration Enrollment Certificate',
        document_url: '/api/dashboard/download/arbitration-certificate',
        created_at: arb.created_at,
        expiry_date: arb.expiry_date,
        type: 'arbitration'
      });
      expandedArbDocs.push({
        id: `arb-${arb.id}-consumer`,
        name: 'Consumer Arbitration Document',
        document_url: '/api/dashboard/download/arbitration-consumer',
        created_at: arb.created_at,
        type: 'arbitration'
      });
      expandedArbDocs.push({
        id: `arb-${arb.id}-carrier`,
        name: 'Carrier Program Information',
        document_url: '/api/dashboard/download/carrier-info',
        created_at: arb.created_at,
        type: 'arbitration'
      });
      expandedArbDocs.push({
        id: `arb-${arb.id}-rtm`,
        name: 'Ready to Move Brochure',
        document_url: '/api/dashboard/download/ready-to-move',
        created_at: arb.created_at,
        type: 'arbitration'
      });
      expandedArbDocs.push({
        id: `arb-${arb.id}-rr`,
        name: 'Your Rights and Responsibilities',
        document_url: '/api/dashboard/download/rights-responsibilities',
        created_at: arb.created_at,
        type: 'arbitration'
      });
    }

    // Tariff documents use on-demand generation
    const expandedTariffDocs = [];
    for (const tariff of tariffDocs.rows) {
      expandedTariffDocs.push({
        id: tariff.id,
        name: 'Tariff Document',
        document_url: '/api/dashboard/download/tariff',
        created_at: tariff.created_at,
        type: 'tariff'
      });
    }

    // BOC-3 docs still use stored URLs (uploaded by admin, not generated)
    const documents = [
      ...expandedArbDocs,
      ...expandedTariffDocs,
      ...boc3Docs.rows.filter(d => d.document_url).map(d => ({ ...d, type: 'boc3' }))
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

// On-demand document download - generates PDF fresh each time (handles Render's ephemeral filesystem)
router.get('/download/:docType', authenticateToken, async (req, res) => {
  try {
    const { docType } = req.params;
    const user = req.user;
    const userId = user.id;

    let pdfBuffer;
    let filename;

    // Get enrollment/order data
    const arbResult = await query(
      'SELECT * FROM arbitration_enrollments WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
      [userId, 'active']
    );
    const tariffResult = await query(
      'SELECT * FROM tariff_orders WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
      [userId, 'completed']
    );

    const enrollment = arbResult.rows[0];
    const tariffOrder = tariffResult.rows[0];

    switch (docType) {
      case 'arbitration-certificate':
        if (!enrollment) return res.status(404).json({ success: false, message: 'No active arbitration enrollment found' });
        pdfBuffer = await generateArbitrationPDF(user, enrollment, true);
        filename = `Arbitration-Certificate-${user.mc_number || 'document'}.pdf`;
        break;

      case 'arbitration-consumer':
        if (!enrollment) return res.status(404).json({ success: false, message: 'No active arbitration enrollment found' });
        pdfBuffer = await generateArbitrationConsumerPDF(user, enrollment, true);
        filename = `Consumer-Arbitration-Document-${user.mc_number || 'document'}.pdf`;
        break;

      case 'carrier-info':
        pdfBuffer = await generateCarrierArbitrationInfoPDF(user, true);
        filename = `Carrier-Program-Information-${user.mc_number || 'document'}.pdf`;
        break;

      case 'ready-to-move':
        pdfBuffer = await generateReadyToMovePDF(user, true);
        filename = `Ready-to-Move-${user.mc_number || 'document'}.pdf`;
        break;

      case 'rights-responsibilities':
        pdfBuffer = await generateRightsAndResponsibilitiesPDF(user, true);
        filename = `Rights-and-Responsibilities-${user.mc_number || 'document'}.pdf`;
        break;

      case 'tariff':
        if (!tariffOrder) return res.status(404).json({ success: false, message: 'No completed tariff order found' });
        pdfBuffer = await generateTariffPDF(user, tariffOrder, true);
        filename = `Tariff-${user.mc_number || 'document'}.pdf`;
        break;

      default:
        return res.status(400).json({ success: false, message: 'Invalid document type' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate document' });
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

// ==================== NOTIFICATIONS ====================

// Get user notifications
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, unread_only = false } = req.query;

    let queryText = `
      SELECT * FROM notifications
      WHERE user_id = $1
      ${unread_only === 'true' ? 'AND read = false' : ''}
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await query(queryText, [userId, limit]);

    // Get unread count
    const countResult = await query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read = false',
      [userId]
    );

    res.json({
      success: true,
      data: {
        notifications: result.rows,
        unread_count: parseInt(countResult.rows[0].count)
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load notifications'
    });
  }
});

// Mark notification as read
router.post('/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await query(
      `UPDATE notifications
       SET read = true
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      data: { notification: result.rows[0] }
    });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notification'
    });
  }
});

// Mark all notifications as read
router.post('/notifications/read-all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    await query(
      'UPDATE notifications SET read = true WHERE user_id = $1',
      [userId]
    );

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notifications'
    });
  }
});

// ==================== SERVICE HISTORY ====================

// Get expired/inactive services (history)
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date().toISOString();

    const [expiredArbitration, expiredTariff, expiredBoc3] = await Promise.all([
      query(
        `SELECT id, 'arbitration' as type, 'Arbitration Program' as name, status, enrolled_date, expiry_date, document_url, created_at
         FROM arbitration_enrollments
         WHERE user_id = $1 AND (expiry_date < $2 OR status = 'expired')
         ORDER BY expiry_date DESC`,
        [userId, now]
      ),
      query(
        `SELECT id, 'tariff' as type, 'Tariff Publishing' as name, status, enrolled_date, expiry_date, document_url, created_at
         FROM tariff_orders
         WHERE user_id = $1 AND (expiry_date < $2 OR status = 'expired')
         ORDER BY expiry_date DESC`,
        [userId, now]
      ),
      query(
        `SELECT id, 'boc3' as type, 'BOC-3 Process Agent' as name, status, enrolled_date, expiry_date, document_url, created_at
         FROM boc3_orders
         WHERE user_id = $1 AND (expiry_date < $2 OR status = 'expired')
         ORDER BY expiry_date DESC`,
        [userId, now]
      )
    ]);

    const history = [
      ...expiredArbitration.rows,
      ...expiredTariff.rows,
      ...expiredBoc3.rows
    ].sort((a, b) => new Date(b.expiry_date || b.created_at) - new Date(a.expiry_date || a.created_at));

    res.json({
      success: true,
      data: { history }
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load service history'
    });
  }
});

// Export for use in other routes
module.exports = router;
module.exports.sendSSEEvent = sendSSEEvent;
