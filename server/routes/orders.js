const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { sanitizeBody, formatMCNumber, formatUSDOT } = require('../middleware/validation');
const { sendOrderConfirmation, sendTariffDocumentReady } = require('../utils/email');
const { generateTariffPDF } = require('../utils/pdf');

const router = express.Router();

// Prices in cents
const PRICES = {
  TARIFF: 29900,           // $299.00
  BOC3: 9900,              // $99.00
  BUNDLE_STARTUP: 44900,   // $449.00
  BUNDLE_ESSENTIALS: 24900, // $249.00
  BUNDLE_RENEWAL: 17900    // $179.00
};

// ==================== TARIFF ORDERS ====================

// Get user's tariff orders
router.get('/tariff', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM tariff_orders
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: { orders: result.rows }
    });
  } catch (error) {
    console.error('Get tariff orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get tariff orders'
    });
  }
});

// Create tariff order
router.post('/tariff', authenticateToken, sanitizeBody, async (req, res) => {
  try {
    const {
      pricing_method,
      service_territory,
      accessorials,
      special_notes,
      payment_id,
      payment_amount
    } = req.body;

    if (!pricing_method || !service_territory) {
      return res.status(400).json({
        success: false,
        message: 'Pricing method and service territory are required'
      });
    }

    const result = await query(
      `INSERT INTO tariff_orders
       (user_id, status, pricing_method, service_territory, accessorials, special_notes, payment_id, amount_paid)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.user.id,
        'pending',
        pricing_method,
        service_territory,
        JSON.stringify(accessorials || []),
        special_notes || null,
        payment_id,
        payment_amount || PRICES.TARIFF / 100
      ]
    );

    let order = result.rows[0];

    // Generate Tariff PDF immediately
    try {
      console.log('Generating tariff PDF for order:', order.id);
      const documentUrl = await generateTariffPDF(req.user, order);

      // Update order with document URL and mark as completed
      const updateResult = await query(
        `UPDATE tariff_orders
         SET document_url = $1, status = $2, updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [documentUrl, 'completed', order.id]
      );

      order = updateResult.rows[0];
      console.log('Tariff PDF generated successfully:', documentUrl);

      // Send document ready email
      try {
        await sendTariffDocumentReady(req.user, order);
      } catch (emailError) {
        console.error('Document ready email error:', emailError);
      }
    } catch (pdfError) {
      console.error('Tariff PDF generation error:', pdfError);
      // Order still created, but document generation failed
      // Send regular confirmation email
      try {
        await sendOrderConfirmation(req.user, order, 'tariff');
      } catch (emailError) {
        console.error('Email send error:', emailError);
      }
    }

    res.status(201).json({
      success: true,
      message: order.status === 'completed'
        ? 'Tariff order completed - document ready for download'
        : 'Tariff order placed successfully',
      data: { order }
    });
  } catch (error) {
    console.error('Create tariff order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create tariff order'
    });
  }
});

// ==================== BOC-3 ORDERS ====================

// Get user's BOC-3 orders
router.get('/boc3', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM boc3_orders
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    // Check for active BOC-3
    const activeOrder = result.rows.find(order =>
      order.status === 'active' || order.status === 'filed'
    );

    res.json({
      success: true,
      data: {
        orders: result.rows,
        hasActive: !!activeOrder
      }
    });
  } catch (error) {
    console.error('Get BOC-3 orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get BOC-3 orders'
    });
  }
});

// Create BOC-3 order
router.post('/boc3', authenticateToken, sanitizeBody, async (req, res) => {
  try {
    const {
      filing_type,
      payment_id,
      payment_amount
    } = req.body;

    if (!filing_type) {
      return res.status(400).json({
        success: false,
        message: 'Filing type is required'
      });
    }

    const validFilingTypes = ['new', 'transfer', 'reinstatement'];
    if (!validFilingTypes.includes(filing_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid filing type. Must be: new, transfer, or reinstatement'
      });
    }

    const result = await query(
      `INSERT INTO boc3_orders
       (user_id, status, filing_type, payment_id, amount_paid)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        req.user.id,
        'pending',
        filing_type,
        payment_id,
        payment_amount || PRICES.BOC3 / 100
      ]
    );

    const order = result.rows[0];

    // Send confirmation email
    try {
      await sendOrderConfirmation(req.user, order, 'boc3');
    } catch (emailError) {
      console.error('Email send error:', emailError);
    }

    res.status(201).json({
      success: true,
      message: 'BOC-3 order placed successfully',
      data: { order }
    });
  } catch (error) {
    console.error('Create BOC-3 order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create BOC-3 order'
    });
  }
});

// ==================== BUNDLE ORDERS ====================

// Get user's bundle orders
router.get('/bundles', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM bundle_orders
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: { orders: result.rows }
    });
  } catch (error) {
    console.error('Get bundle orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get bundle orders'
    });
  }
});

// Create bundle order
router.post('/bundles', authenticateToken, sanitizeBody, async (req, res) => {
  try {
    const {
      bundle_type,
      payment_id,
      payment_amount,
      // Additional data for included services
      tariff_data,
      boc3_data
    } = req.body;

    const validBundleTypes = ['startup', 'essentials', 'renewal'];
    if (!validBundleTypes.includes(bundle_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid bundle type'
      });
    }

    // Get appropriate price
    let price;
    switch (bundle_type) {
      case 'startup':
        price = PRICES.BUNDLE_STARTUP;
        break;
      case 'essentials':
        price = PRICES.BUNDLE_ESSENTIALS;
        break;
      case 'renewal':
        price = PRICES.BUNDLE_RENEWAL;
        break;
    }

    // Create bundle order
    const bundleResult = await query(
      `INSERT INTO bundle_orders
       (user_id, bundle_type, status, payment_id, amount_paid)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, bundle_type, 'pending', payment_id, payment_amount || price / 100]
    );

    const bundleOrder = bundleResult.rows[0];

    // Create associated service orders based on bundle type
    const createdServices = [];

    // All bundles include Arbitration
    const enrolledDate = new Date();
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    const arbitrationResult = await query(
      `INSERT INTO arbitration_enrollments
       (user_id, status, enrolled_date, expiry_date, payment_id, amount_paid)
       VALUES ($1, 'active', $2, $3, $4, 0)
       RETURNING *`,
      [req.user.id, enrolledDate, expiryDate, payment_id]
    );
    createdServices.push({ type: 'arbitration', data: arbitrationResult.rows[0] });

    // Bundles that include BOC-3
    if (['startup', 'essentials', 'renewal'].includes(bundle_type)) {
      const boc3Result = await query(
        `INSERT INTO boc3_orders
         (user_id, status, filing_type, payment_id, amount_paid)
         VALUES ($1, 'pending', $2, $3, 0)
         RETURNING *`,
        [req.user.id, boc3_data?.filing_type || 'new', payment_id]
      );
      createdServices.push({ type: 'boc3', data: boc3Result.rows[0] });
    }

    // Startup bundle includes Tariff
    if (bundle_type === 'startup') {
      const tariffResult = await query(
        `INSERT INTO tariff_orders
         (user_id, status, pricing_method, service_territory, accessorials, payment_id, amount_paid)
         VALUES ($1, 'pending', $2, $3, $4, $5, 0)
         RETURNING *`,
        [
          req.user.id,
          tariff_data?.pricing_method || 'weight',
          tariff_data?.service_territory || 'nationwide',
          JSON.stringify(tariff_data?.accessorials || []),
          payment_id
        ]
      );
      createdServices.push({ type: 'tariff', data: tariffResult.rows[0] });
    }

    // Send confirmation email
    try {
      await sendOrderConfirmation(req.user, bundleOrder, 'bundle');
    } catch (emailError) {
      console.error('Email send error:', emailError);
    }

    res.status(201).json({
      success: true,
      message: 'Bundle order placed successfully',
      data: {
        bundle: bundleOrder,
        services: createdServices
      }
    });
  } catch (error) {
    console.error('Create bundle order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create bundle order'
    });
  }
});

// ==================== ALL ORDERS ====================

// Get all orders for user
router.get('/all', authenticateToken, async (req, res) => {
  try {
    const [tariffs, boc3s, bundles, enrollments] = await Promise.all([
      query('SELECT *, \'tariff\' as type FROM tariff_orders WHERE user_id = $1', [req.user.id]),
      query('SELECT *, \'boc3\' as type FROM boc3_orders WHERE user_id = $1', [req.user.id]),
      query('SELECT *, \'bundle\' as type FROM bundle_orders WHERE user_id = $1', [req.user.id]),
      query('SELECT *, \'arbitration\' as type FROM arbitration_enrollments WHERE user_id = $1', [req.user.id])
    ]);

    // Combine and sort by date
    const allOrders = [
      ...tariffs.rows,
      ...boc3s.rows,
      ...bundles.rows,
      ...enrollments.rows
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({
      success: true,
      data: { orders: allOrders }
    });
  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get orders'
    });
  }
});

module.exports = router;
