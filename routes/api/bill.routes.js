const express = require('express');
const router = express.Router();
const {
  payBill,
  getBillCategories
} = require('../../controllers/billController');
const { protect } = require('../../middlewares/authMiddleware');

router.post('/pay', protect, payBill);
router.get('/categories', protect, getBillCategories);

module.exports = router;