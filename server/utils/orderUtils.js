const crypto = require('crypto');

/**
 * Generate a random alphanumeric order ID
 * Format: PREFIX-XXXXXXXX (e.g., ICS-A3K7B9M2)
 * Uses uppercase letters and numbers, excluding confusing characters (0, O, I, L, 1)
 */
function generateOrderId(prefix = 'ICS') {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // Excludes 0, O, I, L, 1
  const length = 8;

  let id = '';
  const randomBytes = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    id += chars[randomBytes[i] % chars.length];
  }

  return `${prefix}-${id}`;
}

/**
 * Generate order ID with specific prefix based on service type
 */
function generateServiceOrderId(serviceType) {
  const prefixes = {
    tariff: 'TRF',
    boc3: 'BOC',
    arbitration: 'ARB',
    bundle: 'BDL'
  };

  const prefix = prefixes[serviceType] || 'ICS';
  return generateOrderId(prefix);
}

module.exports = {
  generateOrderId,
  generateServiceOrderId
};
