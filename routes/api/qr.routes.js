const express = require('express');
const router = express.Router();
const {
  generateQR,
  scanQR,
  getQRHistory
} = require('../../controllers/qrController');
const { protect } = require('../../middlewares/authMiddleware');

router.post('/generate', protect, generateQR);
router.post('/scan', protect, scanQR);
router.get('/history', protect, getQRHistory);

module.exports = router;