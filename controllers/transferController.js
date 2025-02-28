const Wallet = require('../models/Wallet');
const Transfer = require('../models/Transfer');
const Kyc = require('../models/Kyc');
const User = require('../models/User');

// Fee configuration (global defaults, could be moved to config/env later)
const TRANSACTION_FEES = {
  flat: 10, // Flat fee in NGN
  percentage: 0.01 // 1% of transfer amount
};

// Global limit bounds
const GLOBAL_LIMITS = {
  min: 50, // Absolute minimum
  max: 100000 // Absolute maximum
};

// Calculate total fee
const calculateFee = (amount) => {
  const flatFee = TRANSACTION_FEES.flat;
  const percentageFee = amount * TRANSACTION_FEES.percentage;
  return flatFee + percentageFee;
};

// Send Money
exports.sendMoney = async (req, res) => {
  try {
    const { recipientEmail, amount } = req.body;
    const senderId = req.user._id;

    if (!recipientEmail || !amount || amount <= 0) {
      return res.status(400).json({ message: 'Recipient email and valid amount are required' });
    }

    const senderKyc = await Kyc.findOne({ user: senderId });
    if (!senderKyc || senderKyc.status !== 'Verified') {
      return res.status(403).json({ message: 'Sender KYC verification required' });
    }

    const sender = await User.findById(senderId);
    const recipient = await User.findOne({ email: recipientEmail });
    if (!sender) return res.status(404).json({ message: 'Sender not found' });
    if (!recipient) return res.status(404).json({ message: 'Recipient not found' });
    if (sender.email === recipientEmail) {
      return res.status(400).json({ message: 'Cannot send money to yourself' });
    }

    const senderWallet = await Wallet.findOne({ user: senderId });
    const recipientWallet = await Wallet.findOne({ user: recipient._id });
    if (!senderWallet || !recipientWallet) {
      return res.status(404).json({ message: 'Sender or recipient wallet not found' });
    }

    // Enforce limits
    const { min, max } = sender.transferLimits;
    if (amount < min || amount > max) {
      return res.status(400).json({ message: `Amount must be between ${min} and ${max} NGN` });
    }

    const fee = calculateFee(amount);
    const totalDeduction = amount + fee;
    if (senderWallet.balance < totalDeduction) {
      return res.status(400).json({ message: 'Insufficient funds including fee' });
    }

    const transfer = new Transfer({
      sender: senderId,
      recipient: recipient._id,
      amount,
      type: 'send',
      status: 'completed'
    });

    const senderReference = `${transfer.reference}_sender`;
    const recipientReference = `${transfer.reference}_recipient`;

    senderWallet.balance -= totalDeduction;
    senderWallet.transactions.push({
      type: 'withdrawal',
      amount: totalDeduction,
      reference: senderReference,
      status: 'completed',
      fee
    });

    recipientWallet.balance += amount;
    recipientWallet.transactions.push({
      type: 'deposit',
      amount,
      reference: recipientReference,
      status: 'completed'
    });

    await Promise.all([senderWallet.save(), recipientWallet.save(), transfer.save()]);
    res.status(200).json({
      message: 'Money sent successfully',
      data: { transfer, fee }
    });
  } catch (error) {
    console.error('Send money error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Request Money (No fees/limits here, just requesting)
exports.requestMoney = async (req, res) => {
  try {
    const { senderEmail, amount } = req.body;
    const recipientId = req.user._id;

    if (!senderEmail || !amount || amount <= 0) {
      return res.status(400).json({ message: 'Sender email and valid amount are required' });
    }

    const recipientKyc = await Kyc.findOne({ user: recipientId });
    if (!recipientKyc || recipientKyc.status !== 'Verified') {
      return res.status(403).json({ message: 'Recipient KYC verification required' });
    }

    const sender = await User.findOne({ email: senderEmail });
    if (!sender) return res.status(404).json({ message: 'Sender not found' });

    const transfer = new Transfer({
      sender: sender._id,
      recipient: recipientId,
      amount,
      type: 'request',
      status: 'pending'
    });

    await transfer.save();
    res.status(200).json({
      message: 'Money request sent successfully',
      data: transfer
    });
  } catch (error) {
    console.error('Request money error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get P2P Transaction History
exports.getTransferTransactions = async (req, res) => {
  try {
    const userId = req.user._id;
    const transfers = await Transfer.find({
      $or: [{ sender: userId }, { recipient: userId }]
    }).populate('sender', 'email').populate('recipient', 'email');
    res.status(200).json({
      message: 'Transfer transactions retrieved successfully',
      data: transfers
    });
  } catch (error) {
    console.error('Get transfers error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Cancel Money Request
exports.cancelRequest = async (req, res) => {
  try {
    const { transferId } = req.body;
    const userId = req.user._id;

    if (!transferId) {
      return res.status(400).json({ message: 'Transfer ID is required' });
    }

    const transfer = await Transfer.findById(transferId);
    if (!transfer) return res.status(404).json({ message: 'Transfer not found' });

    if (
      (transfer.recipient.toString() !== userId.toString() && transfer.sender?.toString() !== userId.toString()) ||
      transfer.type !== 'request' ||
      transfer.status !== 'pending'
    ) {
      return res.status(403).json({ message: 'Unauthorized or invalid cancellation request' });
    }

    transfer.status = 'cancelled';
    await transfer.save();
    res.status(200).json({
      message: 'Money request cancelled successfully',
      data: transfer
    });
  } catch (error) {
    console.error('Cancel request error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Accept Money Request
exports.acceptRequest = async (req, res) => {
  try {
    const { transferId } = req.body;
    const senderId = req.user._id;

    if (!transferId) {
      return res.status(400).json({ message: 'Transfer ID is required' });
    }

    const transfer = await Transfer.findById(transferId);
    if (!transfer) return res.status(404).json({ message: 'Transfer not found' });

    if (transfer.sender.toString() !== senderId.toString() || transfer.type !== 'request' || transfer.status !== 'pending') {
      return res.status(403).json({ message: 'Unauthorized or invalid acceptance request' });
    }

    const senderWallet = await Wallet.findOne({ user: senderId });
    const recipientWallet = await Wallet.findOne({ user: transfer.recipient });
    if (!senderWallet || !recipientWallet) {
      return res.status(404).json({ message: 'Sender or recipient wallet not found' });
    }

    const sender = await User.findById(senderId);
    const { min, max } = sender.transferLimits;
    const amount = transfer.amount;
    if (amount < min || amount > max) {
      return res.status(400).json({ message: `Amount must be between ${min} and ${max} NGN` });
    }

    const fee = calculateFee(amount);
    const totalDeduction = amount + fee;
    if (senderWallet.balance < totalDeduction) {
      return res.status(400).json({ message: 'Insufficient funds including fee' });
    }

    transfer.status = 'completed';
    transfer.completedAt = Date.now();

    senderWallet.balance -= totalDeduction;
    senderWallet.transactions.push({
      type: 'withdrawal',
      amount: totalDeduction,
      reference: transfer.reference,
      status: 'completed',
      fee
    });

    recipientWallet.balance += amount;
    recipientWallet.transactions.push({
      type: 'deposit',
      amount,
      reference: transfer.reference,
      status: 'completed'
    });

    await Promise.all([senderWallet.save(), recipientWallet.save(), transfer.save()]);
    res.status(200).json({
      message: 'Money request accepted and transfer completed',
      data: { transfer, fee }
    });
  } catch (error) {
    console.error('Accept request error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// New Endpoints
exports.getFees = async (req, res) => {
  try {
    res.status(200).json({
      message: 'Fee structure retrieved successfully',
      data: TRANSACTION_FEES
    });
  } catch (error) {
    console.error('Get fees error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getLimits = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.status(200).json({
      message: 'Transfer limits retrieved successfully',
      data: {
        userLimits: user.transferLimits,
        globalLimits: GLOBAL_LIMITS
      }
    });
  } catch (error) {
    console.error('Get limits error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.setLimit = async (req, res) => {
  try {
    const { min, max } = req.body;
    const userId = req.user._id;

    if (!min || !max || min <= 0 || max <= 0) {
      return res.status(400).json({ message: 'Valid min and max limits are required' });
    }

    if (min < GLOBAL_LIMITS.min || max > GLOBAL_LIMITS.max) {
      return res.status(400).json({ message: `Limits must be between ${GLOBAL_LIMITS.min} and ${GLOBAL_LIMITS.max} NGN` });
    }

    if (min >= max) {
      return res.status(400).json({ message: 'Minimum limit must be less than maximum limit' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.transferLimits = { min, max };
    await user.save();

    res.status(200).json({
      message: 'Transfer limits updated successfully',
      data: user.transferLimits
    });
  } catch (error) {
    console.error('Set limit error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  sendMoney: exports.sendMoney,
  requestMoney: exports.requestMoney,
  getTransferTransactions: exports.getTransferTransactions,
  cancelRequest: exports.cancelRequest,
  acceptRequest: exports.acceptRequest,
  getFees: exports.getFees,
  getLimits: exports.getLimits,
  setLimit: exports.setLimit
};