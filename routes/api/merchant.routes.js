const express = require('express');
const router = express.Router();
const {
  addMerchant,
  getMerchantQRCode,
  payMerchant
} = require('../../controllers/merchantController');
const { protect } = require('../../middlewares/authMiddleware');

router.post('/add', protect, addMerchant);
router.get('/qr-code', protect, getMerchantQRCode);
router.post('/pay', protect, payMerchant);

module.exports = router;