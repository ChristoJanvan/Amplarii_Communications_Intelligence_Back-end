const express = require('express');
const { body, validationResult } = require('express-validator');
const { Assessment, User } = require('../src/models');

const router = express.Router();

// Submit assessment results
router.post('/results', [
  body('email').isEmail().normalizeEmail(),
  body('responses').isObject(),
  body('scores').isObject(),
  body('dominantTraits').isObject(),
  body('signature').trim().isLength({ min: 10, max: 200 }),
  body('signatureKey').trim().isLength({ min: 5, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { email, responses, scores, dominantTraits, signature, signatureKey } = req.body;

    // Find user by email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create assessment record
    const assessment = await Assessment.create({
      userId: user.id,
      responses,
      scores,
      dominantTraits,
      signature,
      signatureKey
    });

    res.status(201).json({
      success: true,
      message: 'Assessment results saved',
      assessmentId: assessment.id,
      signature: assessment.signature
    });

  } catch (error) {
    console.error('Assessment submission error:', error);
    res.status(500).json({ 
      error: 'Failed to save assessment',
      message: error.message 
    });
  }
});

// Get user's assessments
router.get('/user/:email', async (req, res) => {
  try {
    const user = await User.findOne({ 
      where: { email: req.params.email },
      include: [{
        model: Assessment,
        as: 'assessments',
        order: [['completedAt', 'DESC']]
      }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        fullName: user.fullName,
        email: user.email
      },
      assessments: user.assessments.map(assessment => ({
        id: assessment.id,
        signature: assessment.signature,
        signatureKey: assessment.signatureKey,
        dominantTraits: assessment.dominantTraits,
        completedAt: assessment.completedAt
      }))
    });

  } catch (error) {
    console.error('Get assessments error:', error);
    res.status(500).json({ error: 'Failed to retrieve assessments' });
  }
});

// Get assessment analytics
router.get('/analytics', async (req, res) => {
  try {
    const totalAssessments = await Assessment.count();
    
    // Get signature distribution
    const signatureStats = await Assessment.findAll({
      attributes: [
        'signatureKey',
        [Assessment.sequelize.fn('COUNT', Assessment.sequelize.col('signatureKey')), 'count']
      ],
      group: ['signatureKey'],
      order: [[Assessment.sequelize.fn('COUNT', Assessment.sequelize.col('signatureKey')), 'DESC']]
    });

    res.json({
      totalAssessments,
      signatureDistribution: signatureStats.map(stat => ({
        signatureKey: stat.signatureKey,
        count: parseInt(stat.dataValues.count)
      }))
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to retrieve analytics' });
  }
});

module.exports = router;