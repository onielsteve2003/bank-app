const Wallet = require('../models/Wallet');
const Kyc = require('../models/Kyc');
const QRTransaction = require('../models/QRTransaction');
const User = require('../models/User');
const Merchant = require('../models/Merchant');
const { generateQRCode } = require('../utils/qrUtils');

// Generate QR code for receiving payment
exports.generateQR = async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user._id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    // Check KYC status
    const kyc = await Kyc.findOne({ user: userId });
    if (!kyc || kyc.status !== 'Verified') {
      return res.status(403).json({ message: 'KYC verification required' });
    }

    // Generate QR code data
    const qrData = JSON.stringify({ userId: userId.toString(), amount });
    const qrCode = await generateQRCode(qrData);

    // Create QR transaction record
    const qrTransaction = new QRTransaction({
      user: userId,
      type: 'generate',
      qrCode,
      amount,
      status: 'pending'
    });

    await qrTransaction.save();

    res.status(200).json({
      message: 'QR code generated successfully',
      data: { qrCode, transactionId: qrTransaction._id }
    });
  } catch (error) {
    console.error('Generate QR error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Scan QR code to make payment
exports.scanQR = async (req, res) => {
  try {
    const { qrCode } = req.body;
    const userId = req.user._id;

    if (!qrCode) {
      return res.status(400).json({ message: 'QR code is required' });
    }

    // Check KYC status
    const kyc = await Kyc.findOne({ user: userId });
    if (!kyc || kyc.status !== 'Verified') {
      return res.status(403).json({ message: 'KYC verification required' });
    }

    // Decode QR code (mock implementation - in reality, parse the QR code data)
    let qrData;
    try {
      qrData = JSON.parse(decodeURIComponent(qrCode.split('/').pop()));
    } catch (error) {
      return res.status(400).json({ message: 'Invalid QR code' });
    }

    const { userId: recipientId, businessId, amount } = qrData;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid QR code data: amount missing or invalid' });
    }

    // Check wallet balance
    const senderWallet = await Wallet.findOne({ user: userId });
    if (!senderWallet || senderWallet.balance < amount) {
      return res.status(400).json({ message: 'Insufficient funds or wallet not found' });
    }

    let recipientWallet;
    let recipientName;

    if (recipientId) {
      // User-to-user payment
      if (recipientId === userId.toString()) {
        return res.status(400).json({ message: 'Cannot pay yourself' });
      }

      const recipient = await User.findById(recipientId);
      if (!recipient) {
        return res.status(404).json({ message: 'Recipient not found' });
      }

      recipientWallet = await Wallet.findOne({ user: recipientId });
      if (!recipientWallet) {
        return res.status(404).json({ message: 'Recipient wallet not found' });
      }

      recipientName = recipient.email;

      // Create QR transaction record for sender
      const senderTransaction = new QRTransaction({
        user: userId,
        type: 'scan',
        amount,
        recipient: recipientId,
        status: 'completed',
        completedAt: Date.now()
      });

      // Update sender wallet
      senderWallet.balance -= amount;
      senderWallet.transactions.push({
        type: 'withdrawal',
        amount,
        reference: senderTransaction.reference,
        status: 'completed'
      });

      // Update recipient wallet
      recipientWallet.balance += amount;
      recipientWallet.transactions.push({
        type: 'deposit',
        amount,
        reference: senderTransaction.reference,
        status: 'completed'
      });

      // Update the original generated QR transaction (if it exists)
      const originalTransaction = await QRTransaction.findOne({ qrCode, user: recipientId, type: 'generate' });
      if (originalTransaction) {
        originalTransaction.status = 'completed';
        originalTransaction.completedAt = Date.now();
        await originalTransaction.save();
      }

      await Promise.all([senderTransaction.save(), senderWallet.save(), recipientWallet.save()]);

      res.status(200).json({
        message: 'Payment successful via QR code',
        data: { transactionId: senderTransaction._id, amount, recipient: recipientName }
      });
    } else if (businessId) {
      // Merchant payment
      const merchant = await Merchant.findOne({ businessId });
      if (!merchant) {
        return res.status(404).json({ message: 'Merchant not found' });
      }

      recipientName = merchant.name;

      // Create QR transaction record for sender (merchant payment)
      const senderTransaction = new QRTransaction({
        user: userId,
        type: 'scan',
        amount,
        status: 'completed',
        completedAt: Date.now()
      });

      // Update sender wallet
      senderWallet.balance -= amount;
      senderWallet.transactions.push({
        type: 'withdrawal',
        amount,
        reference: senderTransaction.reference,
        status: 'completed'
      });

      await Promise.all([senderTransaction.save(), senderWallet.save()]);

      res.status(200).json({
        message: 'Merchant payment successful via QR code',
        data: { transactionId: senderTransaction._id, amount, merchant: recipientName }
      });
    } else {
      return res.status(400).json({ message: 'Invalid QR code data: missing userId or businessId' });
    }
  } catch (error) {
    console.error('Scan QR error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get QR transaction history
exports.getQRHistory = async (req, res) => {
  try {
    const userId = req.user._id;

    const transactions = await QRTransaction.find({ user: userId })
      .populate('recipient', 'email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      message: 'QR transaction history retrieved successfully',
      data: transactions
    });
  } catch (error) {
    console.error('Get QR history error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};