const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { sendBOC3FilingComplete, sendDocumentReadyWithAttachment, sendTariffDocumentReady } = require('../utils/email');
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

// Base uploads directory
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Created uploads directory:', uploadsDir);
}

// Helper to create safe folder name from company name
function sanitizeFolderName(name) {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '_')             // Replace spaces with underscores
    .substring(0, 50);                 // Limit length
}

// Helper to get or create company folder
async function getCompanyFolder(userId) {
  try {
    const result = await query(
      'SELECT company_name, mc_number FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return uploadsDir; // Fallback to main uploads dir
    }

    const user = result.rows[0];
    const mcNumber = user.mc_number ? user.mc_number.replace(/[^0-9]/g, '') : '';
    const companyName = user.company_name || 'Unknown';

    // Create folder name: MC_CompanyName
    const folderName = mcNumber
      ? `MC${mcNumber}_${sanitizeFolderName(companyName)}`
      : sanitizeFolderName(companyName);

    const companyDir = path.join(uploadsDir, folderName);

    // Create subfolders for document types
    const subfolders = ['tariff', 'boc3', 'arbitration', 'other'];
    for (const subfolder of subfolders) {
      const subDir = path.join(companyDir, subfolder);
      if (!fs.existsSync(subDir)) {
        fs.mkdirSync(subDir, { recursive: true });
      }
    }

    return companyDir;
  } catch (error) {
    console.error('Error getting company folder:', error);
    return uploadsDir;
  }
}

// Configure multer - use memory storage, we'll save to proper folder after
const upload = multer({
  storage: multer.memoryStorage(),
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

console.log('Local file storage configured. Uploads directory:', uploadsDir);

// ==================== DEBUG ====================

// Check upload configuration
router.get('/debug/upload-check', (req, res) => {
  res.json({
    uploads_enabled: true,
    storage_type: 'local',
    uploads_directory: uploadsDir,
    directory_exists: fs.existsSync(uploadsDir)
  });
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
             created_at
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
    const { status, document_url, notes, notify_customer } = req.body;

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

    const order = result.rows[0];

    // Send customer notification if status changed to completed/filed and notify_customer is true
    if (notify_customer !== false && status && ['completed', 'filed', 'active'].includes(status)) {
      try {
        // Get user info for email
        const userResult = await query('SELECT * FROM users WHERE id = $1', [order.user_id]);
        if (userResult.rows.length > 0) {
          const user = userResult.rows[0];

          if (type === 'boc3' && (status === 'filed' || status === 'completed')) {
            sendBOC3FilingComplete(user, order);
          } else if (type === 'tariff' && status === 'completed') {
            sendTariffDocumentReady(user, order);
          }
          // Can add more notification types here
        }
      } catch (emailError) {
        console.error('Failed to send customer notification:', emailError);
      }
    }

    res.json({
      success: true,
      message: 'Order updated successfully',
      data: { order }
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
router.post('/upload/:type/:id', authenticateToken, requireAdmin, (req, res, next) => {
  upload.single('document')(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({
        success: false,
        message: 'Upload failed: ' + err.message
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { type, id } = req.params;
    const notify_customer = req.body.notify_customer !== 'false'; // Default to true

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

    // Get user_id from the order first
    const orderCheck = await query(`SELECT user_id FROM ${tableName} WHERE id = $1`, [id]);
    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const userId = orderCheck.rows[0].user_id;

    // Get company folder and create subfolders
    const companyDir = await getCompanyFolder(userId);
    const typeFolder = type; // tariff, boc3, or arbitration
    const saveDir = path.join(companyDir, typeFolder);

    // Ensure directory exists
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }

    // Generate unique filename
    const ext = path.extname(req.file.originalname).toLowerCase();
    const baseName = req.file.originalname.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '_');
    const uniqueName = `${Date.now()}-${baseName}${ext}`;
    const filePath = path.join(saveDir, uniqueName);

    // Save file from memory buffer
    fs.writeFileSync(filePath, req.file.buffer);

    // Calculate relative URL path from uploads directory
    const relativePath = path.relative(uploadsDir, filePath).replace(/\\/g, '/');
    const documentUrl = `/uploads/${relativePath}`;

    // Log upload details for debugging
    console.log('Upload complete:', {
      originalName: req.file.originalname,
      filename: uniqueName,
      path: filePath,
      url: documentUrl,
      companyDir: companyDir
    });

    // Update order with document URL
    const result = await query(
      `UPDATE ${tableName}
       SET document_url = $1, status = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [documentUrl, 'completed', id]
    );

    const order = result.rows[0];

    // Send customer notification
    if (notify_customer) {
      try {
        const userResult = await query('SELECT * FROM users WHERE id = $1', [order.user_id]);
        if (userResult.rows.length > 0) {
          const user = userResult.rows[0];
          // Send email with attachment
          sendDocumentReadyWithAttachment(user, type, order, filePath);
        }
      } catch (emailError) {
        console.error('Failed to send document notification:', emailError);
      }
    }

    res.json({
      success: true,
      message: 'Document uploaded successfully' + (notify_customer ? ' and customer notified' : ''),
      data: {
        order,
        document_url: documentUrl
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
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

// ==================== DOCUMENT MANAGEMENT ====================

// List all uploaded documents
router.get('/documents', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const tables = ['tariff_orders', 'boc3_orders', 'arbitration_enrollments'];
    let documents = [];

    for (const table of tables) {
      const result = await query(
        `SELECT id, document_url, created_at, updated_at, user_id FROM ${table}
         WHERE document_url IS NOT NULL
         ORDER BY updated_at DESC`
      );

      for (const row of result.rows) {
        documents.push({
          table,
          id: row.id,
          user_id: row.user_id,
          document_url: row.document_url,
          created_at: row.created_at,
          updated_at: row.updated_at
        });
      }
    }

    // Sort by updated_at
    documents.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    res.json({
      success: true,
      data: {
        count: documents.length,
        documents
      }
    });
  } catch (error) {
    console.error('List documents error:', error);
    res.status(500).json({ success: false, message: 'Failed to list documents' });
  }
});

// Recursively get all files in a directory
function getAllFiles(dirPath, arrayOfFiles = [], basePath = '') {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    const relativePath = basePath ? `${basePath}/${file}` : file;

    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles, relativePath);
    } else {
      const stats = fs.statSync(fullPath);
      arrayOfFiles.push({
        filename: file,
        path: relativePath,
        url: `/uploads/${relativePath.replace(/\\/g, '/')}`,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime
      });
    }
  });

  return arrayOfFiles;
}

// List all files in uploads directory (including subfolders)
router.get('/uploads-list', authenticateToken, requireAdmin, (req, res) => {
  try {
    const files = getAllFiles(uploadsDir);
    files.sort((a, b) => new Date(b.modified) - new Date(a.modified));

    // Group by company folder
    const byCompany = {};
    files.forEach(file => {
      const parts = file.path.split(/[/\\]/);
      const company = parts.length > 1 ? parts[0] : 'root';
      if (!byCompany[company]) {
        byCompany[company] = [];
      }
      byCompany[company].push(file);
    });

    res.json({
      success: true,
      data: {
        directory: uploadsDir,
        total_files: files.length,
        by_company: byCompany,
        all_files: files
      }
    });
  } catch (error) {
    console.error('List uploads error:', error);
    res.status(500).json({ success: false, message: 'Failed to list uploads' });
  }
});

// List company folders
router.get('/companies', authenticateToken, requireAdmin, (req, res) => {
  try {
    const folders = fs.readdirSync(uploadsDir)
      .filter(item => {
        const fullPath = path.join(uploadsDir, item);
        return fs.statSync(fullPath).isDirectory();
      })
      .map(folder => {
        const folderPath = path.join(uploadsDir, folder);
        const subfolders = fs.readdirSync(folderPath)
          .filter(item => fs.statSync(path.join(folderPath, item)).isDirectory());

        // Count files in each subfolder
        const fileCount = {};
        let totalFiles = 0;
        subfolders.forEach(sub => {
          const subPath = path.join(folderPath, sub);
          const files = fs.readdirSync(subPath).filter(f =>
            fs.statSync(path.join(subPath, f)).isFile()
          );
          fileCount[sub] = files.length;
          totalFiles += files.length;
        });

        return {
          name: folder,
          subfolders,
          file_count: fileCount,
          total_files: totalFiles
        };
      });

    res.json({
      success: true,
      data: {
        count: folders.length,
        companies: folders
      }
    });
  } catch (error) {
    console.error('List companies error:', error);
    res.status(500).json({ success: false, message: 'Failed to list companies' });
  }
});

// ==================== USER AUTOPAY MANAGEMENT ====================

// Get user autopay details
router.get('/users/:id/autopay', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    const userResult = await query(
      `SELECT id, email, company_name, mc_number, autopay_enabled, autopay_card_last4,
              autopay_card_brand, square_customer_id
       FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = userResult.rows[0];

    // Get upcoming renewals (services expiring in next 30 days)
    const [tariffs, boc3s, arbitrations] = await Promise.all([
      query(
        `SELECT id, order_id, 'tariff' as type, expiry_date, amount_paid
         FROM tariff_orders
         WHERE user_id = $1 AND status = 'completed' AND expiry_date IS NOT NULL
         AND expiry_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'`,
        [userId]
      ),
      query(
        `SELECT id, order_id, 'boc3' as type, expiry_date, amount_paid
         FROM boc3_orders
         WHERE user_id = $1 AND status IN ('completed', 'filed') AND expiry_date IS NOT NULL
         AND expiry_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'`,
        [userId]
      ),
      query(
        `SELECT id, order_id, 'arbitration' as type, expiry_date, amount_paid
         FROM arbitration_enrollments
         WHERE user_id = $1 AND status = 'active' AND expiry_date IS NOT NULL
         AND expiry_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'`,
        [userId]
      )
    ]);

    const upcomingRenewals = [...tariffs.rows, ...boc3s.rows, ...arbitrations.rows]
      .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date));

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          company_name: user.company_name,
          mc_number: user.mc_number
        },
        autopay: {
          enabled: user.autopay_enabled || false,
          has_card: !!user.autopay_card_last4,
          card_last4: user.autopay_card_last4,
          card_brand: user.autopay_card_brand,
          has_square_customer: !!user.square_customer_id
        },
        upcoming_renewals: upcomingRenewals
      }
    });
  } catch (error) {
    console.error('Get user autopay error:', error);
    res.status(500).json({ success: false, message: 'Failed to get user autopay info' });
  }
});

// Toggle user autopay (admin override)
router.patch('/users/:id/autopay', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { enabled } = req.body;

    await query(
      'UPDATE users SET autopay_enabled = $1, updated_at = NOW() WHERE id = $2',
      [enabled, userId]
    );

    // Create notification for user
    await query(
      `INSERT INTO notifications (user_id, type, service_type, service_id, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        'autopay_update',
        'account',
        0,
        enabled
          ? 'Autopay has been enabled on your account by an administrator.'
          : 'Autopay has been disabled on your account by an administrator.'
      ]
    );

    res.json({
      success: true,
      message: `Autopay ${enabled ? 'enabled' : 'disabled'} for user`
    });
  } catch (error) {
    console.error('Toggle user autopay error:', error);
    res.status(500).json({ success: false, message: 'Failed to update autopay' });
  }
});

// Remove user card (admin override)
router.delete('/users/:id/autopay/card', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    // Get user's card info
    const userResult = await query(
      'SELECT autopay_card_id, square_customer_id FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = userResult.rows[0];

    // Disable card in Square if configured
    if (user.autopay_card_id && process.env.SQUARE_ACCESS_TOKEN) {
      try {
        const { Client, Environment } = require('square');
        const squareClient = new Client({
          accessToken: process.env.SQUARE_ACCESS_TOKEN,
          environment: process.env.SQUARE_ENVIRONMENT === 'production'
            ? Environment.Production
            : Environment.Sandbox
        });
        await squareClient.cardsApi.disableCard(user.autopay_card_id);
      } catch (squareError) {
        console.error('Square card disable error:', squareError);
        // Continue anyway
      }
    }

    // Clear autopay info
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

    // Create notification for user
    await query(
      `INSERT INTO notifications (user_id, type, service_type, service_id, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, 'autopay_update', 'account', 0, 'Your saved payment card has been removed by an administrator. Autopay has been disabled.']
    );

    res.json({
      success: true,
      message: 'Card removed and autopay disabled'
    });
  } catch (error) {
    console.error('Remove user card error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove card' });
  }
});

// Cancel upcoming renewal for a specific service
router.post('/users/:id/cancel-renewal', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { service_type, service_id } = req.body;

    if (!service_type || !service_id) {
      return res.status(400).json({
        success: false,
        message: 'Service type and ID are required'
      });
    }

    let tableName;
    switch (service_type) {
      case 'tariff': tableName = 'tariff_orders'; break;
      case 'boc3': tableName = 'boc3_orders'; break;
      case 'arbitration': tableName = 'arbitration_enrollments'; break;
      default:
        return res.status(400).json({ success: false, message: 'Invalid service type' });
    }

    // Set expiry_date to null to prevent auto-renewal (service will still expire naturally)
    // Or we could add a 'renewal_cancelled' flag
    await query(
      `UPDATE ${tableName} SET notes = COALESCE(notes, '') || ' [Auto-renewal cancelled by admin]', updated_at = NOW() WHERE id = $1 AND user_id = $2`,
      [service_id, userId]
    );

    // Create notification for user
    await query(
      `INSERT INTO notifications (user_id, type, service_type, service_id, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, 'renewal_cancelled', service_type, service_id, `Auto-renewal for your ${service_type} service has been cancelled by an administrator.`]
    );

    res.json({
      success: true,
      message: 'Renewal cancelled'
    });
  } catch (error) {
    console.error('Cancel renewal error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel renewal' });
  }
});

// ==================== PRICING METHOD REQUESTS ====================

// Get pending pricing method change requests
router.get('/pricing-requests', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;

    const result = await query(`
      SELECT pmr.*, u.email, u.company_name, u.mc_number,
             t.pricing_method as current_pricing_method
      FROM pricing_method_requests pmr
      JOIN users u ON pmr.user_id = u.id
      JOIN tariff_orders t ON pmr.tariff_id = t.id
      ${status !== 'all' ? 'WHERE pmr.status = $1' : ''}
      ORDER BY pmr.created_at DESC
    `, status !== 'all' ? [status] : []);

    res.json({
      success: true,
      data: { requests: result.rows }
    });
  } catch (error) {
    console.error('Get pricing requests error:', error);
    res.status(500).json({ success: false, message: 'Failed to get pricing requests' });
  }
});

// Approve or reject pricing method change request
router.patch('/pricing-requests/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_notes } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be approved or rejected'
      });
    }

    // Get the request
    const requestResult = await query(
      'SELECT * FROM pricing_method_requests WHERE id = $1',
      [id]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    const request = requestResult.rows[0];

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'This request has already been processed'
      });
    }

    // Update request status
    await query(
      `UPDATE pricing_method_requests
       SET status = $1, admin_notes = $2, reviewed_at = NOW()
       WHERE id = $3`,
      [status, admin_notes || null, id]
    );

    // If approved, update the tariff pricing method
    if (status === 'approved') {
      await query(
        `UPDATE tariff_orders
         SET pricing_method = $1, rates = NULL, updated_at = NOW()
         WHERE id = $2`,
        [request.requested_method, request.tariff_id]
      );
    }

    // Create notification for user
    const notificationMessage = status === 'approved'
      ? `Your request to change pricing method to ${request.requested_method} has been approved. Please update your rates.`
      : `Your request to change pricing method was not approved. ${admin_notes || ''}`;

    await query(
      `INSERT INTO notifications (user_id, type, service_type, service_id, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [request.user_id, 'pricing_method_result', 'tariff', request.tariff_id, notificationMessage]
    );

    res.json({
      success: true,
      message: `Request ${status}`,
      data: { status }
    });
  } catch (error) {
    console.error('Process pricing request error:', error);
    res.status(500).json({ success: false, message: 'Failed to process request' });
  }
});

// ==================== PROFILE CHANGE REQUESTS ====================

// Get pending profile change requests
router.get('/profile-requests', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;

    const result = await query(`
      SELECT pcr.*, u.email, u.company_name, u.mc_number
      FROM profile_change_requests pcr
      JOIN users u ON pcr.user_id = u.id
      ${status !== 'all' ? 'WHERE pcr.status = $1' : ''}
      ORDER BY pcr.created_at DESC
    `, status !== 'all' ? [status] : []);

    res.json({
      success: true,
      data: { requests: result.rows }
    });
  } catch (error) {
    console.error('Get profile requests error:', error);
    res.status(500).json({ success: false, message: 'Failed to get requests' });
  }
});

// Approve or reject profile change request
router.patch('/profile-requests/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_notes } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be approved or rejected'
      });
    }

    // Get the request
    const requestResult = await query(
      'SELECT * FROM profile_change_requests WHERE id = $1',
      [id]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    const request = requestResult.rows[0];

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'This request has already been processed'
      });
    }

    // Update request status
    await query(
      `UPDATE profile_change_requests
       SET status = $1, admin_notes = $2, reviewed_at = NOW()
       WHERE id = $3`,
      [status, admin_notes || null, id]
    );

    // If approved, apply the changes
    if (status === 'approved') {
      const changeType = request.change_type;
      const newValue = request.requested_value;

      if (changeType === 'address') {
        // Parse address (expected format: "address, city, state zip")
        const parts = newValue.split(',').map(p => p.trim());
        if (parts.length >= 2) {
          const address = parts[0];
          const cityStateZip = parts.slice(1).join(',').trim();
          const stateZipMatch = cityStateZip.match(/^(.+?)\s*,?\s*([A-Z]{2})\s*(\d{5})?$/i);

          if (stateZipMatch) {
            await query(
              `UPDATE users SET address = $1, city = $2, state = $3, zip = $4, updated_at = NOW() WHERE id = $5`,
              [address, stateZipMatch[1].trim(), stateZipMatch[2].toUpperCase(), stateZipMatch[3] || '', request.user_id]
            );
          } else {
            // Simple update if can't parse
            await query(
              `UPDATE users SET address = $1, updated_at = NOW() WHERE id = $2`,
              [newValue, request.user_id]
            );
          }
        } else {
          await query(
            `UPDATE users SET address = $1, updated_at = NOW() WHERE id = $2`,
            [newValue, request.user_id]
          );
        }
      } else {
        // Simple field update (company_name, contact_name)
        await query(
          `UPDATE users SET ${changeType} = $1, updated_at = NOW() WHERE id = $2`,
          [newValue, request.user_id]
        );
      }
    }

    // Create notification for user
    const typeLabels = {
      company_name: 'company name',
      contact_name: 'contact name',
      address: 'address'
    };
    const notificationMessage = status === 'approved'
      ? `Your request to change your ${typeLabels[request.change_type]} has been approved and applied.`
      : `Your request to change your ${typeLabels[request.change_type]} was not approved. ${admin_notes || ''}`;

    await query(
      `INSERT INTO notifications (user_id, type, service_type, service_id, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [request.user_id, 'profile_change_result', 'profile', request.id, notificationMessage]
    );

    res.json({
      success: true,
      message: `Request ${status}`,
      data: { status }
    });
  } catch (error) {
    console.error('Process profile request error:', error);
    res.status(500).json({ success: false, message: 'Failed to process request' });
  }
});

// Test autopay processor (admin only)
router.post('/test-autopay', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('[Admin] Manually triggering autopay processor...');
    const { processAutopay } = require('../jobs/autopay-processor');
    await processAutopay();
    res.json({ success: true, message: 'Autopay processor completed' });
  } catch (error) {
    console.error('Test autopay error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Test expiration checker (admin only)
router.post('/test-expiration-check', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('[Admin] Manually triggering expiration checker...');
    const { checkExpirations } = require('../jobs/expiration-checker');
    await checkExpirations();
    res.json({ success: true, message: 'Expiration checker completed' });
  } catch (error) {
    console.error('Test expiration check error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
