const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();

// Middleware
app.use(cors({
    origin: [
        'https://amplarii-communications-intelligence-vceu.onrender.com',
        'https://amplarii-communications-intelligenc-ten.vercel.app',
        'http://localhost:3000'
    ],
    credentials: true
}));
app.use(express.json());

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key';

// Initialize database tables
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                job_title VARCHAR(255),
                company VARCHAR(255),
                industry VARCHAR(255),
                team_size VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS assessments (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                responses JSONB NOT NULL,
                scores JSONB NOT NULL,
                dominant_traits VARCHAR(255),
                signature VARCHAR(255),
                signature_key VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('Database tables initialized');
    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

initDB();

// Auth middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
}

// Routes
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { fullName, email, password, jobTitle, company, industry, teamSize } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({ error: 'Full name, email, and password are required' });
        }

        // Check if user already exists
        const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Insert new user
        const result = await pool.query(`
            INSERT INTO users (full_name, email, password_hash, job_title, company, industry, team_size)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, full_name, email, job_title, company, industry, team_size
        `, [fullName, email, passwordHash, jobTitle, company, industry, teamSize]);

        const user = result.rows[0];

        // Generate JWT token
        const token = jwt.sign({ 
            userId: user.id, 
            email: user.email 
        }, JWT_SECRET, { expiresIn: '30d' });

        res.status(201).json({
            token,
            user: {
                fullName: user.full_name,
                email: user.email,
                jobTitle: user.job_title,
                company: user.company,
                industry: user.industry,
                teamSize: user.team_size
            }
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Find user
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = result.rows[0];

        // Check password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Generate JWT token
        const token = jwt.sign({ 
            userId: user.id, 
            email: user.email 
        }, JWT_SECRET, { expiresIn: '30d' });

        res.json({
            token,
            user: {
                fullName: user.full_name,
                email: user.email,
                jobTitle: user.job_title,
                company: user.company,
                industry: user.industry,
                teamSize: user.team_size
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

app.get('/api/assessment/:email', authenticateToken, async (req, res) => {
    try {
        const { email } = req.params;
        
        const result = await pool.query(
            'SELECT * FROM assessments WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.json({ assessment: null });
        }

        res.json({ assessment: result.rows[0] });
    } catch (error) {
        console.error('Get assessment error:', error);
        res.status(500).json({ error: 'Failed to retrieve assessment' });
    }
});

app.post('/api/chat', authenticateToken, async (req, res) => {
    try {
        const { message } = req.body;
        
        // Simple AI response for now
        const responses = [
            "I understand you're asking about your communication style. Based on your assessment results, I can help you understand how to adapt your approach.",
            "That's a great question about communication! Your results show specific patterns that can help guide your interactions.",
            "Communication is complex, and your assessment provides insights into your natural preferences. Let me help you understand this better."
        ];
        
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        
        res.json({ 
            response: randomResponse,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Chat service temporarily unavailable' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Handle all routes for Vercel
module.exports = app;