const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Square SDK setup
let cardsApi = null;
let customersApi = null;

const initSquare = () => {
  if (cardsApi) return;

  if (!process.env.SQUARE_ACCESS_TOKEN) {
    console.log('Square not configured - autopay will run in simulation mode');
    return;
  }

  const { SquareClient, SquareEnvironment } = require('square');

  const squareClient = new SquareClient({
    token: process.env.SQUARE_ACCESS_TOKEN,
    environment: process.env.SQUARE_ENVIRONMENT === 'production'
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox
  });

  cardsApi = squareClient.cards;
  customersApi = squareClient.customers;
};

// Get autopay status
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await query(
      `SELECT autopay_enabled, autopay_card_last4, autopay_card_brand, square_customer_id
       FROM users WHERE id = $1`,
      [userId]
    );

    const user = result.rows[0];

    res.json({
      success: true,
      data: {
        autopay_enabled: user.autopay_enabled || false,
        has_card: !!user.autopay_card_last4,
        card_last4: user.autopay_card_last4 || null,
        card_brand: user.autopay_card_brand || null
      }
    });
  } catch (error) {
    console.error('Get autopay status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get autopay status'
    });
  }
});

// Setup autopay - store card and enable
router.post('/setup', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { source_id, card_details } = req.body;

    if (!source_id) {
      return res.status(400).json({
        success: false,
        message: 'Payment card token is required'
      });
    }

    initSquare();

    // Get user info
    const userResult = await query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    let squareCustomerId = user.square_customer_id;
    let cardId = null;
    let cardLast4 = card_details?.last4 || '****';
    let cardBrand = card_details?.brand || 'Card';

    // Check if Square is configured
    if (customersApi && cardsApi) {
      try {
        // Create Square customer if not exists
        if (!squareCustomerId) {
          const customerResponse = await customersApi.create({
            emailAddress: user.email,
            companyName: user.company_name,
            referenceId: `user_${user.id}`
          });
          squareCustomerId = customerResponse.customer.id;
        }

        // Store card on customer
        const cardResponse = await cardsApi.create({
          idempotencyKey: `card_${userId}_${Date.now()}`,
          sourceId: source_id,
          card: {
            customerId: squareCustomerId
          }
        });

        cardId = cardResponse.card.id;
        cardLast4 = cardResponse.card.last4;
        cardBrand = cardResponse.card.cardBrand;
      } catch (squareError) {
        console.error('Square card storage error:', squareError);
        return res.status(400).json({
          success: false,
          message: 'Failed to store card. Please check your card details and try again.'
        });
      }
    } else {
      // Simulation mode
      squareCustomerId = `sim_customer_${userId}`;
      cardId = `sim_card_${Date.now()}`;
    }

    // Update user with autopay info
    await query(
      `UPDATE users SET
        square_customer_id = $1,
        autopay_enabled = true,
        autopay_card_id = $2,
        autopay_card_last4 = $3,
        autopay_card_brand = $4,
        updated_at = NOW()
       WHERE id = $5`,
      [squareCustomerId, cardId, cardLast4, cardBrand, userId]
    );

    res.json({
      success: true,
      message: 'Autopay enabled successfully',
      data: {
        autopay_enabled: true,
        card_last4: cardLast4,
        card_brand: cardBrand
      }
    });
  } catch (error) {
    console.error('Setup autopay error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to setup autopay'
    });
  }
});

// Toggle autopay on/off
router.post('/toggle', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { enabled } = req.body;

    // Check if user has a card stored
    const userResult = await query(
      'SELECT autopay_card_id FROM users WHERE id = $1',
      [userId]
    );

    if (enabled && !userResult.rows[0].autopay_card_id) {
      return res.status(400).json({
        success: false,
        message: 'Please add a payment card before enabling autopay'
      });
    }

    await query(
      'UPDATE users SET autopay_enabled = $1, updated_at = NOW() WHERE id = $2',
      [enabled, userId]
    );

    res.json({
      success: true,
      message: enabled ? 'Autopay enabled' : 'Autopay disabled',
      data: { autopay_enabled: enabled }
    });
  } catch (error) {
    console.error('Toggle autopay error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update autopay setting'
    });
  }
});

// Update card
router.put('/update-card', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { source_id, card_details } = req.body;

    if (!source_id) {
      return res.status(400).json({
        success: false,
        message: 'Payment card token is required'
      });
    }

    initSquare();

    const userResult = await query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    let cardId = null;
    let cardLast4 = card_details?.last4 || '****';
    let cardBrand = card_details?.brand || 'Card';

    if (cardsApi && user.square_customer_id) {
      try {
        // Disable old card if exists
        if (user.autopay_card_id) {
          try {
            await cardsApi.disable(user.autopay_card_id);
          } catch (e) {
            // Ignore errors disabling old card
          }
        }

        // Store new card
        const cardResponse = await cardsApi.create({
          idempotencyKey: `card_${userId}_${Date.now()}`,
          sourceId: source_id,
          card: {
            customerId: user.square_customer_id
          }
        });

        cardId = cardResponse.card.id;
        cardLast4 = cardResponse.card.last4;
        cardBrand = cardResponse.card.cardBrand;
      } catch (squareError) {
        console.error('Square card update error:', squareError);
        return res.status(400).json({
          success: false,
          message: 'Failed to update card. Please check your card details.'
        });
      }
    } else {
      // Simulation mode
      cardId = `sim_card_${Date.now()}`;
    }

    await query(
      `UPDATE users SET
        autopay_card_id = $1,
        autopay_card_last4 = $2,
        autopay_card_brand = $3,
        updated_at = NOW()
       WHERE id = $4`,
      [cardId, cardLast4, cardBrand, userId]
    );

    res.json({
      success: true,
      message: 'Card updated successfully',
      data: {
        card_last4: cardLast4,
        card_brand: cardBrand
      }
    });
  } catch (error) {
    console.error('Update card error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update card'
    });
  }
});

// Remove card and disable autopay
router.delete('/remove', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    initSquare();

    const userResult = await query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    // Disable card in Square if exists
    if (cardsApi && user.autopay_card_id) {
      try {
        await cardsApi.disable(user.autopay_card_id);
      } catch (e) {
        // Ignore errors disabling card
      }
    }

    // Clear autopay info from user
    await query(
      `UPDATE users SET
        autopay_enabled = false,
        autopay_card_id = NULL,
        autopay_card_last4 = NULL,
        autopay_card_brand = NULL,
        updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );

    res.json({
      success: true,
      message: 'Card removed and autopay disabled'
    });
  } catch (error) {
    console.error('Remove card error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove card'
    });
  }
});

module.exports = router;
