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
    let userIndex = users.findIndex(u => u.email === email);
    
    if (userIndex >= 0) {
      // Update existing user
      users[userIndex] = { ...users[userIndex], fullName, jobTitle, company, industry, teamSize, emailUpdates };
    } else {
      // Create new user
      users.push({
        id: Date.now().toString(),
        fullName,
        email,
        jobTitle,
        company,
        industry,
        teamSize,
        emailUpdates,
        createdAt: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: userIndex >= 0 ? 'Profile updated' : 'Profile created',
      user: users[userIndex >= 0 ? userIndex : users.length - 1]
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

    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const assessment = {
      id: Date.now().toString(),
      userId: user.id,
      responses,
      scores,
      dominantTraits,
      signature,
      signatureKey,
      completedAt: new Date().toISOString()
    };

    assessments.push(assessment);

    res.status(201).json({
      success: true,
      message: 'Assessment results saved',
      assessmentId: assessment.id,
      signature: assessment.signature
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

    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Mock payment processing
    const purchase = {
      id: Date.now().toString(),
      userId: user.id,
      serviceType,
      amount,
      status: 'completed', // Mock success
      transactionId: 'mock_' + Date.now(),
      createdAt: new Date().toISOString()
    };

    purchases.push(purchase);

    res.json({
      success: true,
      purchaseId: purchase.id,
      transactionId: purchase.transactionId,
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