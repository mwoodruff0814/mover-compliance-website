const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Admin emails - add your admin emails here
const ADMIN_EMAILS = [
  'zlarimer24@gmail.com',
  'matt@worryfreemovers.com'
];

// Admin authentication middleware
const requireAdmin = (req, res, next) => {
  if (!req.user || !ADMIN_EMAILS.includes(req.user.email)) {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, DOC, DOCX, PNG, JPG'));
    }
  }
});

// ==================== DASHBOARD ====================

// Admin dashboard stats
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [users, tariffs, boc3s, arbitrations] = await Promise.all([
      query('SELECT COUNT(*) as count FROM users'),
      query('SELECT COUNT(*) as count, status FROM tariff_orders GROUP BY status'),
      query('SELECT COUNT(*) as count, status FROM boc3_orders GROUP BY status'),
      query('SELECT COUNT(*) as count, status FROM arbitration_enrollments GROUP BY status')
    ]);

    res.json({
      success: true,
      data: {
        total_users: parseInt(users.rows[0]?.count || 0),
        tariff_orders: tariffs.rows,
        boc3_orders: boc3s.rows,
        arbitration_enrollments: arbitrations.rows
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to get stats' });
  }
});

// ==================== USERS ====================

// List all users
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT id, email, company_name, mc_number, usdot_number, phone,
             created_at, email_verified
      FROM users
      ORDER BY created_at DESC
      LIMIT 100
    `);

    res.json({
      success: true,
      data: { users: result.rows }
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ success: false, message: 'Failed to list users' });
  }
});

// Search users
router.get('/users/search', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ success: false, message: 'Search query required' });
    }

    const result = await query(`
      SELECT id, email, company_name, mc_number, usdot_number, phone, created_at
      FROM users
      WHERE email ILIKE $1
         OR company_name ILIKE $1
         OR mc_number ILIKE $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [`%${q}%`]);

    res.json({
      success: true,
      data: { users: result.rows }
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ success: false, message: 'Failed to search users' });
  }
});

// Get user details with all orders
router.get('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    const [user, tariffs, boc3s, arbitrations] = await Promise.all([
      query('SELECT * FROM users WHERE id = $1', [userId]),
      query('SELECT * FROM tariff_orders WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
      query('SELECT * FROM boc3_orders WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
      query('SELECT * FROM arbitration_enrollments WHERE user_id = $1 ORDER BY created_at DESC', [userId])
    ]);

    if (user.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Remove password from response
    const userData = { ...user.rows[0] };
    delete userData.password;

    res.json({
      success: true,
      data: {
        user: userData,
        tariff_orders: tariffs.rows,
        boc3_orders: boc3s.rows,
        arbitration_enrollments: arbitrations.rows
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Failed to get user' });
  }
});

// ==================== ORDERS ====================

// List all orders (with filters)
router.get('/orders', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { type, status, limit = 50 } = req.query;

    let orders = [];

    if (!type || type === 'tariff') {
      const tariffs = await query(`
        SELECT t.*, u.email, u.company_name, u.mc_number, 'tariff' as order_type
        FROM tariff_orders t
        JOIN users u ON t.user_id = u.id
        ${status ? 'WHERE t.status = $1' : ''}
        ORDER BY t.created_at DESC
        LIMIT $${status ? '2' : '1'}
      `, status ? [status, limit] : [limit]);
      orders = orders.concat(tariffs.rows);
    }

    if (!type || type === 'boc3') {
      const boc3s = await query(`
        SELECT b.*, u.email, u.company_name, u.mc_number, 'boc3' as order_type
        FROM boc3_orders b
        JOIN users u ON b.user_id = u.id
        ${status ? 'WHERE b.status = $1' : ''}
        ORDER BY b.created_at DESC
        LIMIT $${status ? '2' : '1'}
      `, status ? [status, limit] : [limit]);
      orders = orders.concat(boc3s.rows);
    }

    if (!type || type === 'arbitration') {
      const arbs = await query(`
        SELECT a.*, u.email, u.company_name, u.mc_number, 'arbitration' as order_type
        FROM arbitration_enrollments a
        JOIN users u ON a.user_id = u.id
        ${status ? 'WHERE a.status = $1' : ''}
        ORDER BY a.created_at DESC
        LIMIT $${status ? '2' : '1'}
      `, status ? [status, limit] : [limit]);
      orders = orders.concat(arbs.rows);
    }

    // Sort all by date
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({
      success: true,
      data: { orders: orders.slice(0, parseInt(limit)) }
    });
  } catch (error) {
    console.error('List orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to list orders' });
  }
});

// Update order status
router.patch('/orders/:type/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { type, id } = req.params;
    const { status, document_url, notes } = req.body;

    let tableName;
    switch (type) {
      case 'tariff': tableName = 'tariff_orders'; break;
      case 'boc3': tableName = 'boc3_orders'; break;
      case 'arbitration': tableName = 'arbitration_enrollments'; break;
      default:
        return res.status(400).json({ success: false, message: 'Invalid order type' });
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (status) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }
    if (document_url) {
      updates.push(`document_url = $${paramCount++}`);
      values.push(document_url);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramCount++}`);
      values.push(notes);
    }
    updates.push(`updated_at = NOW()`);

    if (updates.length === 1) {
      return res.status(400).json({ success: false, message: 'No updates provided' });
    }

    values.push(id);
    const result = await query(
      `UPDATE ${tableName} SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.json({
      success: true,
      message: 'Order updated successfully',
      data: { order: result.rows[0] }
    });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ success: false, message: 'Failed to update order' });
  }
});

// Delete order
router.delete('/orders/:type/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { type, id } = req.params;

    let tableName;
    switch (type) {
      case 'tariff': tableName = 'tariff_orders'; break;
      case 'boc3': tableName = 'boc3_orders'; break;
      case 'arbitration': tableName = 'arbitration_enrollments'; break;
      default:
        return res.status(400).json({ success: false, message: 'Invalid order type' });
    }

    const result = await query(`DELETE FROM ${tableName} WHERE id = $1 RETURNING id`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.json({
      success: true,
      message: 'Order deleted successfully'
    });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete order' });
  }
});

// Bulk delete orders (cleanup)
router.post('/orders/cleanup', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { type, status, before_date, no_payment } = req.body;

    let results = { tariff: 0, boc3: 0, arbitration: 0 };

    if (!type || type === 'boc3') {
      let deleteQuery = 'DELETE FROM boc3_orders WHERE 1=1';
      const values = [];
      let paramCount = 1;

      if (status) {
        deleteQuery += ` AND status = $${paramCount++}`;
        values.push(status);
      }
      if (before_date) {
        deleteQuery += ` AND created_at < $${paramCount++}`;
        values.push(before_date);
      }
      if (no_payment) {
        deleteQuery += ` AND (payment_id IS NULL OR payment_id = '')`;
      }

      const result = await query(deleteQuery + ' RETURNING id', values);
      results.boc3 = result.rows.length;
    }

    if (!type || type === 'tariff') {
      let deleteQuery = 'DELETE FROM tariff_orders WHERE 1=1';
      const values = [];
      let paramCount = 1;

      if (status) {
        deleteQuery += ` AND status = $${paramCount++}`;
        values.push(status);
      }
      if (before_date) {
        deleteQuery += ` AND created_at < $${paramCount++}`;
        values.push(before_date);
      }
      if (no_payment) {
        deleteQuery += ` AND (payment_id IS NULL OR payment_id = '')`;
      }

      const result = await query(deleteQuery + ' RETURNING id', values);
      results.tariff = result.rows.length;
    }

    res.json({
      success: true,
      message: 'Cleanup completed',
      data: { deleted: results }
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ success: false, message: 'Failed to cleanup orders' });
  }
});

// ==================== DOCUMENT UPLOAD ====================

// Upload document for an order
router.post('/upload/:type/:id', authenticateToken, requireAdmin, upload.single('document'), async (req, res) => {
  try {
    const { type, id } = req.params;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    let tableName;
    switch (type) {
      case 'tariff': tableName = 'tariff_orders'; break;
      case 'boc3': tableName = 'boc3_orders'; break;
      case 'arbitration': tableName = 'arbitration_enrollments'; break;
      default:
        return res.status(400).json({ success: false, message: 'Invalid order type' });
    }

    // Generate document URL
    const documentUrl = `/uploads/${req.file.filename}`;

    // Update order with document URL
    const result = await query(
      `UPDATE ${tableName}
       SET document_url = $1, status = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [documentUrl, 'completed', id]
    );

    if (result.rows.length === 0) {
      // Delete uploaded file if order not found
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.json({
      success: true,
      message: 'Document uploaded successfully',
      data: {
        order: result.rows[0],
        document_url: documentUrl
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    // Clean up file on error
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(500).json({ success: false, message: 'Failed to upload document' });
  }
});

// ==================== MANUAL ORDER CREATION ====================

// Create order for a user (admin bypass payment)
router.post('/orders/create', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { user_id, type, data } = req.body;

    if (!user_id || !type) {
      return res.status(400).json({ success: false, message: 'User ID and type required' });
    }

    let result;
    const now = new Date();
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    switch (type) {
      case 'tariff':
        result = await query(
          `INSERT INTO tariff_orders
           (user_id, status, pricing_method, service_territory, accessorials, payment_id, amount_paid)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            user_id,
            data?.status || 'completed',
            data?.pricing_method || 'weight',
            data?.service_territory || 'nationwide',
            JSON.stringify(data?.accessorials || []),
            'admin_created_' + Date.now(),
            data?.amount || 299
          ]
        );
        break;

      case 'boc3':
        result = await query(
          `INSERT INTO boc3_orders
           (user_id, status, filing_type, payment_id, amount_paid)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [
            user_id,
            data?.status || 'filed',
            data?.filing_type || 'new',
            'admin_created_' + Date.now(),
            data?.amount || 99
          ]
        );
        break;

      case 'arbitration':
        result = await query(
          `INSERT INTO arbitration_enrollments
           (user_id, status, enrolled_date, expiry_date, payment_id, amount_paid)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            user_id,
            data?.status || 'active',
            now,
            expiryDate,
            'admin_created_' + Date.now(),
            data?.amount || 99
          ]
        );
        break;

      default:
        return res.status(400).json({ success: false, message: 'Invalid order type' });
    }

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: { order: result.rows[0] }
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ success: false, message: 'Failed to create order' });
  }
});

module.exports = router;
