const { query } = require('../config/database');
const {
  sendExpirationWarning30,
  sendExpirationWarning5,
  sendAutopayReminder10
} = require('../utils/email');

// Service prices in cents for autopay reminders
const PRICES = {
  arbitration: 9900,
  tariff: 29900,
  boc3: 9900
};

const SERVICE_NAMES = {
  arbitration: 'Arbitration Program',
  tariff: 'Tariff Publishing',
  boc3: 'BOC-3 Process Agent'
};

/**
 * Check for expiring services and send notifications
 */
const checkExpirations = async () => {
  console.log('[Expiration Checker] Starting...');

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const in10Days = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
  const in5Days = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

  // Format dates for SQL comparison (just the date part)
  const formatDate = (d) => d.toISOString().split('T')[0];

  try {
    // Check all service types
    await checkServiceExpiration('arbitration_enrollments', 'arbitration', formatDate(in30Days), formatDate(in10Days), formatDate(in5Days));
    await checkServiceExpiration('tariff_orders', 'tariff', formatDate(in30Days), formatDate(in10Days), formatDate(in5Days));
    await checkServiceExpiration('boc3_orders', 'boc3', formatDate(in30Days), formatDate(in10Days), formatDate(in5Days));

    console.log('[Expiration Checker] Completed');
  } catch (error) {
    console.error('[Expiration Checker] Error:', error);
    throw error;
  }
};

/**
 * Check expiration for a specific service type
 */
const checkServiceExpiration = async (table, serviceType, date30, date10, date5) => {
  console.log(`[Expiration Checker] Checking ${serviceType}...`);

  // Get services expiring on each date with user info
  const serviceName = SERVICE_NAMES[serviceType];
  const price = PRICES[serviceType];

  // 30-day warning (non-autopay users)
  const expiring30 = await query(`
    SELECT s.*, u.email, u.contact_name, u.company_name, u.autopay_enabled,
           u.autopay_card_last4, u.autopay_card_brand
    FROM ${table} s
    JOIN users u ON s.user_id = u.id
    WHERE s.expiry_date = $1
      AND s.status NOT IN ('expired', 'cancelled')
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.service_type = $2 AND n.service_id = s.id AND n.type = 'expiry_30day'
      )
  `, [date30, serviceType]);

  for (const service of expiring30.rows) {
    const user = {
      id: service.user_id,
      email: service.email,
      contact_name: service.contact_name,
      company_name: service.company_name
    };

    // Create notification
    await query(`
      INSERT INTO notifications (user_id, type, service_type, service_id, message, email_sent)
      VALUES ($1, $2, $3, $4, $5, true)
    `, [
      service.user_id,
      'expiry_30day',
      serviceType,
      service.id,
      `Your ${serviceName} expires in 30 days on ${new Date(service.expiry_date).toLocaleDateString()}`
    ]);

    // Send email (different for autopay vs non-autopay)
    if (service.autopay_enabled) {
      // Autopay users don't get 30-day warning, they get 10-day autopay reminder
    } else {
      await sendExpirationWarning30(user, serviceName, service.expiry_date);
    }

    console.log(`[Expiration Checker] 30-day notification sent for ${serviceType} #${service.id}`);
  }

  // 10-day autopay reminder
  const expiring10 = await query(`
    SELECT s.*, u.email, u.contact_name, u.company_name, u.autopay_enabled,
           u.autopay_card_last4, u.autopay_card_brand
    FROM ${table} s
    JOIN users u ON s.user_id = u.id
    WHERE s.expiry_date = $1
      AND s.status NOT IN ('expired', 'cancelled')
      AND u.autopay_enabled = true
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.service_type = $2 AND n.service_id = s.id AND n.type = 'autopay_10day'
      )
  `, [date10, serviceType]);

  for (const service of expiring10.rows) {
    const user = {
      id: service.user_id,
      email: service.email,
      contact_name: service.contact_name,
      company_name: service.company_name
    };

    // Create notification
    await query(`
      INSERT INTO notifications (user_id, type, service_type, service_id, message, email_sent)
      VALUES ($1, $2, $3, $4, $5, true)
    `, [
      service.user_id,
      'autopay_10day',
      serviceType,
      service.id,
      `Autopay: Your ${serviceName} will be renewed in 10 days for $${(price / 100).toFixed(2)}`
    ]);

    // Send autopay reminder email
    await sendAutopayReminder10(
      user,
      serviceName,
      service.expiry_date,
      price,
      service.autopay_card_last4,
      service.autopay_card_brand
    );

    console.log(`[Expiration Checker] Autopay reminder sent for ${serviceType} #${service.id}`);
  }

  // 5-day warning (non-autopay users only)
  const expiring5 = await query(`
    SELECT s.*, u.email, u.contact_name, u.company_name, u.autopay_enabled
    FROM ${table} s
    JOIN users u ON s.user_id = u.id
    WHERE s.expiry_date = $1
      AND s.status NOT IN ('expired', 'cancelled')
      AND u.autopay_enabled = false
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.service_type = $2 AND n.service_id = s.id AND n.type = 'expiry_5day'
      )
  `, [date5, serviceType]);

  for (const service of expiring5.rows) {
    const user = {
      id: service.user_id,
      email: service.email,
      contact_name: service.contact_name,
      company_name: service.company_name
    };

    // Create notification
    await query(`
      INSERT INTO notifications (user_id, type, service_type, service_id, message, email_sent)
      VALUES ($1, $2, $3, $4, $5, true)
    `, [
      service.user_id,
      'expiry_5day',
      serviceType,
      service.id,
      `URGENT: Your ${serviceName} expires in 5 days on ${new Date(service.expiry_date).toLocaleDateString()}`
    ]);

    // Send urgent warning email
    await sendExpirationWarning5(user, serviceName, service.expiry_date);

    console.log(`[Expiration Checker] 5-day urgent notification sent for ${serviceType} #${service.id}`);
  }
};

module.exports = { checkExpirations };
