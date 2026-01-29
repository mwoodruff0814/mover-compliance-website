const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { query } = require('../config/database');
const { generateToken, authenticateToken } = require('../middleware/auth');
const { validateRequest, schemas, formatMCNumber, formatUSDOT, sanitizeBody } = require('../middleware/validation');
const { sendPasswordResetEmail, sendAdminNewAccountNotification, sendWelcomeEmail } = require('../utils/email');

const router = express.Router();

// Register new user
router.post('/register', sanitizeBody, validateRequest(schemas.register), async (req, res) => {
  try {
    const {
      email,
      password,
      company_name,
      mc_number,
      usdot_number,
      contact_name,
      phone,
      address,
      city,
      state,
      zip
    } = req.body;

    // Check if email already exists
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists'
      });
    }

    // Check if MC number already registered
    if (mc_number) {
      const existingMC = await query('SELECT id FROM users WHERE mc_number = $1', [formatMCNumber(mc_number)]);
      if (existingMC.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'This MC number is already registered. Please login or contact support.'
        });
      }
    }

    // Hash password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Insert user
    const result = await query(
      `INSERT INTO users (email, password_hash, company_name, mc_number, usdot_number, contact_name, phone, address, city, state, zip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, email, company_name, mc_number, usdot_number, contact_name, phone, address, city, state, zip, created_at`,
      [
        email.toLowerCase(),
        password_hash,
        company_name,
        formatMCNumber(mc_number),
        formatUSDOT(usdot_number),
        contact_name || null,
        phone || null,
        address || null,
        city || null,
        state || null,
        zip || null
      ]
    );

    const user = result.rows[0];
    const token = generateToken(user.id);

    // Send welcome email to customer
    sendWelcomeEmail(user);

    // Send admin notification for new account
    sendAdminNewAccountNotification(user);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user,
        token
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create account'
    });
  }
});

// Login
router.post('/login', sanitizeBody, validateRequest(schemas.login), async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('Login attempt for:', email);

    // Find user
    const result = await query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      console.log('Login failed - user not found:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = result.rows[0];
    console.log('User found:', user.id, user.company_name);

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      console.log('Login failed - invalid password for user:', user.id);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate token
    const token = generateToken(user.id);
    console.log('Login successful for user:', user.id);

    // Remove sensitive data
    delete user.password_hash;

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user,
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  res.json({
    success: true,
    data: { user: req.user }
  });
});

// Update user profile
router.put('/profile', authenticateToken, sanitizeBody, async (req, res) => {
  try {
    const {
      company_name,
      contact_name,
      phone,
      address,
      city,
      state,
      zip
    } = req.body;

    const result = await query(
      `UPDATE users
       SET company_name = COALESCE($1, company_name),
           contact_name = COALESCE($2, contact_name),
           phone = COALESCE($3, phone),
           address = COALESCE($4, address),
           city = COALESCE($5, city),
           state = COALESCE($6, state),
           zip = COALESCE($7, zip),
           updated_at = NOW()
       WHERE id = $8
       RETURNING id, email, company_name, mc_number, usdot_number, contact_name, phone, address, city, state, zip, updated_at`,
      [company_name, contact_name, phone, address, city, state, zip, req.user.id]
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: result.rows[0] }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

// Change password
router.put('/password', authenticateToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters'
      });
    }

    // Get current password hash
    const userResult = await query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    // Verify current password
    const validPassword = await bcrypt.compare(current_password, userResult.rows[0].password_hash);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(new_password, saltRounds);

    // Update password
    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [password_hash, req.user.id]
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
});

// Request password reset
router.post('/forgot-password', sanitizeBody, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    console.log('Password reset requested for:', email);

    // Find user
    const userResult = await query(
      'SELECT id, email, company_name FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    // Always return success to prevent email enumeration
    if (userResult.rows.length === 0) {
      console.log('No user found with email:', email);
      return res.json({
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link'
      });
    }

    const user = userResult.rows[0];
    console.log('User found:', user.id, user.company_name);

    // Generate reset token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Save token
    await query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );
    console.log('Reset token saved to database');

    // Send email
    try {
      console.log('Attempting to send password reset email...');
      console.log('Email config - HOST:', process.env.EMAIL_HOST, 'USER:', process.env.EMAIL_USER ? 'SET' : 'NOT SET');
      await sendPasswordResetEmail(user.email, user.company_name, token);
      console.log('Password reset email sent successfully to:', user.email);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError.message);
      console.error('Full error:', emailError);
      // Still return success to not reveal if user exists
    }

    res.json({
      success: true,
      message: 'If an account exists with this email, you will receive a password reset link'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process request'
    });
  }
});

// Reset password with token
router.post('/reset-password', sanitizeBody, async (req, res) => {
  try {
    const { token, new_password } = req.body;

    if (!token || !new_password) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required'
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters'
      });
    }

    // Find valid token
    const tokenResult = await query(
      `SELECT * FROM password_reset_tokens
       WHERE token = $1 AND used = false AND expires_at > NOW()`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    const resetToken = tokenResult.rows[0];

    // Hash new password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(new_password, saltRounds);

    // Update password and mark token as used
    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [password_hash, resetToken.user_id]
    );

    await query(
      'UPDATE password_reset_tokens SET used = true WHERE id = $1',
      [resetToken.id]
    );

    res.json({
      success: true,
      message: 'Password reset successfully. You can now login with your new password.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
});

// Debug endpoint - check email configuration
router.get('/debug/email-config', async (req, res) => {
  res.json({
    success: true,
    config: {
      EMAIL_HOST: process.env.EMAIL_HOST || 'NOT SET',
      EMAIL_PORT: process.env.EMAIL_PORT || 'NOT SET',
      EMAIL_USER: process.env.EMAIL_USER ? 'SET (' + process.env.EMAIL_USER.substring(0, 5) + '...)' : 'NOT SET',
      EMAIL_PASS: process.env.EMAIL_PASS ? 'SET' : 'NOT SET',
      EMAIL_FROM: process.env.EMAIL_FROM || 'NOT SET',
      FRONTEND_URL: process.env.FRONTEND_URL || 'NOT SET'
    }
  });
});

// TEMPORARY: Direct password reset (remove after use)
router.post('/debug/reset-password-direct', async (req, res) => {
  try {
    const { email, new_password } = req.body;

    if (!email || !new_password) {
      return res.status(400).json({
        success: false,
        message: 'Email and new_password required'
      });
    }

    // Find user
    const userResult = await query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Hash new password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(new_password, saltRounds);

    // Update password
    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [password_hash, userResult.rows[0].id]
    );

    res.json({
      success: true,
      message: 'Password reset successfully. You can now login.'
    });
  } catch (error) {
    console.error('Direct password reset error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
});

// Debug endpoint - check if user exists (temporary)
router.get('/debug/check-user/:email', async (req, res) => {
  try {
    const email = req.params.email.toLowerCase();
    const result = await query(
      'SELECT id, email, company_name, created_at FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: false,
        message: 'User not found',
        email: email
      });
    }

    const user = result.rows[0];
    res.json({
      success: true,
      message: 'User exists',
      user: {
        id: user.id,
        email: user.email,
        company_name: user.company_name,
        created_at: user.created_at
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Database error',
      error: error.message
    });
  }
});

// TEMPORARY: Create test orders for a user (remove after testing)
router.post('/debug/create-test-orders', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email required' });
    }

    // Find user
    const userResult = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userId = userResult.rows[0].id;

    // Create test orders with sample document URLs
    const testDocUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

    // Create arbitration enrollment
    await query(`
      INSERT INTO arbitration_enrollments (user_id, status, enrolled_date, expiry_date, amount_paid, document_url)
      VALUES ($1, 'active', NOW(), NOW() + INTERVAL '1 year', 149.00, $2)
    `, [userId, testDocUrl]);

    // Create tariff order
    await query(`
      INSERT INTO tariff_orders (user_id, status, pricing_method, service_territory, amount_paid, document_url)
      VALUES ($1, 'completed', 'weight', 'Interstate - 48 States', 199.00, $2)
    `, [userId, testDocUrl]);

    // Create BOC-3 order
    await query(`
      INSERT INTO boc3_orders (user_id, status, filing_type, amount_paid, document_url)
      VALUES ($1, 'filed', 'new', 49.00, $2)
    `, [userId, testDocUrl]);

    res.json({
      success: true,
      message: 'Test orders created for ' + email,
      note: 'Check the dashboard to see the documents'
    });

  } catch (error) {
    console.error('Create test orders error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
