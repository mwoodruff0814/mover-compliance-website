const { query } = require('../config/database');

/**
 * Mark services as expired when their expiry date has passed
 */
const markExpiredServices = async () => {
  console.log('[Expire Services] Starting...');

  const now = new Date().toISOString().split('T')[0];

  try {
    // Expire arbitration enrollments
    const arbResult = await query(`
      UPDATE arbitration_enrollments
      SET status = 'expired', updated_at = NOW()
      WHERE expiry_date < $1
        AND status NOT IN ('expired', 'cancelled')
      RETURNING id
    `, [now]);
    console.log(`[Expire Services] Expired ${arbResult.rowCount} arbitration enrollments`);

    // Expire tariff orders
    const tariffResult = await query(`
      UPDATE tariff_orders
      SET status = 'expired', updated_at = NOW()
      WHERE expiry_date < $1
        AND status NOT IN ('expired', 'cancelled')
      RETURNING id
    `, [now]);
    console.log(`[Expire Services] Expired ${tariffResult.rowCount} tariff orders`);

    // Expire BOC-3 orders
    const boc3Result = await query(`
      UPDATE boc3_orders
      SET status = 'expired', updated_at = NOW()
      WHERE expiry_date < $1
        AND status NOT IN ('expired', 'cancelled')
      RETURNING id
    `, [now]);
    console.log(`[Expire Services] Expired ${boc3Result.rowCount} BOC-3 orders`);

    console.log('[Expire Services] Completed');
  } catch (error) {
    console.error('[Expire Services] Error:', error);
    throw error;
  }
};

module.exports = { markExpiredServices };
