const Wallet = require('../models/Wallet');
const Transfer = require('../models/Transfer');
const Kyc = require('../models/Kyc');
const User = require('../models/User');

// Send Money
exports.sendMoney = async (req, res) => {
  try {
    const { recipientEmail, amount } = req.body;
    const senderId = req.user._id;

    if (!recipientEmail || !amount || amount <= 0) {
      return res.status(400).json({ message: 'Recipient email and valid amount are required' });
    }

    // Check sender's KYC
    const senderKyc = await Kyc.findOne({ user: senderId });
    if (!senderKyc || senderKyc.status !== 'Verified') {
      return res.status(403).json({ message: 'Sender KYC verification required' });
    }

    // Find sender and recipient wallets
    const senderWallet = await Wallet.findOne({ user: senderId });
    const sender = await User.findById(senderId);
    const recipient = await User.findOne({ email: recipientEmail });
    
    if (!sender) {
      return res.status(404).json({ message: 'Sender not found' });
    }
    if (!recipient) {
      return res.status(404).json({ message: 'Recipient not found' });
    }
    if (sender.email === recipientEmail) {
      return res.status(400).json({ message: 'Cannot send money to yourself' });
    }

    const recipientWallet = await Wallet.findOne({ user: recipient._id });

    if (!senderWallet || !recipientWallet) {
      return res.status(404).json({ message: 'Sender or recipient wallet not found' });
    }

    if (senderWallet.balance < amount) {
      return res.status(400).json({ message: 'Insufficient funds' });
    }

    // Create transfer record
    const transfer = new Transfer({
      sender: senderId,
      recipient: recipient._id,
      amount,
      type: 'send',
      status: 'completed'
    });

    // Generate unique references for each transaction
    const senderReference = `${transfer.reference}_sender`;
    const recipientReference = `${transfer.reference}_recipient`;

    // Update wallets
    senderWallet.balance -= amount;
    senderWallet.transactions.push({
      type: 'withdrawal',
      amount,
      reference: senderReference, // Unique reference
      status: 'completed'
    });

    recipientWallet.balance += amount;
    recipientWallet.transactions.push({
      type: 'deposit',
      amount,
      reference: recipientReference, // Unique reference
      status: 'completed'
    });

    // Save all changes
    await Promise.all([senderWallet.save(), recipientWallet.save(), transfer.save()]);

    res.status(200).json({
      message: 'Money sent successfully',
      data: transfer
    });
  } catch (error) {
    console.error('Send money error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Request Money
exports.requestMoney = async (req, res) => {
  try {
    const { senderEmail, amount } = req.body;
    const recipientId = req.user._id;

    if (!senderEmail || !amount || amount <= 0) {
      return res.status(400).json({ message: 'Sender email and valid amount are required' });
    }

    // Check recipient's KYC
    const recipientKyc = await Kyc.findOne({ user: recipientId });
    if (!recipientKyc || recipientKyc.status !== 'Verified') {
      return res.status(403).json({ message: 'Recipient KYC verification required' });
    }

    // Find sender
    const sender = await User.findOne({ email: senderEmail });
    if (!sender) {
      return res.status(404).json({ message: 'Sender not found' });
    }

    // Create transfer request
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
    if (!transfer) {
      return res.status(404).json({ message: 'Transfer not found' });
    }

    // Allow either the recipient (who made the request) or the sender to cancel a pending request
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

// Accept Money Request (Bonus: To complete a request)
exports.acceptRequest = async (req, res) => {
  try {
    const { transferId } = req.body;
    const senderId = req.user._id;

    if (!transferId) {
      return res.status(400).json({ message: 'Transfer ID is required' });
    }

    const transfer = await Transfer.findById(transferId);
    if (!transfer) {
      return res.status(404).json({ message: 'Transfer not found' });
    }

    // Only the sender can accept a pending request
    if (transfer.sender.toString() !== senderId.toString() || transfer.type !== 'request' || transfer.status !== 'pending') {
      return res.status(403).json({ message: 'Unauthorized or invalid acceptance request' });
    }

    const senderWallet = await Wallet.findOne({ user: senderId });
    const recipientWallet = await Wallet.findOne({ user: transfer.recipient });
    if (!senderWallet || !recipientWallet) {
      return res.status(404).json({ message: 'Sender or recipient wallet not found' });
    }

    if (senderWallet.balance < transfer.amount) {
      return res.status(400).json({ message: 'Insufficient funds' });
    }

    transfer.status = 'completed';
    transfer.completedAt = Date.now();

    senderWallet.balance -= transfer.amount;
    senderWallet.transactions.push({
      type: 'withdrawal',
      amount: transfer.amount,
      reference: transfer.reference,
      status: 'completed'
    });

    recipientWallet.balance += transfer.amount;
    recipientWallet.transactions.push({
      type: 'deposit',
      amount: transfer.amount,
      reference: transfer.reference,
      status: 'completed'
    });

    await Promise.all([senderWallet.save(), recipientWallet.save(), transfer.save()]);

    res.status(200).json({
      message: 'Money request accepted and transfer completed',
      data: transfer
    });
  } catch (error) {
    console.error('Accept request error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  sendMoney: exports.sendMoney,
  requestMoney: exports.requestMoney,
  getTransferTransactions: exports.getTransferTransactions,
  cancelRequest: exports.cancelRequest,
  acceptRequest: exports.acceptRequest
};