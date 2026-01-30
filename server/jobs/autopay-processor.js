const { query } = require('../config/database');
const { sendAutopaySuccess, sendAutopayFailed } = require('../utils/email');
const { generateTariffPDF, generateArbitrationPDF } = require('../utils/pdf');

// Square SDK setup
let paymentsApi = null;
let customersApi = null;

const initSquare = () => {
  if (paymentsApi) return;

  const { SquareClient, SquareEnvironment } = require('square');

  const squareClient = new SquareClient({
    token: process.env.SQUARE_ACCESS_TOKEN,
    environment: process.env.SQUARE_ENVIRONMENT === 'production'
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox
  });

  paymentsApi = squareClient.payments;
  customersApi = squareClient.customers;
};

// Service prices in cents (individual services renew at full price)
const PRICES = {
  arbitration: 14999,      // $149.99
  tariff: 34999,           // $349.99
  boc3: 10999              // $109.99
};

// Bundle renewal prices (discounted from first-year rates)
const BUNDLE_RENEWAL_PRICES = {
  startup: 29999,          // $299.99 for Startup Bundle renewal
  essentials: 17900        // $179.00 for Essentials Bundle renewal
};

const SERVICE_NAMES = {
  arbitration: 'Arbitration Program',
  tariff: 'Tariff Publishing',
  boc3: 'BOC-3 Process Agent',
  bundle: 'Compliance Bundle'
};

const BUNDLE_NAMES = {
  startup: 'Startup Bundle',
  essentials: 'Essentials Bundle'
};

/**
 * Process autopay renewals for services expiring soon
 */
const processAutopay = async () => {
  console.log('[Autopay Processor] Starting...');

  // Process services expiring in 3 days or less that have autopay enabled
  const now = new Date();
  const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const formatDate = (d) => d.toISOString().split('T')[0];

  try {
    initSquare();

    // Process bundles first (they renew all contained services at discounted price)
    await processBundleAutopay(formatDate(now), formatDate(in3Days));

    // Then process individual services (skip those that belong to bundles)
    await processServiceAutopay('arbitration_enrollments', 'arbitration', formatDate(now), formatDate(in3Days));
    await processServiceAutopay('tariff_orders', 'tariff', formatDate(now), formatDate(in3Days));
    await processServiceAutopay('boc3_orders', 'boc3', formatDate(now), formatDate(in3Days));

    console.log('[Autopay Processor] Completed');
  } catch (error) {
    console.error('[Autopay Processor] Error:', error);
    throw error;
  }
};

/**
 * Process autopay for bundles
 */
const processBundleAutopay = async (startDate, endDate) => {
  console.log('[Autopay Processor] Processing bundles...');

  // Find bundles expiring between now and 3 days with autopay enabled
  const bundles = await query(`
    SELECT b.*, u.id as user_id, u.email, u.contact_name, u.company_name,
           u.mc_number, u.usdot_number, u.phone, u.address, u.city, u.state, u.zip,
           u.square_customer_id, u.autopay_card_id, u.autopay_card_last4, u.autopay_card_brand
    FROM bundle_orders b
    JOIN users u ON b.user_id = u.id
    WHERE b.expiry_date BETWEEN $1 AND $2
      AND b.status NOT IN ('expired', 'cancelled')
      AND u.autopay_enabled = true
      AND u.autopay_card_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.service_type = 'bundle' AND n.service_id = b.id AND n.type = 'autopay_processed'
      )
  `, [startDate, endDate]);

  for (const bundle of bundles.rows) {
    // Determine renewal price based on bundle type
    const bundleType = bundle.bundle_type || 'essentials';
    const price = BUNDLE_RENEWAL_PRICES[bundleType] || BUNDLE_RENEWAL_PRICES.essentials;
    const bundleName = BUNDLE_NAMES[bundleType] || 'Compliance Bundle';

    console.log(`[Autopay Processor] Processing ${bundleName} #${bundle.id} for user ${bundle.user_id} at $${(price/100).toFixed(2)}`);

    const user = {
      id: bundle.user_id,
      email: bundle.email,
      contact_name: bundle.contact_name,
      company_name: bundle.company_name,
      mc_number: bundle.mc_number,
      usdot_number: bundle.usdot_number,
      phone: bundle.phone,
      address: bundle.address,
      city: bundle.city,
      state: bundle.state,
      zip: bundle.zip
    };

    try {
      // Process payment with Square
      const paymentResult = await chargeStoredCard(
        bundle.square_customer_id,
        bundle.autopay_card_id,
        price,
        `${bundleName} renewal for ${bundle.company_name}`
      );

      if (paymentResult.success) {
        // Calculate new expiry date (1 year from current expiry)
        const newExpiryDate = new Date(bundle.expiry_date);
        newExpiryDate.setFullYear(newExpiryDate.getFullYear() + 1);

        // Update bundle with new expiry date
        await query(`
          UPDATE bundle_orders
          SET expiry_date = $1, updated_at = NOW()
          WHERE id = $2
        `, [newExpiryDate, bundle.id]);

        // Update all associated services with new expiry date
        await Promise.all([
          query('UPDATE arbitration_enrollments SET expiry_date = $1, updated_at = NOW() WHERE bundle_id = $2', [newExpiryDate, bundle.id]),
          query('UPDATE tariff_orders SET expiry_date = $1, updated_at = NOW() WHERE bundle_id = $2', [newExpiryDate, bundle.id]),
          query('UPDATE boc3_orders SET expiry_date = $1, updated_at = NOW() WHERE bundle_id = $2', [newExpiryDate, bundle.id])
        ]);

        // Regenerate documents for tariff and arbitration
        const tariffResult = await query('SELECT * FROM tariff_orders WHERE bundle_id = $1', [bundle.id]);
        if (tariffResult.rows.length > 0) {
          const tariff = tariffResult.rows[0];
          const updatedTariff = { ...tariff, expiry_date: newExpiryDate };
          try {
            const documentUrl = await generateTariffPDF(user, updatedTariff);
            await query('UPDATE tariff_orders SET document_url = $1 WHERE id = $2', [documentUrl, tariff.id]);
          } catch (e) {
            console.error('[Autopay Processor] Failed to regenerate tariff PDF:', e);
          }
        }

        const arbResult = await query('SELECT * FROM arbitration_enrollments WHERE bundle_id = $1', [bundle.id]);
        if (arbResult.rows.length > 0) {
          const arb = arbResult.rows[0];
          const updatedArb = { ...arb, expiry_date: newExpiryDate };
          try {
            const documentUrl = await generateArbitrationPDF(user, updatedArb);
            await query('UPDATE arbitration_enrollments SET document_url = $1 WHERE id = $2', [documentUrl, arb.id]);
          } catch (e) {
            console.error('[Autopay Processor] Failed to regenerate arbitration PDF:', e);
          }
        }

        // Create success notification
        await query(`
          INSERT INTO notifications (user_id, type, service_type, service_id, message, email_sent)
          VALUES ($1, $2, $3, $4, $5, true)
        `, [
          bundle.user_id,
          'autopay_processed',
          'bundle',
          bundle.id,
          `Your ${bundleName} has been renewed. New expiration: ${newExpiryDate.toLocaleDateString()}`
        ]);

        // Send success email
        await sendAutopaySuccess(user, bundleName, price, newExpiryDate, bundle.autopay_card_last4);

        console.log(`[Autopay Processor] Successfully renewed ${bundleName} #${bundle.id}`);
      } else {
        throw new Error(paymentResult.error || 'Payment failed');
      }
    } catch (error) {
      console.error(`[Autopay Processor] Failed to process bundle #${bundle.id}:`, error);

      // Create failure notification
      await query(`
        INSERT INTO notifications (user_id, type, service_type, service_id, message, email_sent)
        VALUES ($1, $2, $3, $4, $5, true)
      `, [
        bundle.user_id,
        'autopay_failed',
        'bundle',
        bundle.id,
        `Failed to renew ${bundleName}: ${error.message}`
      ]);

      // Send failure email
      await sendAutopayFailed(user, bundleName, error.message, bundle.expiry_date);
    }
  }
};

/**
 * Process autopay for a specific service type
 */
const processServiceAutopay = async (table, serviceType, startDate, endDate) => {
  console.log(`[Autopay Processor] Processing ${serviceType}...`);

  const serviceName = SERVICE_NAMES[serviceType];
  const price = PRICES[serviceType];

  // Find services expiring between now and 3 days with autopay enabled
  // Skip services that belong to a bundle (they're renewed with the bundle)
  const services = await query(`
    SELECT s.*, u.id as user_id, u.email, u.contact_name, u.company_name,
           u.mc_number, u.usdot_number, u.phone, u.address, u.city, u.state, u.zip,
           u.square_customer_id, u.autopay_card_id, u.autopay_card_last4, u.autopay_card_brand
    FROM ${table} s
    JOIN users u ON s.user_id = u.id
    WHERE s.expiry_date BETWEEN $1 AND $2
      AND s.status NOT IN ('expired', 'cancelled')
      AND u.autopay_enabled = true
      AND u.autopay_card_id IS NOT NULL
      AND (s.bundle_id IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.service_type = $3 AND n.service_id = s.id AND n.type = 'autopay_processed'
      )
  `, [startDate, endDate, serviceType]);

  for (const service of services) {
    console.log(`[Autopay Processor] Processing ${serviceType} #${service.id} for user ${service.user_id}`);

    const user = {
      id: service.user_id,
      email: service.email,
      contact_name: service.contact_name,
      company_name: service.company_name,
      mc_number: service.mc_number,
      usdot_number: service.usdot_number,
      phone: service.phone,
      address: service.address,
      city: service.city,
      state: service.state,
      zip: service.zip
    };

    try {
      // Process payment with Square
      const paymentResult = await chargeStoredCard(
        service.square_customer_id,
        service.autopay_card_id,
        price,
        `${serviceName} renewal for ${service.company_name}`
      );

      if (paymentResult.success) {
        // Calculate new expiry date (1 year from current expiry)
        const newExpiryDate = new Date(service.expiry_date);
        newExpiryDate.setFullYear(newExpiryDate.getFullYear() + 1);
        const newEnrolledDate = new Date();

        // Update service with new expiry date
        await query(`
          UPDATE ${table}
          SET expiry_date = $1, enrolled_date = $2, updated_at = NOW()
          WHERE id = $3
        `, [newExpiryDate, newEnrolledDate, service.id]);

        // Regenerate documents if applicable
        if (serviceType === 'tariff') {
          const updatedOrder = { ...service, expiry_date: newExpiryDate, enrolled_date: newEnrolledDate };
          const documentUrl = await generateTariffPDF(user, updatedOrder);
          await query('UPDATE tariff_orders SET document_url = $1 WHERE id = $2', [documentUrl, service.id]);
        } else if (serviceType === 'arbitration') {
          const updatedEnrollment = { ...service, expiry_date: newExpiryDate, enrolled_date: newEnrolledDate };
          const documentUrl = await generateArbitrationPDF(user, updatedEnrollment);
          await query('UPDATE arbitration_enrollments SET document_url = $1 WHERE id = $2', [documentUrl, service.id]);
        }

        // Create success notification
        await query(`
          INSERT INTO notifications (user_id, type, service_type, service_id, message, email_sent)
          VALUES ($1, $2, $3, $4, $5, true)
        `, [
          service.user_id,
          'autopay_processed',
          serviceType,
          service.id,
          `Your ${serviceName} has been renewed. New expiration: ${newExpiryDate.toLocaleDateString()}`
        ]);

        // Send success email
        await sendAutopaySuccess(user, serviceName, price, newExpiryDate, service.autopay_card_last4);

        console.log(`[Autopay Processor] Successfully renewed ${serviceType} #${service.id}`);
      } else {
        throw new Error(paymentResult.error || 'Payment failed');
      }
    } catch (error) {
      console.error(`[Autopay Processor] Failed to process ${serviceType} #${service.id}:`, error);

      // Create failure notification
      await query(`
        INSERT INTO notifications (user_id, type, service_type, service_id, message, email_sent)
        VALUES ($1, $2, $3, $4, $5, true)
      `, [
        service.user_id,
        'autopay_failed',
        serviceType,
        service.id,
        `Failed to renew ${serviceName}: ${error.message}`
      ]);

      // Send failure email
      await sendAutopayFailed(user, serviceName, error.message, service.expiry_date);
    }
  }
};

/**
 * Charge a stored card using Square
 */
const chargeStoredCard = async (customerId, cardId, amountCents, note) => {
  // Check if Square is configured
  if (!process.env.SQUARE_ACCESS_TOKEN || !process.env.SQUARE_LOCATION_ID) {
    console.log('[Autopay Processor] Square not configured, simulating payment');
    return {
      success: true,
      payment_id: `autopay_sim_${Date.now()}`
    };
  }

  try {
    const { v4: uuidv4 } = require('uuid');

    const response = await paymentsApi.create({
      sourceId: cardId,
      customerId: customerId,
      idempotencyKey: uuidv4(),
      amountMoney: {
        amount: BigInt(amountCents),
        currency: 'USD'
      },
      autocomplete: true,
      note: note,
      locationId: process.env.SQUARE_LOCATION_ID
    });

    if (response.payment && response.payment.status === 'COMPLETED') {
      return {
        success: true,
        payment_id: response.payment.id
      };
    } else {
      return {
        success: false,
        error: `Payment status: ${response.payment?.status || 'FAILED'}`
      };
    }
  } catch (error) {
    console.error('[Autopay Processor] Square payment error:', error);
    return {
      success: false,
      error: error.message || 'Payment processing failed'
    };
  }
};

module.exports = { processAutopay };
