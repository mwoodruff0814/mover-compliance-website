const express = require('express');
const { query } = require('../config/database');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { validateRequest, schemas, formatMCNumber, formatUSDOT, sanitizeBody } = require('../middleware/validation');
const { generateArbitrationPDF, generateArbitrationConsumerPDF, generateRightsAndResponsibilitiesPDF, generateReadyToMovePDF } = require('../utils/pdf');
const { sendEnrollmentConfirmation } = require('../utils/email');
const { generateServiceOrderId } = require('../utils/orderUtils');

const router = express.Router();

// Prices in cents
const PRICES = {
  ARBITRATION: 9900 // $99.00
};

// Get user's arbitration enrollment status
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM arbitration_enrollments
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: {
          enrolled: false,
          status: null,
          enrollment: null
        }
      });
    }

    const enrollment = result.rows[0];
    const isActive = enrollment.status === 'active' && new Date(enrollment.expiry_date) > new Date();

    res.json({
      success: true,
      data: {
        enrolled: isActive,
        status: enrollment.status,
        enrollment
      }
    });
  } catch (error) {
    console.error('Get enrollment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get enrollment status'
    });
  }
});

// Create new arbitration enrollment
router.post('/', authenticateToken, sanitizeBody, async (req, res) => {
  try {
    const userId = req.user.id;
    const { payment_id, payment_amount } = req.body;

    // Check for existing active enrollment
    const existingActive = await query(
      `SELECT * FROM arbitration_enrollments
       WHERE user_id = $1 AND status = 'active' AND expiry_date > NOW()`,
      [userId]
    );

    if (existingActive.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active arbitration enrollment'
      });
    }

    // Check if this is first-time enrollment (for determining which docs to include)
    const anyPrevious = await query(
      `SELECT id FROM arbitration_enrollments WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    const isFirstEnrollment = anyPrevious.rows.length === 0;

    // Calculate dates
    const enrolledDate = new Date();
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    // Generate unique order ID
    const orderId = generateServiceOrderId('arbitration');

    // Create enrollment
    const result = await query(
      `INSERT INTO arbitration_enrollments
       (user_id, order_id, status, enrolled_date, expiry_date, payment_id, amount_paid)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, orderId, 'active', enrolledDate, expiryDate, payment_id, payment_amount || PRICES.ARBITRATION / 100]
    );

    const enrollment = result.rows[0];

    // Generate all documents
    const documents = {};
    try {
      // Always generate: Certificate and Consumer Document
      documents.certificate = await generateArbitrationPDF(req.user, enrollment);
      documents.consumer_document = await generateArbitrationConsumerPDF(req.user, enrollment);

      // First enrollment only: Ready to Move and Rights & Responsibilities
      if (isFirstEnrollment) {
        documents.ready_to_move = await generateReadyToMovePDF(req.user);
        documents.rights_responsibilities = await generateRightsAndResponsibilitiesPDF(req.user);
      }

      // Store primary document URL and all documents
      await query(
        `UPDATE arbitration_enrollments
         SET document_url = $1, documents = $2
         WHERE id = $3`,
        [documents.certificate, JSON.stringify(documents), enrollment.id]
      );
      enrollment.document_url = documents.certificate;
      enrollment.documents = documents;
    } catch (pdfError) {
      console.error('PDF generation error:', pdfError);
      // Continue without PDF - can be regenerated later
    }

    // Send confirmation email
    try {
      await sendEnrollmentConfirmation(req.user, enrollment);
    } catch (emailError) {
      console.error('Email send error:', emailError);
      // Continue without email
    }

    res.status(201).json({
      success: true,
      message: 'Successfully enrolled in Arbitration Program',
      data: { enrollment, documents, isFirstEnrollment }
    });
  } catch (error) {
    console.error('Create enrollment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create enrollment'
    });
  }
});

// Renew arbitration enrollment
router.post('/renew', authenticateToken, async (req, res) => {
  try {
    const { payment_id, payment_amount } = req.body;

    // Get current enrollment
    const currentResult = await query(
      `SELECT * FROM arbitration_enrollments
       WHERE user_id = $1
       ORDER BY expiry_date DESC
       LIMIT 1`,
      [req.user.id]
    );

    // Calculate new dates
    let enrolledDate = new Date();
    let expiryDate = new Date();

    // If current enrollment exists and hasn't expired, extend from expiry date
    if (currentResult.rows.length > 0) {
      const current = currentResult.rows[0];
      if (new Date(current.expiry_date) > new Date()) {
        expiryDate = new Date(current.expiry_date);
      }
    }

    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    // Generate unique order ID for renewal
    const orderId = generateServiceOrderId('arbitration');

    // Update existing or create new
    const result = await query(
      `INSERT INTO arbitration_enrollments
       (user_id, order_id, status, enrolled_date, expiry_date, payment_id, amount_paid)
       VALUES ($1, $2, 'active', $3, $4, $5, $6)
       RETURNING *`,
      [req.user.id, orderId, enrolledDate, expiryDate, payment_id, payment_amount || PRICES.ARBITRATION / 100]
    );

    const enrollment = result.rows[0];

    // Generate new PDF
    try {
      const pdfUrl = await generateArbitrationPDF(req.user, enrollment);
      await query(
        'UPDATE arbitration_enrollments SET document_url = $1 WHERE id = $2',
        [pdfUrl, enrollment.id]
      );
      enrollment.document_url = pdfUrl;
    } catch (pdfError) {
      console.error('PDF generation error:', pdfError);
    }

    res.json({
      success: true,
      message: 'Enrollment renewed successfully',
      data: { enrollment }
    });
  } catch (error) {
    console.error('Renew enrollment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to renew enrollment'
    });
  }
});

// Get enrollment history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM arbitration_enrollments
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: { enrollments: result.rows }
    });
  } catch (error) {
    console.error('Get enrollment history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get enrollment history'
    });
  }
});

// Download Arbitration Summary PDF
router.get('/:id/document', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM arbitration_enrollments WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment not found'
      });
    }

    const enrollment = result.rows[0];

    // If no document exists, generate it
    if (!enrollment.document_url) {
      const pdfBuffer = await generateArbitrationPDF(req.user, enrollment, true);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="arbitration-summary-${req.user.mc_number}.pdf"`);
      return res.send(pdfBuffer);
    }

    // Return document URL or redirect
    res.json({
      success: true,
      data: { document_url: enrollment.document_url }
    });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get document'
    });
  }
});

// Regenerate Arbitration Summary PDF
router.post('/:id/regenerate-document', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM arbitration_enrollments WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment not found'
      });
    }

    const enrollment = result.rows[0];
    const pdfUrl = await generateArbitrationPDF(req.user, enrollment);

    await query(
      'UPDATE arbitration_enrollments SET document_url = $1, updated_at = NOW() WHERE id = $2',
      [pdfUrl, enrollment.id]
    );

    res.json({
      success: true,
      message: 'Document regenerated successfully',
      data: { document_url: pdfUrl }
    });
  } catch (error) {
    console.error('Regenerate document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to regenerate document'
    });
  }
});

module.exports = router;
