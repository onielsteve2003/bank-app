const express = require('express')
const router = express.Router()
const {
    approveKYC,
    getKYCStatus,
    submitKYC,
    rejectKYC
} = require('../../controllers/kycController')
const {
    protect
 } = require('../../middlewares/authMiddleware')
const {
    upload
} = require('../../utils/multer')

router.post('/verify', protect, upload.single('documentImage'), submitKYC);
router.get('/status', protect, getKYCStatus);
router.post('/approve/:userId', protect, approveKYC);
router.post('/reject/:userId', protect, rejectKYC);

module.exports = router;