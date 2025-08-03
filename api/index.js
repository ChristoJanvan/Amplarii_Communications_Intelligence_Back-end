const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const app = express();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Create tables on startup
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        job_title VARCHAR(255),
        company VARCHAR(255),
        industry VARCHAR(255),
        team_size VARCHAR(50),
        email_updates BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS assessments (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        responses TEXT NOT NULL,
        scores TEXT NOT NULL,
        dominant_traits TEXT NOT NULL,
        signature VARCHAR(255) NOT NULL,
        signature_key VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS purchases (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        service_type VARCHAR(255) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        token VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

initDatabase();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api', limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API info
app.get('/api', (req, res) => {
  res.json({
    message: 'Amplarii API is running',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api'
    }
  });
});

// User profile endpoint
app.post('/api/users/profile', async (req, res) => {
  try {
    const { fullName, email, jobTitle, company, industry, teamSize, emailUpdates } = req.body;

    if (!fullName || !email) {
      return res.status(400).json({ error: 'Full name and email are required' });
    }

    const query = `
      INSERT INTO users (full_name, email, job_title, company, industry, team_size, email_updates)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (email) 
      DO UPDATE SET 
        full_name = $1, job_title = $3, company = $4, industry = $5, team_size = $6, email_updates = $7
      RETURNING *
    `;

    const result = await pool.query(query, [fullName, email, jobTitle, company, industry, teamSize, emailUpdates]);
    
    res.json({ 
      success: true, 
      message: 'Profile saved successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Profile save error:', error);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

// Assessment results endpoint
app.post('/api/assessments/results', async (req, res) => {
  try {
    const { email, responses, scores, dominantTraits, signature, signatureKey } = req.body;

    if (!email || !signature) {
      return res.status(400).json({ error: 'Email and signature are required' });
    }

    // First check if user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length === 0) {
      return res.status(400).json({ error: 'User profile not found. Please create profile first.' });
    }

    const query = `
      INSERT INTO assessments (email, responses, scores, dominant_traits, signature, signature_key)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await pool.query(query, [
      email,
      JSON.stringify(responses),
      JSON.stringify(scores),
      JSON.stringify(dominantTraits),
      signature,
      signatureKey
    ]);

    res.json({ 
      success: true, 
      message: 'Assessment saved successfully',
      assessment: result.rows[0]
    });
  } catch (error) {
    console.error('Assessment save error:', error);
    res.status(500).json({ error: 'Failed to save assessment' });
  }
});

// Payment endpoint
app.post('/api/purchases/payment', async (req, res) => {
  try {
    const { email, serviceType, amount, token } = req.body;

    if (!email || !serviceType || !amount) {
      return res.status(400).json({ error: 'Email, service type, and amount are required' });
    }

    // Mock payment processing for now
    const query = `
      INSERT INTO purchases (email, service_type, amount, token, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await pool.query(query, [email, serviceType, amount, token, 'completed']);

    res.json({ 
      success: true, 
      message: 'Payment processed successfully',
      purchase: result.rows[0]
    });
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ error: 'Payment processing failed' });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    method: req.method,
    url: req.originalUrl
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Amplarii API running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  });
}

module.exports = app;
