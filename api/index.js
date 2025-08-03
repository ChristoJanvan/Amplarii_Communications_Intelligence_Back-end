const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// CORS configuration for Vercel
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Persistent storage (use database in production)
global.users = global.users || [];
global.assessments = global.assessments || [];
global.purchases = global.purchases || [];

let users = global.users;
let assessments = global.assessments;
let purchases = global.purchases;

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production'
  });
});

// Basic API route
app.get('/api', (req, res) => {
  res.json({
    message: 'Amplarii API is running',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      users: '/api/users/profile',
      assessments: '/api/assessments/results',
      purchases: '/api/purchases/payment'
    }
  });
});

// User profile endpoint
app.post('/api/users/profile', async (req, res) => {
  try {
    const { fullName, email, jobTitle, company, industry, teamSize, emailUpdates } = req.body;

    if (!fullName || !email) {
      return res.status(400).json({ error: 'Name and email required' });
    }

    // Check if user exists
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    let user;
    if (existingUser.rows.length > 0) {
      // Update existing user
      const updateResult = await pool.query(
        'UPDATE users SET full_name = $1, job_title = $2, company = $3, industry = $4, team_size = $5, email_updates = $6 WHERE email = $7 RETURNING *',
        [fullName, jobTitle, company, industry, teamSize, emailUpdates, email]
      );
      user = updateResult.rows[0];
    } else {
      // Create new user
      const insertResult = await pool.query(
        'INSERT INTO users (full_name, email, job_title, company, industry, team_size, email_updates) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [fullName, email, jobTitle, company, industry, teamSize, emailUpdates]
      );
      user = insertResult.rows[0];
    }

    res.json({
      success: true,
      message: existingUser.rows.length > 0 ? 'Profile updated' : 'Profile created',
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        jobTitle: user.job_title,
        company: user.company,
        industry: user.industry,
        teamSize: user.team_size,
        emailUpdates: user.email_updates
      }
    });

  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

// Assessment results endpoint
app.post('/api/assessments/results', async (req, res) => {
  try {
    const { email, responses, scores, dominantTraits, signature, signatureKey } = req.body;

    if (!email || !signature) {
      return res.status(400).json({ error: 'Email and signature required' });
    }

    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;
    
    const assessmentResult = await pool.query(
      'INSERT INTO assessments (user_id, responses, scores, dominant_traits, signature, signature_key) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [userId, JSON.stringify(responses), JSON.stringify(scores), JSON.stringify(dominantTraits), signature, signatureKey]
    );

    res.status(201).json({
      success: true,
      message: 'Assessment results saved',
      assessmentId: assessmentResult.rows[0].id,
      signature: signature
    });

  } catch (error) {
    console.error('Assessment error:', error);
    res.status(500).json({ error: 'Failed to save assessment' });
  }
});

// Payment endpoint (mock for demo)
app.post('/api/purchases/payment', async (req, res) => {
  try {
    const { email, serviceType, amount, token } = req.body;

    if (!email || !serviceType || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;
    
    // Mock payment processing
    const purchaseResult = await pool.query(
      'INSERT INTO purchases (user_id, service_type, amount, status, transaction_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [userId, serviceType, amount, 'completed', 'mock_' + Date.now()]
    );

    res.json({
      success: true,
      purchaseId: purchaseResult.rows[0].id,
      transactionId: 'mock_' + Date.now(),
      status: 'completed'
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

// Global error handler
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Export for Vercel
module.exports = app;