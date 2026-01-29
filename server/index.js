require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { query } = require('./config/database');

// Run database migrations on startup
const runMigrations = async () => {
  try {
    console.log('Running database migrations...');

    // Add document_url and notes to boc3_orders if missing
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='boc3_orders' AND column_name='document_url') THEN
          ALTER TABLE boc3_orders ADD COLUMN document_url TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='boc3_orders' AND column_name='notes') THEN
          ALTER TABLE boc3_orders ADD COLUMN notes TEXT;
        END IF;
      END $$;
    `);

    // Add notes and documents to arbitration_enrollments if missing
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='arbitration_enrollments' AND column_name='notes') THEN
          ALTER TABLE arbitration_enrollments ADD COLUMN notes TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='arbitration_enrollments' AND column_name='documents') THEN
          ALTER TABLE arbitration_enrollments ADD COLUMN documents JSONB;
        END IF;
      END $$;
    `);

    // Add notes to tariff_orders if missing
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tariff_orders' AND column_name='notes') THEN
          ALTER TABLE tariff_orders ADD COLUMN notes TEXT;
        END IF;
      END $$;
    `);

    // Add expiry_date and enrolled_date to tariff_orders and boc3_orders
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tariff_orders' AND column_name='expiry_date') THEN
          ALTER TABLE tariff_orders ADD COLUMN expiry_date DATE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tariff_orders' AND column_name='enrolled_date') THEN
          ALTER TABLE tariff_orders ADD COLUMN enrolled_date DATE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='boc3_orders' AND column_name='expiry_date') THEN
          ALTER TABLE boc3_orders ADD COLUMN expiry_date DATE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='boc3_orders' AND column_name='enrolled_date') THEN
          ALTER TABLE boc3_orders ADD COLUMN enrolled_date DATE;
        END IF;
      END $$;
    `);

    // Add autopay columns to users table
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='square_customer_id') THEN
          ALTER TABLE users ADD COLUMN square_customer_id VARCHAR(100);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='autopay_enabled') THEN
          ALTER TABLE users ADD COLUMN autopay_enabled BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='autopay_card_id') THEN
          ALTER TABLE users ADD COLUMN autopay_card_id VARCHAR(100);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='autopay_card_last4') THEN
          ALTER TABLE users ADD COLUMN autopay_card_last4 VARCHAR(4);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='autopay_card_brand') THEN
          ALTER TABLE users ADD COLUMN autopay_card_brand VARCHAR(20);
        END IF;
      END $$;
    `);

    // Create notifications table
    await query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        service_type VARCHAR(20) NOT NULL,
        service_id INTEGER NOT NULL,
        message TEXT,
        read BOOLEAN DEFAULT false,
        email_sent BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create pricing_method_requests table
    await query(`
      CREATE TABLE IF NOT EXISTS pricing_method_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        tariff_id INTEGER REFERENCES tariff_orders(id),
        current_method VARCHAR(50),
        requested_method VARCHAR(50),
        reason TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        reviewed_at TIMESTAMP
      );
    `);

    // Add order_id column to all order tables for randomized order IDs
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tariff_orders' AND column_name='order_id') THEN
          ALTER TABLE tariff_orders ADD COLUMN order_id VARCHAR(20) UNIQUE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='boc3_orders' AND column_name='order_id') THEN
          ALTER TABLE boc3_orders ADD COLUMN order_id VARCHAR(20) UNIQUE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bundle_orders' AND column_name='order_id') THEN
          ALTER TABLE bundle_orders ADD COLUMN order_id VARCHAR(20) UNIQUE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='arbitration_enrollments' AND column_name='order_id') THEN
          ALTER TABLE arbitration_enrollments ADD COLUMN order_id VARCHAR(20) UNIQUE;
        END IF;
      END $$;
    `);

    // Add bundle_id to service tables to link services to bundles
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tariff_orders' AND column_name='bundle_id') THEN
          ALTER TABLE tariff_orders ADD COLUMN bundle_id INTEGER REFERENCES bundle_orders(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='boc3_orders' AND column_name='bundle_id') THEN
          ALTER TABLE boc3_orders ADD COLUMN bundle_id INTEGER REFERENCES bundle_orders(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='arbitration_enrollments' AND column_name='bundle_id') THEN
          ALTER TABLE arbitration_enrollments ADD COLUMN bundle_id INTEGER REFERENCES bundle_orders(id);
        END IF;
      END $$;
    `);

    // Add expiry_date and enrolled_date to bundle_orders
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bundle_orders' AND column_name='expiry_date') THEN
          ALTER TABLE bundle_orders ADD COLUMN expiry_date DATE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bundle_orders' AND column_name='enrolled_date') THEN
          ALTER TABLE bundle_orders ADD COLUMN enrolled_date DATE;
        END IF;
      END $$;
    `);

    console.log('Database migrations complete');
  } catch (error) {
    console.error('Migration error (non-fatal):', error.message);
    // Don't crash the server if migrations fail - tables might not exist yet
  }
};

// Run migrations
runMigrations();

// Import routes
const authRoutes = require('./routes/auth');
const enrollmentsRoutes = require('./routes/enrollments');
const ordersRoutes = require('./routes/orders');
const paymentsRoutes = require('./routes/payments');
const verifyRoutes = require('./routes/verify');
const dashboardRoutes = require('./routes/dashboard');
const contactRoutes = require('./routes/contact');
const adminRoutes = require('./routes/admin');
const autopayRoutes = require('./routes/autopay');

// Import scheduler for background jobs
const { initScheduler } = require('./jobs/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Redirect .html requests to clean URLs BEFORE static file serving
app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    const cleanPath = req.path.replace('.html', '');
    return res.redirect(301, cleanPath === '/index' ? '/' : cleanPath);
  }
  next();
});

// Serve static files
// Serve uploaded documents
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve CSS files
app.use('/css', express.static(path.join(__dirname, '../css')));

// Serve JS files
app.use('/js', express.static(path.join(__dirname, '../js')));

// Serve images
app.use('/images', express.static(path.join(__dirname, '../images')));

// Serve other static assets from root (fonts, favicon, etc.)
app.use(express.static(path.join(__dirname, '..'), {
  index: false
}));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/enrollments', enrollmentsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/verify', verifyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/autopay', autopayRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Clean URL routing - serve HTML files without .html extension
const pages = ['admin', 'login', 'register', 'forgot-password', 'dashboard', 'arbitration-program', 'tariff', 'boc-3', 'pricing', 'verify', 'contact', 'about', 'faqs', 'bundle-checkout'];

pages.forEach(page => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, '..', `${page}.html`));
  });
});

// Fallback to index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  console.error(err.stack);

  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:' + PORT}`);

  // Initialize background job scheduler
  initScheduler();
});

module.exports = app;
