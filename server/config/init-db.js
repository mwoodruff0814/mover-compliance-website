require('dotenv').config();
const { pool } = require('./database');

const initDatabase = async () => {
  console.log('Initializing database schema...');

  try {
    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        company_name VARCHAR(255) NOT NULL,
        mc_number VARCHAR(20),
        usdot_number VARCHAR(20),
        contact_name VARCHAR(255),
        phone VARCHAR(20),
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(2),
        zip VARCHAR(10),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('Created users table');

    // Arbitration enrollments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS arbitration_enrollments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'pending',
        enrolled_date DATE,
        expiry_date DATE,
        payment_id VARCHAR(100),
        amount_paid DECIMAL(10,2),
        document_url TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('Created arbitration_enrollments table');

    // Tariff orders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tariff_orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'pending',
        pricing_method VARCHAR(50),
        service_territory TEXT,
        accessorials JSONB,
        special_notes TEXT,
        notes TEXT,
        payment_id VARCHAR(100),
        amount_paid DECIMAL(10,2),
        document_url TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('Created tariff_orders table');

    // BOC-3 orders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS boc3_orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'pending',
        filing_type VARCHAR(50),
        payment_id VARCHAR(100),
        amount_paid DECIMAL(10,2),
        filed_date DATE,
        document_url TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('Created boc3_orders table');

    // Bundle orders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bundle_orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        bundle_type VARCHAR(50),
        status VARCHAR(20) DEFAULT 'pending',
        payment_id VARCHAR(100),
        amount_paid DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('Created bundle_orders table');

    // Consumer verifications table (public)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS consumer_verifications (
        id SERIAL PRIMARY KEY,
        consumer_name VARCHAR(255),
        consumer_email VARCHAR(255),
        consumer_phone VARCHAR(20),
        mover_name VARCHAR(255),
        mover_mc_number VARCHAR(20),
        dispute_type VARCHAR(50),
        filed_claim_with_mover BOOLEAN DEFAULT false,
        verification_result VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('Created consumer_verifications table');

    // Contact submissions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contact_submissions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        subject VARCHAR(255),
        message TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'new',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('Created contact_submissions table');

    // Password reset tokens table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('Created password_reset_tokens table');

    // Add missing columns to existing tables (for migrations)
    console.log('Running migrations for existing tables...');

    // Add document_url and notes to boc3_orders if missing
    await pool.query(`
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
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='arbitration_enrollments' AND column_name='notes') THEN
          ALTER TABLE arbitration_enrollments ADD COLUMN notes TEXT;
        END IF;
      END $$;
    `);

    // Add notes to tariff_orders if missing
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tariff_orders' AND column_name='notes') THEN
          ALTER TABLE tariff_orders ADD COLUMN notes TEXT;
        END IF;
      END $$;
    `);

    // Add rates column to tariff_orders if missing
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tariff_orders' AND column_name='rates') THEN
          ALTER TABLE tariff_orders ADD COLUMN rates JSONB;
        END IF;
      END $$;
    `);

    // Add expiry_date and enrolled_date to tariff_orders
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tariff_orders' AND column_name='expiry_date') THEN
          ALTER TABLE tariff_orders ADD COLUMN expiry_date DATE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tariff_orders' AND column_name='enrolled_date') THEN
          ALTER TABLE tariff_orders ADD COLUMN enrolled_date DATE;
        END IF;
      END $$;
    `);

    // Add expiry_date and enrolled_date to boc3_orders
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='boc3_orders' AND column_name='expiry_date') THEN
          ALTER TABLE boc3_orders ADD COLUMN expiry_date DATE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='boc3_orders' AND column_name='enrolled_date') THEN
          ALTER TABLE boc3_orders ADD COLUMN enrolled_date DATE;
        END IF;
      END $$;
    `);

    // Add autopay fields to users table
    await pool.query(`
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
    await pool.query(`
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
      )
    `);

    // Create pricing_method_requests table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pricing_method_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        tariff_id INTEGER REFERENCES tariff_orders(id) ON DELETE CASCADE,
        current_method VARCHAR(50),
        requested_method VARCHAR(50),
        status VARCHAR(20) DEFAULT 'pending',
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        reviewed_at TIMESTAMP
      )
    `);

    console.log('Migrations complete');

    // Create indexes for better performance
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_mc_number ON users(mc_number)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_arbitration_user_id ON arbitration_enrollments(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_arbitration_status ON arbitration_enrollments(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tariff_user_id ON tariff_orders(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_boc3_user_id ON boc3_orders(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_verifications_mc ON consumer_verifications(mover_mc_number)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tariff_expiry ON tariff_orders(expiry_date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_boc3_expiry ON boc3_orders(expiry_date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_arbitration_expiry ON arbitration_enrollments(expiry_date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_pricing_requests_status ON pricing_method_requests(status)`);
    console.log('Created indexes');

    console.log('Database initialization complete!');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

initDatabase();
