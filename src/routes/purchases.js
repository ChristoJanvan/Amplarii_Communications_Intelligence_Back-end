const express = require('express');
const { body, validationResult } = require('express-validator');
const { Purchase, User } = require('../models');
const { createCharge } = require('../utils/yoco');

const router = express.Router();

// Process payment with Yoco
router.post('/payment', [
  body('email').isEmail().normalizeEmail(),
  body('serviceType').isIn(['team-assessment', 'coaching-session', 'enterprise-report']),
  body('amount').isFloat({ min: 0 }),
  body('token').isString().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { email, serviceType, amount, token } = req.body;

    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create purchase record
    const purchase = await Purchase.create({
      userId: user.id,
      serviceType,
      amount,
      status: 'pending',
      paymentMethod: 'yoco'
    });

    // Process payment with Yoco
    const paymentResult = await createCharge({
      token,
      amount,
      userId: user.id,
      serviceType,
      userEmail: email
    });

    if (paymentResult.success) {
      // Update purchase with transaction details
      await purchase.update({
        status: 'completed',
        transactionId: paymentResult.chargeId,
        metadata: paymentResult.data
      });

      res.json({
        success: true,
        purchaseId: purchase.id,
        transactionId: paymentResult.chargeId,
        status: 'completed'
      });
    } else {
      // Update purchase status to failed
      await purchase.update({ status: 'failed' });
      
      res.status(400).json({
        success: false,
        error: paymentResult.error,
        purchaseId: purchase.id
      });
    }

  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({ error: 'Payment processing failed' });
  }
});

// Get user purchases
router.get('/user/:email', async (req, res) => {
  try {
    const user = await User.findOne({ 
      where: { email: req.params.email },
      include: [{
        model: Purchase,
        as: 'purchases',
        order: [['createdAt', 'DESC']]
      }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      purchases: user.purchases.map(purchase => ({
        id: purchase.id,
        serviceType: purchase.serviceType,
        amount: purchase.amount,
        status: purchase.status,
        createdAt: purchase.createdAt
      }))
    });

  } catch (error) {
    console.error('Get purchases error:', error);
    res.status(500).json({ error: 'Failed to retrieve purchases' });
  }
});

module.exports = router;