const axios = require('axios');

const YOCO_BASE_URL = 'https://online.yoco.com/api/v1';
const YOCO_SECRET_KEY = process.env.YOCO_SECRET_KEY || 'sk_test_362e7fbak3QKAOp660e498f98da3';

const yocoAPI = axios.create({
  baseURL: YOCO_BASE_URL,
  headers: {
    'Authorization': `Bearer ${YOCO_SECRET_KEY}`,
    'Content-Type': 'application/json'
  }
});

// Create payment charge
const createCharge = async (paymentData) => {
  try {
    const response = await yocoAPI.post('/charges', {
      token: paymentData.token,
      amountInCents: Math.round(paymentData.amount * 100),
      currency: 'ZAR',
      metadata: {
        userId: paymentData.userId,
        serviceType: paymentData.serviceType,
        userEmail: paymentData.userEmail
      }
    });
    
    return {
      success: true,
      chargeId: response.data.id,
      status: response.data.status,
      data: response.data
    };
  } catch (error) {
    console.error('Yoco charge error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || 'Payment failed'
    };
  }
};

// Get charge details
const getCharge = async (chargeId) => {
  try {
    const response = await yocoAPI.get(`/charges/${chargeId}`);
    return response.data;
  } catch (error) {
    console.error('Get charge error:', error.response?.data || error.message);
    throw error;
  }
};

module.exports = {
  createCharge,
  getCharge
};