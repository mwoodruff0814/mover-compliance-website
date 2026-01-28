const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { SquareClient } = require('square');

const router = express.Router();

// Initialize Square client only if credentials are configured
let squareClient = null;
let paymentsApi = null;

function initSquare() {
  if (process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_ACCESS_TOKEN !== 'sandbox-access-token') {
    try {
      squareClient = new SquareClient({
        token: process.env.SQUARE_ACCESS_TOKEN,
      });
      paymentsApi = squareClient.payments;
      console.log('Square payments initialized successfully');
    } catch (err) {
      console.log('Square SDK error:', err.message);
    }
  } else {
    console.log('Square payments not configured - using simulation mode');
  }
}

// Initialize on module load
initSquare();

// Prices in cents
const PRICES = {
  arbitration: 9900,       // $99.00
  tariff: 29900,           // $299.00
  boc3: 9900,              // $99.00
  bundle_startup: 44900,   // $449.00
  bundle_essentials: 24900, // $249.00
  bundle_renewal: 17900    // $179.00
};

// Get prices (public endpoint)
router.get('/prices', (req, res) => {
  res.json({
    success: true,
    data: {
      prices: {
        arbitration: { amount: 9900, display: '$99.00', period: 'year' },
        tariff: { amount: 29900, display: '$299.00', period: 'one-time' },
        boc3: { amount: 9900, display: '$99.00', period: 'year' },
        bundle_startup: { amount: 44900, display: '$449.00', period: 'one-time', savings: '$48.00' },
        bundle_essentials: { amount: 24900, display: '$249.00', period: 'one-time', savings: '$48.00' },
        bundle_renewal: { amount: 17900, display: '$179.00', period: 'year', savings: '$19.00' }
      }
    }
  });
});

// Process payment
router.post('/process', optionalAuth, async (req, res) => {
  try {
    const {
      source_id,      // Card nonce from Square Web Payments SDK
      product_type,   // arbitration, tariff, boc3, bundle_startup, etc.
      amount_override, // Optional: for custom amounts
      verification_token, // 3D Secure token if applicable
      buyer_email_address
    } = req.body;

    if (!product_type || !PRICES[product_type]) {
      return res.status(400).json({
        success: false,
        message: 'Valid product type is required'
      });
    }

    const amount = amount_override || PRICES[product_type];

    // If Square is not configured, use simulation mode
    if (!paymentsApi) {
      const simulatedPaymentId = 'sim_' + uuidv4();
      return res.json({
        success: true,
        message: 'Payment successful (simulation mode)',
        data: {
          payment_id: simulatedPaymentId,
          amount: amount,
          status: 'COMPLETED',
          receipt_url: null,
          created_at: new Date().toISOString(),
          simulated: true
        }
      });
    }

    if (!source_id) {
      return res.status(400).json({
        success: false,
        message: 'Payment source is required'
      });
    }

    const idempotencyKey = uuidv4();

    // Build payment request
    const paymentRequest = {
      sourceId: source_id,
      idempotencyKey: idempotencyKey,
      amountMoney: {
        amount: BigInt(amount),
        currency: 'USD'
      },
      locationId: process.env.SQUARE_LOCATION_ID,
      note: `Interstate Compliance - ${product_type.replace('_', ' ').toUpperCase()}`
    };

    // Add verification token for 3D Secure
    if (verification_token) {
      paymentRequest.verificationToken = verification_token;
    }

    // Add buyer email if provided
    if (buyer_email_address || req.user?.email) {
      paymentRequest.buyerEmailAddress = buyer_email_address || req.user.email;
    }

    // Process payment
    const response = await paymentsApi.create(paymentRequest);

    if (response.payment && response.payment.status === 'COMPLETED') {
      res.json({
        success: true,
        message: 'Payment successful',
        data: {
          payment_id: response.payment.id,
          amount: amount,
          status: response.payment.status,
          receipt_url: response.payment.receiptUrl,
          created_at: response.payment.createdAt
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Payment not completed',
        data: {
          status: response.payment?.status || 'FAILED'
        }
      });
    }
  } catch (error) {
    console.error('Payment error:', error);

    // Handle Square-specific errors
    if (error.errors) {
      const squareError = error.errors[0];
      return res.status(400).json({
        success: false,
        message: squareError.detail || 'Payment failed',
        code: squareError.code
      });
    }

    res.status(500).json({
      success: false,
      message: 'Payment processing failed'
    });
  }
});

// Get payment details
router.get('/:paymentId', authenticateToken, async (req, res) => {
  try {
    // Handle simulated payments
    if (req.params.paymentId.startsWith('sim_') || !paymentsApi) {
      return res.json({
        success: true,
        data: {
          payment: {
            id: req.params.paymentId,
            status: 'COMPLETED',
            amount: 0,
            currency: 'USD',
            receipt_url: null,
            created_at: new Date().toISOString(),
            simulated: true
          }
        }
      });
    }

    const response = await paymentsApi.get({ paymentId: req.params.paymentId });

    res.json({
      success: true,
      data: {
        payment: {
          id: response.payment.id,
          status: response.payment.status,
          amount: Number(response.payment.amountMoney.amount),
          currency: response.payment.amountMoney.currency,
          receipt_url: response.payment.receiptUrl,
          created_at: response.payment.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment details'
    });
  }
});

// Refund payment (admin only - for future use)
router.post('/:paymentId/refund', authenticateToken, async (req, res) => {
  try {
    const { amount, reason } = req.body;
    const paymentId = req.params.paymentId;

    // Handle simulated payments
    if (paymentId.startsWith('sim_') || !squareClient) {
      return res.json({
        success: true,
        message: 'Refund processed (simulation mode)',
        data: {
          refund_id: 'sim_refund_' + uuidv4(),
          status: 'COMPLETED',
          amount: amount || 0,
          simulated: true
        }
      });
    }

    // Get original payment to verify amount
    const paymentResponse = await paymentsApi.get({ paymentId: paymentId });
    const originalAmount = Number(paymentResponse.payment.amountMoney.amount);

    // Validate refund amount
    const refundAmount = amount || originalAmount;
    if (refundAmount > originalAmount) {
      return res.status(400).json({
        success: false,
        message: 'Refund amount cannot exceed original payment'
      });
    }

    const refundsApi = squareClient.refunds;
    const refundResponse = await refundsApi.refund({
      idempotencyKey: uuidv4(),
      paymentId: paymentId,
      amountMoney: {
        amount: BigInt(refundAmount),
        currency: 'USD'
      },
      reason: reason || 'Customer request'
    });

    res.json({
      success: true,
      message: 'Refund processed',
      data: {
        refund_id: refundResponse.refund.id,
        status: refundResponse.refund.status,
        amount: Number(refundResponse.refund.amountMoney.amount)
      }
    });
  } catch (error) {
    console.error('Refund error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process refund'
    });
  }
});

// Create payment link (alternative to embedded form)
router.post('/create-link', optionalAuth, async (req, res) => {
  try {
    const { product_type, redirect_url } = req.body;

    if (!product_type || !PRICES[product_type]) {
      return res.status(400).json({
        success: false,
        message: 'Valid product type is required'
      });
    }

    // Handle simulation mode
    if (!squareClient) {
      return res.json({
        success: true,
        data: {
          payment_link: redirect_url || '/dashboard',
          order_id: 'sim_order_' + uuidv4(),
          simulated: true,
          message: 'Square not configured - payment links unavailable in simulation mode'
        }
      });
    }

    const amount = PRICES[product_type];
    const checkoutApi = squareClient.checkout;

    const response = await checkoutApi.createPaymentLink({
      idempotencyKey: uuidv4(),
      quickPay: {
        name: `Interstate Compliance - ${product_type.replace('_', ' ').toUpperCase()}`,
        priceMoney: {
          amount: BigInt(amount),
          currency: 'USD'
        },
        locationId: process.env.SQUARE_LOCATION_ID
      },
      checkoutOptions: {
        redirectUrl: redirect_url || `${process.env.FRONTEND_URL}/payment-success`
      }
    });

    res.json({
      success: true,
      data: {
        payment_link: response.paymentLink.url,
        order_id: response.paymentLink.orderId
      }
    });
  } catch (error) {
    console.error('Create payment link error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment link'
    });
  }
});

module.exports = router;
