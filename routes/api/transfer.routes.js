const express = require('express');
const router = express.Router();
const {
  sendMoney,
  requestMoney,
  getTransferTransactions,
  cancelRequest,
  acceptRequest
} = require('../../controllers/transferController');
const { protect } = require('../../middlewares/authMiddleware');

router.post('/send', protect, sendMoney);
router.post('/request', protect, requestMoney);
router.get('/transactions', protect, getTransferTransactions);
router.post('/cancel', protect, cancelRequest);
router.post('/accept', protect, acceptRequest); // Bonus endpoint

module.exports = router;