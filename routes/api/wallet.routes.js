const express = require('express');
const router = express.Router();
const { 
  getWalletBalance, 
  deposit, 
  withdraw, 
  getTransactions 
} = require('../../controllers/walletController');
const { protect } = require('../../middlewares/authMiddleware');

router.get('/', protect, getWalletBalance);
router.post('/deposit', protect, deposit);
router.post('/withdraw', protect, withdraw);
router.get('/transactions', protect, getTransactions);

module.exports = router;