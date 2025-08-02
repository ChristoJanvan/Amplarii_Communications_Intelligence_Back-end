const express = require('express');
const { body, validationResult } = require('express-validator');
const { User } = require('../models');

const router = express.Router();

// Create or update user profile
router.post('/profile', [
  body('fullName').trim().isLength({ min: 2, max: 100 }).escape(),
  body('email').isEmail().normalizeEmail(),
  body('jobTitle').optional().trim().isLength({ max: 100 }).escape(),
  body('company').optional().trim().isLength({ max: 100 }).escape(),
  body('industry').optional().trim().isLength({ max: 50 }).escape(),
  body('teamSize').optional().trim().isLength({ max: 20 }).escape(),
  body('emailUpdates').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { fullName, email, jobTitle, company, industry, teamSize, emailUpdates } = req.body;

    // Check if user exists
    let user = await User.findOne({ where: { email } });

    if (user) {
      // Update existing user
      user = await user.update({
        fullName,
        jobTitle,
        company,
        industry,
        teamSize,
        emailUpdates
      });
    } else {
      // Create new user
      user = await User.create({
        fullName,
        email,
        jobTitle,
        company,
        industry,
        teamSize,
        emailUpdates
      });
    }

    res.status(200).json({
      success: true,
      message: user.isNewRecord ? 'Profile created' : 'Profile updated',
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        jobTitle: user.jobTitle,
        company: user.company,
        industry: user.industry,
        teamSize: user.teamSize,
        emailUpdates: user.emailUpdates
      }
    });

  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ 
      error: 'Failed to save profile',
      message: error.message 
    });
  }
});

// Get user profile
router.get('/profile/:email', async (req, res) => {
  try {
    const user = await User.findOne({ 
      where: { email: req.params.email }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      jobTitle: user.jobTitle,
      company: user.company,
      industry: user.industry,
      teamSize: user.teamSize,
      emailUpdates: user.emailUpdates,
      createdAt: user.createdAt
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

module.exports = router;