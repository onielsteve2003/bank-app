const express = require('express');
const router = express.Router();
const { 
  initializePayment, 
  chargePayment, 
  getTransactionStatus, 
  handleWebhook 
} = require('../../controllers/paymentController');
const { protect } = require('../../middlewares/authMiddleware');

router.post('/gateway', protect, initializePayment);
router.post('/charge', protect, chargePayment);
router.get('/transaction-status', protect, getTransactionStatus);
router.post('/webhook', handleWebhook);

module.exports = router;