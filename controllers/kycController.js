const Kyc = require('../models/Kyc');

// Submit KYC - POST /api/kyc/verify
exports.submitKYC = async (req, res) => {
    try {
        const { fullName, idType, idNumber } = req.body;

        if (!fullName || !idType || !idNumber || !req.file) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const existingKYC = await Kyc.findOne({ user: req.user._id });

        // Prevent resubmission if KYC is "Verified"
        if (existingKYC && existingKYC.status === 'Verified') {
            return res.status(400).json({
                message: 'Your KYC has been verified. You cannot resubmit.'
            });
        }

        // If previous KYC was rejected, delete it before allowing a new submission
        if (existingKYC && existingKYC.status === 'Rejected') {
            await Kyc.deleteOne({ _id: existingKYC._id });
        }

        // Prevent resubmission if KYC is still pending
        if (existingKYC && existingKYC.status === 'Pending') {
            return res.status(400).json({
                message: 'Your KYC is under review. Please wait for approval or rejection before resubmitting.'
            });
        }

        // Check if ID number already exists
        const existingId = await Kyc.findOne({ idNumber });
        if (existingId) {
            return res.status(400).json({
                message: 'This ID number is already in use. Please use a different ID.'
            });
        }

        // Create and save new KYC
        const newKyc = new Kyc({
            fullName,
            idType,
            idNumber,
            documentImage: req.file.path,
            user: req.user._id,
            status: 'Pending'
        });

        await newKyc.save();

        return res.status(201).json({
            message: 'KYC submitted successfully',
            data: newKyc
        });

    } catch (error) {
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Approve KYC - POST /api/kyc/approve/:userId
exports.approveKYC = async (req, res) => {
    try {
        const { userId } = req.params;
        const kyc = await Kyc.findOne({ user: userId });

        if (!kyc) {
            return res.status(404).json({ message: 'No KYC found' });
        }

        kyc.status = 'Verified';
        await kyc.save();

        return res.status(200).json({
            message: 'KYC approved successfully',
            data: { kycStatus: kyc.status }
        });

    } catch (error) {
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Reject KYC - POST /api/kyc/reject/:userId
exports.rejectKYC = async (req, res) => {
    try {
        const { userId } = req.params;
        const kyc = await Kyc.findOne({ user: userId });

        if (!kyc) {
            return res.status(404).json({ message: 'No KYC found' });
        }

        await Kyc.deleteOne({ _id: kyc._id });

        return res.status(200).json({
            message: 'KYC rejected and deleted successfully',
        });

    } catch (error) {
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get KYC Status - GET /api/kyc/status
exports.getKYCStatus = async (req, res) => {
    try {
        const kyc = await Kyc.findOne({ user: req.user._id });

        if (!kyc) {
            return res.status(404).json({ message: 'No KYC found' });
        }

        return res.status(200).json({
            message: 'KYC status retrieved successfully',
            data: { kycStatus: kyc.status }
        });

    } catch (error) {
        console.error("Error in getKYCStatus:", error);
        const errorMessage = error.message || 'Server error';
        return res.status(500).json({ message: 'Server error', error: errorMessage });
    }
};
