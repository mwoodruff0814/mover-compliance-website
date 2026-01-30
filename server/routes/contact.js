const express = require('express');
const { query } = require('../config/database');
const { sanitizeBody } = require('../middleware/validation');
const { sendContactNotification, sendContactConfirmation } = require('../utils/email');

const router = express.Router();

// Submit contact form
router.post('/', sanitizeBody, async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    // Validate required fields
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and message are required'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    // Save to database
    const result = await query(
      `INSERT INTO contact_submissions (name, email, phone, subject, message, status)
       VALUES ($1, $2, $3, $4, $5, 'new')
       RETURNING id, created_at`,
      [name, email, phone || null, subject || 'General Inquiry', message]
    );

    const submission = result.rows[0];

    // Send notification email to company
    try {
      await sendContactNotification({
        id: submission.id,
        name,
        email,
        phone,
        subject: subject || 'General Inquiry',
        message,
        created_at: submission.created_at
      });
    } catch (emailError) {
      console.error('Failed to send contact notification:', emailError);
    }

    // Send confirmation to user
    try {
      await sendContactConfirmation(name, email);
    } catch (emailError) {
      console.error('Failed to send contact confirmation:', emailError);
    }

    res.status(201).json({
      success: true,
      message: 'Thank you for your message. We will get back to you within 24 hours.',
      data: {
        reference_id: submission.id
      }
    });
  } catch (error) {
    console.error('Contact submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit message. Please try again or call us directly.'
    });
  }
});

// Get contact info (public)
router.get('/info', (req, res) => {
  res.json({
    success: true,
    data: {
      company: process.env.COMPANY_NAME || 'Interstate Compliance Solutions',
      phone: process.env.COMPANY_PHONE || '(330) 754-2648',
      email: process.env.COMPANY_EMAIL || 'info@interstatecompliancesolutions.com',
      hours: {
        weekdays: '8:00 AM - 6:00 PM EST',
        saturday: '9:00 AM - 2:00 PM EST',
        sunday: 'Closed'
      },
      response_time: 'Within 24 hours'
    }
  });
});

module.exports = router;
