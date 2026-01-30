const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { sanitizeBody, formatMCNumber, formatUSDOT } = require('../middleware/validation');
const { sendOrderConfirmation, sendTariffDocumentReady, sendAdminPurchaseNotification } = require('../utils/email');
const { generateTariffPDF } = require('../utils/pdf');
const { generateServiceOrderId } = require('../utils/orderUtils');

const router = express.Router();

// Prices in cents
const PRICES = {
  TARIFF: 34999,           // $349.99
  BOC3: 100,               // $1.00 - TESTING PRICE
  BUNDLE_STARTUP: 49999,   // $499.99
  BUNDLE_ESSENTIALS: 22500, // $225.00
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
      payment_amount,
      rates
    } = req.body;


    // Require payment
    if (!payment_id) {
      return res.status(400).json({
        success: false,
        message: 'Payment is required to place this order'
      });
    }

    // Validate payment_id format - must come from payment API
    // Valid formats: 'sim_' (simulation from API), Square payment IDs, 'admin_created_' (admin bypass)
    const validPrefixes = ['sim_', 'admin_created_'];
    const isValidPrefix = validPrefixes.some(prefix => payment_id.startsWith(prefix));
    const isSquarePayment = /^[A-Za-z0-9]{20,}$/.test(payment_id); // Square IDs are alphanumeric

    if (!isValidPrefix && !isSquarePayment) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment. Please complete payment through the checkout form.'
      });
    }

    if (!payment_amount || payment_amount < 299) {
      return res.status(400).json({
        success: false,
        message: 'Valid payment amount is required'
      });
    }

    if (!pricing_method || !service_territory) {
      return res.status(400).json({
        success: false,
        message: 'Pricing method and service territory are required'
      });
    }

    // Store rates as JSON string in special_notes if no rates column exists
    const ratesJson = rates ? JSON.stringify(rates) : null;

    // Set enrollment and expiry dates (1 year validity)
    const enrolledDate = new Date();
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    // Generate unique order ID
    const orderId = generateServiceOrderId('tariff');

    const result = await query(
      `INSERT INTO tariff_orders
       (user_id, order_id, status, pricing_method, service_territory, accessorials, special_notes, payment_id, amount_paid, rates, enrolled_date, expiry_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        req.user.id,
        orderId,
        'pending',
        pricing_method,
        service_territory,
        JSON.stringify(accessorials || []),
        special_notes || null,
        payment_id,
        payment_amount || PRICES.TARIFF / 100,
        ratesJson,
        enrolledDate,
        expiryDate
      ]
    );

    let order = result.rows[0];
    // Attach rates to order object for PDF generation
    order.rates = rates;

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

    // Send admin notification
    sendAdminPurchaseNotification(req.user, 'tariff', order);

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

// Update tariff rates (regenerates PDF)
router.put('/tariff/:id/rates', authenticateToken, sanitizeBody, async (req, res) => {
  try {
    const { id } = req.params;
    const { rates } = req.body;

    if (!rates) {
      return res.status(400).json({
        success: false,
        message: 'Rates data is required'
      });
    }

    // Verify ownership
    const existingResult = await query(
      'SELECT * FROM tariff_orders WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tariff order not found'
      });
    }

    const existingOrder = existingResult.rows[0];

    // Check if expired
    if (existingOrder.expiry_date && new Date(existingOrder.expiry_date) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit an expired tariff. Please renew first.'
      });
    }

    // Update rates
    const ratesJson = JSON.stringify(rates);
    await query(
      `UPDATE tariff_orders SET rates = $1, updated_at = NOW() WHERE id = $2`,
      [ratesJson, id]
    );

    // Regenerate PDF
    try {
      const updatedOrder = { ...existingOrder, rates };
      const documentUrl = await generateTariffPDF(req.user, updatedOrder);

      await query(
        'UPDATE tariff_orders SET document_url = $1 WHERE id = $2',
        [documentUrl, id]
      );

      // Send notification email
      const { sendTariffUpdated } = require('../utils/email');
      await sendTariffUpdated(req.user, updatedOrder);

      res.json({
        success: true,
        message: 'Tariff rates updated and document regenerated',
        data: { document_url: documentUrl }
      });
    } catch (pdfError) {
      console.error('PDF regeneration error:', pdfError);
      res.json({
        success: true,
        message: 'Tariff rates updated but document regeneration failed. Please try again.',
        data: { document_url: existingOrder.document_url }
      });
    }
  } catch (error) {
    console.error('Update tariff rates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update tariff rates'
    });
  }
});

// Request pricing method change (requires admin approval)
router.post('/tariff/:id/request-method-change', authenticateToken, sanitizeBody, async (req, res) => {
  try {
    const { id } = req.params;
    const { requested_method } = req.body;

    if (!requested_method) {
      return res.status(400).json({
        success: false,
        message: 'Requested pricing method is required'
      });
    }

    const validMethods = ['weight', 'cubic', 'flat', 'mixed'];
    if (!validMethods.includes(requested_method)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pricing method'
      });
    }

    // Verify ownership
    const existingResult = await query(
      'SELECT * FROM tariff_orders WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tariff order not found'
      });
    }

    const existingOrder = existingResult.rows[0];

    // Check if already same method
    if (existingOrder.pricing_method === requested_method) {
      return res.status(400).json({
        success: false,
        message: 'This is already your current pricing method'
      });
    }

    // Check for existing pending request
    const pendingResult = await query(
      `SELECT id FROM pricing_method_requests
       WHERE tariff_id = $1 AND status = 'pending'`,
      [id]
    );

    if (pendingResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'You already have a pending pricing method change request'
      });
    }

    // Create request
    await query(
      `INSERT INTO pricing_method_requests
       (user_id, tariff_id, current_method, requested_method)
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, id, existingOrder.pricing_method, requested_method]
    );

    res.json({
      success: true,
      message: 'Pricing method change request submitted. An admin will review your request.'
    });
  } catch (error) {
    console.error('Request method change error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit request'
    });
  }
});

// Get tariff details (for editing)
router.get('/tariff/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT * FROM tariff_orders WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tariff order not found'
      });
    }

    const order = result.rows[0];

    // Parse rates if stored as string
    if (typeof order.rates === 'string') {
      try {
        order.rates = JSON.parse(order.rates);
      } catch (e) {
        order.rates = {};
      }
    }

    // Check for pending pricing method request
    const pendingRequest = await query(
      `SELECT * FROM pricing_method_requests
       WHERE tariff_id = $1 AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [id]
    );

    res.json({
      success: true,
      data: {
        order,
        pending_method_change: pendingRequest.rows[0] || null
      }
    });
  } catch (error) {
    console.error('Get tariff details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get tariff details'
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

    // Require payment
    if (!payment_id) {
      return res.status(400).json({
        success: false,
        message: 'Payment is required to place this order'
      });
    }

    // Validate payment_id format - must come from payment API
    // Valid formats: 'sim_' (simulation from API), Square payment IDs, 'admin_created_' (admin bypass)
    const validPrefixes = ['sim_', 'admin_created_'];
    const isValidPrefix = validPrefixes.some(prefix => payment_id.startsWith(prefix));
    const isSquarePayment = /^[A-Za-z0-9]{20,}$/.test(payment_id); // Square IDs are alphanumeric

    if (!isValidPrefix && !isSquarePayment) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment. Please complete payment through the checkout form.'
      });
    }

    if (!payment_amount || payment_amount < 0.99) {
      return res.status(400).json({
        success: false,
        message: 'Valid payment amount is required'
      });
    }

    if (!filing_type) {
      return res.status(400).json({
        success: false,
        message: 'Filing type is required'
      });
    }

    const validFilingTypes = ['new', 'new_authority', 'transfer', 'reinstatement'];
    if (!validFilingTypes.includes(filing_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid filing type. Must be: new, transfer, or reinstatement'
      });
    }

    // Set enrollment and expiry dates (1 year validity)
    const enrolledDate = new Date();
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    // Generate unique order ID
    const orderId = generateServiceOrderId('boc3');

    const result = await query(
      `INSERT INTO boc3_orders
       (user_id, order_id, status, filing_type, payment_id, amount_paid, enrolled_date, expiry_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.user.id,
        orderId,
        'pending',
        filing_type,
        payment_id,
        payment_amount || PRICES.BOC3 / 100,
        enrolledDate,
        expiryDate
      ]
    );

    const order = result.rows[0];

    // Send confirmation email
    try {
      await sendOrderConfirmation(req.user, order, 'boc3');
    } catch (emailError) {
      console.error('Email send error:', emailError);
    }

    // Send admin notification
    sendAdminPurchaseNotification(req.user, 'boc3', order);

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

// Create bundle order (with payment processing)
router.post('/bundles', authenticateToken, sanitizeBody, async (req, res) => {
  try {
    const {
      bundle_type,
      source_id,           // Square card token
      enable_autopay,
      boc3_filing_type,
      tariff_data,         // For startup bundle: { pricing_method, service_territory, rates }
      company_info         // { company_name, mc_number, usdot_number, email, phone, address, city, state, zip }
    } = req.body;

    // Validate bundle type
    const validBundleTypes = ['startup', 'essentials', 'renewal'];
    if (!validBundleTypes.includes(bundle_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid bundle type'
      });
    }

    // Require Square token
    if (!source_id) {
      return res.status(400).json({
        success: false,
        message: 'Payment card is required'
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

    // Process payment via Square
    const { processPayment, createCustomerAndSaveCard } = require('./payments');
    let paymentResult;
    let squareCustomerId = null;
    let savedCardId = null;
    let cardLast4 = null;
    let cardBrand = null;

    try {
      // If autopay enabled, create customer and save card first
      if (enable_autopay) {
        const customerResult = await createCustomerAndSaveCard(
          req.user.email,
          source_id,
          `${company_info?.company_name || req.user.company_name}`
        );

        if (customerResult.success) {
          squareCustomerId = customerResult.customerId;
          savedCardId = customerResult.cardId;
          cardLast4 = customerResult.card?.last4;
          cardBrand = customerResult.card?.cardBrand;

          // Process payment using saved card
          paymentResult = await processPayment(
            savedCardId,
            price,
            req.user.email,
            `Bundle: ${bundle_type}`,
            squareCustomerId
          );
        } else {
          throw new Error(customerResult.message || 'Failed to save card');
        }
      } else {
        // Process one-time payment
        paymentResult = await processPayment(
          source_id,
          price,
          req.user.email,
          `Bundle: ${bundle_type}`
        );
      }

      if (!paymentResult.success) {
        throw new Error(paymentResult.message || 'Payment failed');
      }
    } catch (paymentError) {
      console.error('Bundle payment error:', paymentError);
      return res.status(400).json({
        success: false,
        message: paymentError.message || 'Payment processing failed'
      });
    }

    const payment_id = paymentResult.payment_id;

    // Update user with autopay info if enabled
    if (enable_autopay && squareCustomerId && savedCardId) {
      await query(
        `UPDATE users SET
         square_customer_id = $1,
         autopay_enabled = true,
         autopay_card_id = $2,
         autopay_card_last4 = $3,
         autopay_card_brand = $4
         WHERE id = $5`,
        [squareCustomerId, savedCardId, cardLast4, cardBrand, req.user.id]
      );
    }

    // Generate unique order ID
    const bundleOrderId = generateServiceOrderId('bundle');

    // Set enrollment and expiry dates (1 year validity)
    const enrolledDate = new Date();
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    // Create bundle order
    const bundleResult = await query(
      `INSERT INTO bundle_orders
       (user_id, order_id, bundle_type, status, payment_id, amount_paid, enrolled_date, expiry_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.user.id, bundleOrderId, bundle_type, 'active', payment_id, price / 100, enrolledDate, expiryDate]
    );

    const bundleOrder = bundleResult.rows[0];
    const bundleId = bundleOrder.id;

    // Create associated service orders based on bundle type
    const createdServices = [];

    // All bundles include Arbitration
    const arbitrationOrderId = generateServiceOrderId('arbitration');
    const arbitrationResult = await query(
      `INSERT INTO arbitration_enrollments
       (user_id, order_id, bundle_id, status, enrolled_date, expiry_date, payment_id, amount_paid)
       VALUES ($1, $2, $3, 'active', $4, $5, $6, 0)
       RETURNING *`,
      [req.user.id, arbitrationOrderId, bundleId, enrolledDate, expiryDate, payment_id]
    );
    createdServices.push({ type: 'arbitration', data: arbitrationResult.rows[0] });

    // All bundles include BOC-3
    const boc3OrderId = generateServiceOrderId('boc3');
    const boc3Result = await query(
      `INSERT INTO boc3_orders
       (user_id, order_id, bundle_id, status, filing_type, payment_id, amount_paid, enrolled_date, expiry_date)
       VALUES ($1, $2, $3, 'pending', $4, $5, 0, $6, $7)
       RETURNING *`,
      [req.user.id, boc3OrderId, bundleId, boc3_filing_type || 'new', payment_id, enrolledDate, expiryDate]
    );
    createdServices.push({ type: 'boc3', data: boc3Result.rows[0] });

    // Startup bundle includes Tariff
    if (bundle_type === 'startup' && tariff_data) {
      const tariffOrderId = generateServiceOrderId('tariff');
      const ratesJson = tariff_data.rates ? JSON.stringify(tariff_data.rates) : null;

      const tariffResult = await query(
        `INSERT INTO tariff_orders
         (user_id, order_id, bundle_id, status, pricing_method, service_territory, rates, payment_id, amount_paid, enrolled_date, expiry_date)
         VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, 0, $8, $9)
         RETURNING *`,
        [
          req.user.id,
          tariffOrderId,
          bundleId,
          tariff_data.pricing_method || 'weight',
          tariff_data.service_territory || 'nationwide',
          ratesJson,
          payment_id,
          enrolledDate,
          expiryDate
        ]
      );

      let tariffOrder = tariffResult.rows[0];
      tariffOrder.rates = tariff_data.rates;

      // Generate Tariff PDF immediately
      try {
        console.log('Generating tariff PDF for bundle order:', tariffOrder.id);
        const documentUrl = await generateTariffPDF(req.user, tariffOrder);

        // Update order with document URL and mark as completed
        await query(
          `UPDATE tariff_orders
           SET document_url = $1, status = 'completed', updated_at = NOW()
           WHERE id = $2`,
          [documentUrl, tariffOrder.id]
        );

        tariffOrder.document_url = documentUrl;
        tariffOrder.status = 'completed';
        console.log('Tariff PDF generated successfully:', documentUrl);
      } catch (pdfError) {
        console.error('Tariff PDF generation error:', pdfError);
      }

      createdServices.push({ type: 'tariff', data: tariffOrder });
    }

    // Send confirmation email
    try {
      await sendOrderConfirmation(req.user, bundleOrder, 'bundle');
    } catch (emailError) {
      console.error('Email send error:', emailError);
    }

    // Send admin notification
    sendAdminPurchaseNotification(req.user, 'bundle', bundleOrder);

    res.status(201).json({
      success: true,
      message: 'Bundle purchased successfully',
      data: {
        order_id: bundleOrderId,
        bundle: bundleOrder,
        services: createdServices,
        autopay_enabled: enable_autopay && !!savedCardId
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

// Get bundle with associated services
router.get('/bundles/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get bundle
    const bundleResult = await query(
      'SELECT * FROM bundle_orders WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (bundleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bundle not found'
      });
    }

    const bundle = bundleResult.rows[0];

    // Get associated services
    const [arbitration, boc3, tariff] = await Promise.all([
      query('SELECT * FROM arbitration_enrollments WHERE bundle_id = $1', [id]),
      query('SELECT * FROM boc3_orders WHERE bundle_id = $1', [id]),
      query('SELECT * FROM tariff_orders WHERE bundle_id = $1', [id])
    ]);

    res.json({
      success: true,
      data: {
        bundle,
        services: {
          arbitration: arbitration.rows[0] || null,
          boc3: boc3.rows[0] || null,
          tariff: tariff.rows[0] || null
        }
      }
    });
  } catch (error) {
    console.error('Get bundle error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get bundle'
    });
  }
});

// Renew bundle (all services at discounted price)
router.post('/bundles/:id/renew', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { source_id } = req.body;

    // Get existing bundle
    const bundleResult = await query(
      'SELECT * FROM bundle_orders WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (bundleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bundle not found'
      });
    }

    const existingBundle = bundleResult.rows[0];

    // Process renewal payment (always $179 for renewals)
    const { processPayment } = require('./payments');
    let paymentResult;

    // Check if user has autopay enabled
    const userResult = await query(
      'SELECT autopay_enabled, autopay_card_id, square_customer_id FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = userResult.rows[0];

    if (user.autopay_enabled && user.autopay_card_id && !source_id) {
      // Use saved card for autopay
      paymentResult = await processPayment(
        user.autopay_card_id,
        PRICES.BUNDLE_RENEWAL,
        req.user.email,
        `Bundle Renewal: ${existingBundle.bundle_type}`,
        user.square_customer_id
      );
    } else if (source_id) {
      // Use provided card token
      paymentResult = await processPayment(
        source_id,
        PRICES.BUNDLE_RENEWAL,
        req.user.email,
        `Bundle Renewal: ${existingBundle.bundle_type}`
      );
    } else {
      return res.status(400).json({
        success: false,
        message: 'Payment card is required for renewal'
      });
    }

    if (!paymentResult.success) {
      return res.status(400).json({
        success: false,
        message: paymentResult.message || 'Payment failed'
      });
    }

    // Extend expiry dates on bundle and all associated services
    const newExpiryDate = new Date();
    newExpiryDate.setFullYear(newExpiryDate.getFullYear() + 1);

    // Update bundle
    await query(
      'UPDATE bundle_orders SET expiry_date = $1, updated_at = NOW() WHERE id = $2',
      [newExpiryDate, id]
    );

    // Update associated services
    await Promise.all([
      query('UPDATE arbitration_enrollments SET expiry_date = $1, updated_at = NOW() WHERE bundle_id = $2', [newExpiryDate, id]),
      query('UPDATE boc3_orders SET expiry_date = $1, updated_at = NOW() WHERE bundle_id = $2', [newExpiryDate, id]),
      query('UPDATE tariff_orders SET expiry_date = $1, updated_at = NOW() WHERE bundle_id = $2', [newExpiryDate, id])
    ]);

    res.json({
      success: true,
      message: 'Bundle renewed successfully',
      data: {
        new_expiry_date: newExpiryDate,
        amount_paid: PRICES.BUNDLE_RENEWAL / 100
      }
    });
  } catch (error) {
    console.error('Renew bundle error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to renew bundle'
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
