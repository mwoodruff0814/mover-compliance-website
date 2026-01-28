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

    // Create indexes for better performance
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_mc_number ON users(mc_number)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_arbitration_user_id ON arbitration_enrollments(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_arbitration_status ON arbitration_enrollments(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tariff_user_id ON tariff_orders(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_boc3_user_id ON boc3_orders(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_verifications_mc ON consumer_verifications(mover_mc_number)`);
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
