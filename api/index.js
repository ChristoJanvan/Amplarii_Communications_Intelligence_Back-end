const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Database
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://neondb_owner:npg_PLMVTd7Ysh5p@ep-solitary-river-abbrl7x6-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require',
    ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'amplarii-secret-key-2025';

// Initialize DB
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
                responses JSONB,
                scores JSONB,
                signature VARCHAR(255),
                signature_key VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        console.log('Database initialized');
    } catch (error) {
        console.error('DB init error:', error);
    }
}

// Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', time: new Date() });
});

app.post('/api/auth/signup', async (req, res) => {
    try {
        const { fullName, email, password, jobTitle, company, industry, teamSize } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password required' });
        }

        // Check existing user
        const existing = await pool.query('SELECT email FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Hash password
        const hash = await bcrypt.hash(password, 10);

        // Insert user
        const result = await pool.query(`
            INSERT INTO users (full_name, email, password_hash, job_title, company, industry, team_size)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, full_name, email, job_title, company, industry, team_size
        `, [fullName, email, hash, jobTitle || '', company || '', industry || '', teamSize || '']);

        const user = result.rows[0];

        // Generate token
        const token = jwt.sign({ userId: user.id, email }, JWT_SECRET, { expiresIn: '30d' });

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
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user.id, email }, JWT_SECRET, { expiresIn: '30d' });

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
        res.status(500).json({ error: 'Login failed' });
    }
});

// Initialize and export
initDB();
module.exports = app;