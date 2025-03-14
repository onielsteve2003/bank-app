const Wallet = require('../models/Wallet');
const Kyc = require('../models/Kyc');
const Merchant = require('../models/Merchant');
const { generateQRCode } = require('../utils/qrUtils');

// Add a new merchant
exports.addMerchant = async (req, res) => {
  try {
    const { name, email, businessId } = req.body;

    // Validate required fields
    if (!name || !email || !businessId) {
      return res.status(400).json({ message: 'Name, email, and business ID are required' });
    }

    // Check if a merchant with the same email or businessId already exists
    const existingMerchantByEmail = await Merchant.findOne({ email });
    const existingMerchantByBusinessId = await Merchant.findOne({ businessId });

    if (existingMerchantByEmail) {
      return res.status(400).json({ message: 'A merchant with this email already exists' });
    }
    if (existingMerchantByBusinessId) {
      return res.status(400).json({ message: 'A merchant with this business ID already exists' });
    }

    // Generate an initial QR code (optional - can be generated later via getMerchantQRCode)
    const qrData = JSON.stringify({ businessId, name });
    const qrCode = await generateQRCode(qrData);

    // Create new merchant
    const merchant = new Merchant({
      name,
      email,
      businessId,
      qrCode
    });

    await merchant.save();

    res.status(201).json({
      message: 'Merchant added successfully',
      data: merchant
    });
  } catch (error) {
    console.error('Add merchant error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get merchant QR code
exports.getMerchantQRCode = async (req, res) => {
  try {
    const { businessId } = req.query;

    if (!businessId) {
      return res.status(400).json({ message: 'Business ID is required' });
    }

    const merchant = await Merchant.findOne({ businessId });
    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found' });
    }

    if (!merchant.qrCode) {
      // Generate QR code if it doesn't exist
      const qrData = JSON.stringify({ businessId: merchant.businessId, name: merchant.name });
      merchant.qrCode = await generateQRCode(qrData);
      await merchant.save();
    }

    res.status(200).json({
      message: 'Merchant QR code retrieved successfully',
      data: { qrCode: merchant.qrCode }
    });
  } catch (error) {
    console.error('Get merchant QR code error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Pay a merchant (unchanged)
exports.payMerchant = async (req, res) => {
  try {
    const { businessId, amount } = req.body;
    const userId = req.user._id;

    if (!businessId || !amount || amount <= 0) {
      return res.status(400).json({ message: 'Business ID and valid amount are required' });
    }

    // Check KYC status
    const kyc = await Kyc.findOne({ user: userId });
    if (!kyc || kyc.status !== 'Verified') {
      return res.status(403).json({ message: 'KYC verification required' });
    }

    // Check wallet balance
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet || wallet.balance < amount) {
      return res.status(400).json({ message: 'Insufficient funds or wallet not found' });
    }

    // Check merchant
    const merchant = await Merchant.findOne({ businessId });
    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found' });
    }

    // Deduct from wallet
    wallet.balance -= amount;
    wallet.transactions.push({
      type: 'withdrawal',
      amount,
      reference: `MERCH_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      status: 'completed'
    });

    await wallet.save();

    res.status(200).json({
      message: 'Merchant payment successful',
      data: { amount, merchant: merchant.name }
    });
  } catch (error) {
    console.error('Pay merchant error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};