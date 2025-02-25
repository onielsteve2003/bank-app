const Wallet = require('../models/Wallet');
const Kyc = require('../models/Kyc');

// Get wallet balance
exports.getWalletBalance = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }
    res.status(200).json({
      message: 'Wallet balance retrieved successfully',
      data: { balance: wallet.balance }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Deposit money
exports.deposit = async (req, res) => {
  try {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    // Check KYC status
    const kyc = await Kyc.findOne({ user: req.user._id });
    if (!kyc || kyc.status !== 'Verified') {
      return res.status(403).json({ message: 'KYC verification required for transactions' });
    }

    let wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet) {
      wallet = new Wallet({ user: req.user._id });
    }

    const transaction = {
      type: 'deposit',
      amount,
      reference: `DEP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'completed'
    };

    wallet.transactions.push(transaction);
    wallet.balance += amount;
    await wallet.save();

    res.status(200).json({
      message: 'Deposit successful',
      data: {
        balance: wallet.balance,
        transaction
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Withdraw money
exports.withdraw = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    // Check KYC status
    const kyc = await Kyc.findOne({ user: req.user._id });
    if (!kyc || kyc.status !== 'Verified') {
      return res.status(403).json({ message: 'KYC verification required for transactions' });
    }

    const wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    if (wallet.balance < amount) {
      return res.status(400).json({ message: 'Insufficient funds' });
    }

    const transaction = {
      type: 'withdrawal',
      amount,
      reference: `WTH_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'completed'
    };

    wallet.transactions.push(transaction);
    wallet.balance -= amount;
    await wallet.save();

    res.status(200).json({
      message: 'Withdrawal successful',
      data: {
        balance: wallet.balance,
        transaction
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get transaction history
exports.getTransactions = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    res.status(200).json({
      message: 'Transaction history retrieved successfully',
      data: wallet.transactions
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};