const express = require('express');
const router = express.Router();
const {
  sendMoney,
  requestMoney,
  getTransferTransactions,
  cancelRequest,
  acceptRequest,
  getFees,
  getLimits,
  setLimit
} = require('../../controllers/transferController');
const { protect } = require('../../middlewares/authMiddleware');

router.post('/send', protect, sendMoney);
router.post('/request', protect, requestMoney);
router.get('/transactions', protect, getTransferTransactions);
router.post('/cancel', protect, cancelRequest);
router.post('/accept', protect, acceptRequest); 
router.get('/fees', protect, getFees);
router.get('/limits', protect, getLimits);
router.post('/set-limit', protect, setLimit);

module.exports = router;