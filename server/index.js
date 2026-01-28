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

    // Add notes to arbitration_enrollments if missing
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='arbitration_enrollments' AND column_name='notes') THEN
          ALTER TABLE arbitration_enrollments ADD COLUMN notes TEXT;
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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Clean URL routing - serve HTML files without .html extension
const pages = ['admin', 'login', 'register', 'forgot-password', 'dashboard', 'arbitration-program', 'tariff', 'boc-3', 'pricing', 'verify', 'contact', 'about', 'faqs'];

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
});

module.exports = app;
