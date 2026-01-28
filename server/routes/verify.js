const express = require('express');
const { query } = require('../config/database');
const { sanitizeBody, formatMCNumber } = require('../middleware/validation');

const router = express.Router();

// Verify mover enrollment (public endpoint for consumers)
router.post('/', sanitizeBody, async (req, res) => {
  try {
    const {
      consumer_name,
      consumer_email,
      consumer_phone,
      mover_name,
      mover_mc_number,
      dispute_type,
      filed_claim_with_mover
    } = req.body;

    // Validate required fields
    if (!consumer_name || !consumer_email || !mover_mc_number) {
      return res.status(400).json({
        success: false,
        message: 'Consumer name, email, and mover MC number are required'
      });
    }

    const formattedMC = formatMCNumber(mover_mc_number);

    // Check if mover is enrolled
    const enrollmentResult = await query(
      `SELECT u.company_name, u.mc_number, u.usdot_number, u.phone, ae.status, ae.enrolled_date, ae.expiry_date
       FROM users u
       JOIN arbitration_enrollments ae ON u.id = ae.user_id
       WHERE u.mc_number = $1
       AND ae.status = 'active'
       AND ae.expiry_date > NOW()
       ORDER BY ae.enrolled_date DESC
       LIMIT 1`,
      [formattedMC]
    );

    const isEnrolled = enrollmentResult.rows.length > 0;
    const moverInfo = isEnrolled ? enrollmentResult.rows[0] : null;

    // Log the verification request
    await query(
      `INSERT INTO consumer_verifications
       (consumer_name, consumer_email, consumer_phone, mover_name, mover_mc_number, dispute_type, filed_claim_with_mover, verification_result)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        consumer_name,
        consumer_email,
        consumer_phone || null,
        mover_name || (isEnrolled ? moverInfo.company_name : null),
        formattedMC,
        dispute_type || null,
        filed_claim_with_mover || false,
        isEnrolled ? 'enrolled' : 'not_found'
      ]
    );

    if (isEnrolled) {
      res.json({
        success: true,
        data: {
          enrolled: true,
          mover: {
            company_name: moverInfo.company_name,
            mc_number: moverInfo.mc_number,
            usdot_number: moverInfo.usdot_number
          },
          arbitration_info: {
            message: 'This moving company is enrolled in our Arbitration Program.',
            next_steps: [
              'You must first file a written claim directly with the moving company.',
              'The mover has 30 days to acknowledge and 120 days to resolve your claim.',
              'If the claim is not resolved, you may request arbitration.',
              'For claims up to $10,000, you may choose binding arbitration.',
              'For claims over $10,000, both parties must agree to arbitration.'
            ],
            arbitration_provider: {
              name: 'NAM (National Arbitration and Mediation)',
              phone: '1-800-358-2550',
              website: 'namadr.com'
            },
            contact: {
              company: process.env.COMPANY_NAME || 'Interstate Compliance Solutions',
              phone: process.env.COMPANY_PHONE || '1-800-555-0199',
              email: process.env.COMPANY_EMAIL || 'info@interstatecompliancesolutions.com'
            }
          }
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          enrolled: false,
          message: 'This moving company is not currently enrolled in our Arbitration Program.',
          suggestions: [
            'Contact the moving company directly about their dispute resolution process.',
            'File a complaint with FMCSA if you believe there are safety or regulatory violations.',
            'Consider consulting with a consumer protection attorney.',
            'You may still attempt to resolve the dispute directly with the mover.'
          ],
          resources: {
            fmcsa_complaints: 'https://www.fmcsa.dot.gov/consumer-protection/file-complaint',
            consumer_protection: 'https://www.usa.gov/consumer-complaints'
          }
        }
      });
    }
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification failed. Please try again.'
    });
  }
});

// Quick check endpoint (just returns enrolled status, no logging)
router.get('/check/:mcNumber', async (req, res) => {
  try {
    const formattedMC = formatMCNumber(req.params.mcNumber);

    const result = await query(
      `SELECT u.company_name, u.mc_number
       FROM users u
       JOIN arbitration_enrollments ae ON u.id = ae.user_id
       WHERE u.mc_number = $1
       AND ae.status = 'active'
       AND ae.expiry_date > NOW()
       LIMIT 1`,
      [formattedMC]
    );

    res.json({
      success: true,
      data: {
        enrolled: result.rows.length > 0,
        company_name: result.rows[0]?.company_name || null
      }
    });
  } catch (error) {
    console.error('Quick check error:', error);
    res.status(500).json({
      success: false,
      message: 'Check failed'
    });
  }
});

// Get verification statistics (for admin/reporting)
router.get('/stats', async (req, res) => {
  try {
    const stats = await query(`
      SELECT
        COUNT(*) as total_verifications,
        COUNT(*) FILTER (WHERE verification_result = 'enrolled') as enrolled_count,
        COUNT(*) FILTER (WHERE verification_result = 'not_found') as not_found_count,
        COUNT(*) FILTER (WHERE dispute_type = 'loss_damage') as loss_damage_count,
        COUNT(*) FILTER (WHERE dispute_type = 'overcharge') as overcharge_count,
        COUNT(*) FILTER (WHERE dispute_type = 'other') as other_count,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as last_30_days
      FROM consumer_verifications
    `);

    res.json({
      success: true,
      data: { stats: stats.rows[0] }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get statistics'
    });
  }
});

module.exports = router;
