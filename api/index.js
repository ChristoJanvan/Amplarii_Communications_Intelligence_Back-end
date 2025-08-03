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

    // Authentication middleware
    function authenticateToken(req, res, next) {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        return res.status(401).json({ error: 'Access token required' });
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
      } catch (error) {
        return res.status(403).json({ error: 'Invalid token' });
      }
    }

    // User registration
    app.post('/api/auth/register', async (req, res) => {
      try {
        const { fullName, email, password } = req.body;

        if (!fullName || !email || !password) {
          return res.status(400).json({ error: 'All fields required' });
        }

        // Check if user exists
        const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
          return res.status(400).json({ error: 'User already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create user
        const query = `
          INSERT INTO users (full_name, email, password, created_at)
          VALUES ($1, $2, $3, NOW())
          RETURNING id, full_name, email, created_at
        `;
        
        const result = await pool.query(query, [fullName, email, hashedPassword]);
        const user = result.rows[0];

        // Generate JWT
        const token = jwt.sign(
          { userId: user.id, email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        res.status(201).json({
          success: true,
          message: 'User created successfully',
          token,
          user: {
            id: user.id,
            fullName: user.full_name,
            email: user.email
          }
        });

      } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
      }
    });

    // User login
    app.post('/api/auth/login', async (req, res) => {
      try {
        const { email, password } = req.body;

        if (!email || !password) {
          return res.status(400).json({ error: 'Email and password required' });
        }

        // Find user
        const query = `SELECT * FROM users WHERE email = $1`;
        const result = await pool.query(query, [email]);
        
        if (result.rows.length === 0) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT
        const token = jwt.sign(
          { userId: user.id, email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        res.json({
          success: true,
          message: 'Login successful',
          token,
          user: {
            id: user.id,
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

    // Get user profile (protected)
    app.get('/api/users/profile', authenticateToken, async (req, res) => {
      try {
        const query = `SELECT * FROM users WHERE id = $1`;
        const result = await pool.query(query, [req.user.userId]);
        
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];
        res.json({
          success: true,
          user: {
            id: user.id,
            fullName: user.full_name,
            email: user.email,
            jobTitle: user.job_title,
            company: user.company,
            industry: user.industry,
            teamSize: user.team_size
          }
        });

      } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
      }
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

    // Chat endpoint for AI assistant
    app.post('/api/chat', async (req, res) => {
      try {
        const { email, message, conversationId } = req.body;

        if (!email || !message) {
          return res.status(400).json({ error: 'Email and message are required' });
        }

        // Get user's assessment data for context
        const userQuery = `SELECT * FROM users WHERE email = $1`;
        const userResult = await pool.query(userQuery, [email]);
        
        const assessmentQuery = `
          SELECT * FROM assessments 
          WHERE email = $1 
          ORDER BY created_at DESC 
          LIMIT 1
        `;
        const assessmentResult = await pool.query(assessmentQuery, [email]);

        if (userResult.rows.length === 0) {
          return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];
        const assessment = assessmentResult.rows.length > 0 ? assessmentResult.rows[0] : null;

        // Build context for AI
        let context = `User: ${user.full_name} (${user.email})`;
        if (user.job_title) context += `\nRole: ${user.job_title}`;
        if (user.company) context += ` at ${user.company}`;
        if (user.industry) context += `\nIndustry: ${user.industry}`;

        if (assessment) {
          context += `\nCommunication Signature: ${assessment.signature}`;
          context += `\nDominant Traits: ${JSON.stringify(JSON.parse(assessment.dominant_traits))}`;
          context += `\nScores: ${JSON.stringify(JSON.parse(assessment.scores))}`;
        }

        // Simple AI response (replace with actual AI integration)
        const aiResponse = generateAIResponse(message, context, assessment);

        res.json({
          success: true,
          response: aiResponse,
          context: assessment ? 'assessment_available' : 'no_assessment'
        });

      } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Chat processing failed' });
      }
    });

    function generateAIResponse(message, userContext, assessment) {
      const lowerMessage = message.toLowerCase();
      
      // Assessment-specific responses
      if (assessment) {
        const traits = JSON.parse(assessment.dominant_traits);
        const signature = assessment.signature;
        
        if (lowerMessage.includes('signature') || lowerMessage.includes('what am i')) {
          return `Based on your assessment, you are a ${signature}. This means you naturally ${getTraitDescription(traits.drive)} in your approach to work, ${getTraitDescription(traits.expression)} in how you communicate, ${getTraitDescription(traits.adaptive)} when facing change, and ${getTraitDescription(traits.intelligence)} in how you process information.`;
        }
        
        if (lowerMessage.includes('strength') || lowerMessage.includes('good at')) {
          return getStrengthsResponse(traits);
        }
        
        if (lowerMessage.includes('improve') || lowerMessage.includes('better')) {
          return getImprovementResponse(traits);
        }
        
        if (lowerMessage.includes('team') || lowerMessage.includes('colleague')) {
          return getTeamResponse(traits);
        }
        
        if (lowerMessage.includes('adapt') || lowerMessage.includes('different')) {
          return getAdaptationResponse(traits);
        }
      }
      
      // General responses
      if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
        return assessment 
          ? `Hi! I'm here to help you understand and apply your communication signature. Feel free to ask me about your results, how to work with different types of people, or how to leverage your strengths.`
          : `Hello! I can help you understand communication styles and frameworks. To give you personalized advice, you'll need to complete the assessment first.`;
      }
      
      if (lowerMessage.includes('help')) {
        return assessment
          ? `I can help you with:\n• Understanding your communication signature\n• Working with different personality types\n• Leveraging your strengths\n• Adapting your style for better results\n\nWhat would you like to explore?`
          : `I can help you understand communication styles and take the assessment. Complete your profile and assessment first for personalized insights.`;
      }
      
      return assessment
        ? `That's a great question about communication! Based on your ${assessment.signature} profile, I'd suggest considering your natural ${JSON.parse(assessment.dominant_traits).drive} drive and ${JSON.parse(assessment.dominant_traits).expression} communication style. Could you be more specific about what you'd like to know?`
        : `I'd love to help you with communication strategies! For personalized advice based on your unique style, please complete the assessment first.`;
    }

    function getTraitDescription(trait) {
      const descriptions = {
        action: "prefer taking immediate action and seeing quick results",
        research: "like to understand details thoroughly before proceeding", 
        collaborate: "focus on building consensus and team alignment",
        optimize: "emphasize efficiency and systematic approaches",
        expressive: "communicate openly and energetically",
        reflective: "think before speaking and prefer structured communication",
        interactive: "love conversational exchanges and building on ideas",
        purposeful: "communicate with clear intent and focus",
        flexible: "adapt quickly and embrace change as opportunity",
        analytical: "analyze implications before adapting",
        collaborative: "consider human impact when adapting",
        steady: "balance change with maintaining stability",
        intuitive: "trust instincts and see big-picture patterns",
        analytical: "rely on data and systematic reasoning",
        social: "value input from others and multiple perspectives", 
        experiential: "draw on past experiences and proven approaches"
      };
      return descriptions[trait] || "have a unique approach";
    }

    function getStrengthsResponse(traits) {
      const strengths = {
        action: "You excel at making quick decisions and driving results",
        research: "You bring thoroughness and deep analysis to projects", 
        collaborate: "You build strong team consensus and alignment",
        optimize: "You create efficient systems and processes",
        expressive: "You energize others with your open communication",
        reflective: "You provide thoughtful, well-considered input",
        interactive: "You facilitate great conversations and idea-building",
        purposeful: "You communicate with clarity and impact"
      };
      
      return `Your key strengths include: ${strengths[traits.drive] || 'Unique problem-solving approaches'}, ${strengths[traits.expression] || 'distinctive communication style'}, and your ability to ${traits.adaptive === 'flexible' ? 'adapt quickly to change' : traits.adaptive === 'steady' ? 'provide stability during change' : 'navigate change thoughtfully'}.`;
    }

    function getImprovementResponse(traits) {
      const improvements = {
        action: "Consider slowing down occasionally to gather more input from others",
        research: "Try setting time limits for analysis to avoid over-researching",
        collaborate: "Sometimes make decisions efficiently even without full consensus", 
        optimize: "Be open to creative solutions that might not follow standard processes",
        expressive: "Practice listening more and giving others space to contribute",
        reflective: "Share your thoughts more frequently, even if they're not fully formed",
        interactive: "Sometimes focus on delivering clear conclusions rather than just exploring ideas",
        purposeful: "Add more warmth and relationship-building to your communications"
      };
      
      return `To grow your communication effectiveness: ${improvements[traits.drive] || 'Continue developing your unique approach'} and ${improvements[traits.expression] || 'keep refining your communication style'}. Remember, these are suggestions to add to your strengths, not replace them.`;
    }

    function getTeamResponse(traits) {
      return `When working with teams, leverage your ${traits.drive} approach by ${traits.drive === 'action' ? 'helping the team move forward decisively' : traits.drive === 'research' ? 'ensuring decisions are well-informed' : traits.drive === 'collaborate' ? 'building strong team unity' : 'keeping the team organized and efficient'}. Your ${traits.expression} communication style helps by ${traits.expression === 'expressive' ? 'bringing energy and openness' : traits.expression === 'reflective' ? 'providing thoughtful perspectives' : traits.expression === 'interactive' ? 'facilitating great discussions' : 'keeping communications clear and focused'}.`;
    }

    function getAdaptationResponse(traits) {
      return `To adapt your style with different people: With action-oriented colleagues, be direct and focus on results. With research-oriented people, provide data and allow time for analysis. With collaborative types, involve them in decisions. With process-oriented individuals, follow structure and be systematic. Your natural ${traits.adaptive} approach to change will help you ${traits.adaptive === 'flexible' ? 'adjust quickly' : traits.adaptive === 'steady' ? 'maintain stability while adapting' : 'make thoughtful adjustments'}.`;
    }

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