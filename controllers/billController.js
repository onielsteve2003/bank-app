const Wallet = require('../models/Wallet');
const Kyc = require('../models/Kyc');
const Bill = require('../models/Bill');

// Pay a bill
exports.payBill = async (req, res) => {
  try {
    const { category, provider, billReference, amount } = req.body;
    const userId = req.user._id;

    if (!category || !provider || !billReference || !amount || amount <= 0) {
      return res.status(400).json({ message: 'Category, provider, bill reference, and valid amount are required' });
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

    // Simulate third-party bill payment API call (replace with actual integration if needed)
    const billPaymentSuccessful = true; // Mock success response

    if (!billPaymentSuccessful) {
      return res.status(400).json({ message: 'Bill payment failed at provider' });
    }

    // Create bill payment record
    const bill = new Bill({
      user: userId,
      category,
      provider,
      billReference,
      amount,
      status: 'completed',
      completedAt: Date.now()
    });

    // Deduct from wallet
    wallet.balance -= amount;
    wallet.transactions.push({
      type: 'withdrawal',
      amount,
      reference: bill.reference,
      status: 'completed'
    });

    await Promise.all([bill.save(), wallet.save()]);

    res.status(200).json({
      message: 'Bill payment successful',
      data: bill
    });
  } catch (error) {
    console.error('Pay bill error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get bill categories
exports.getBillCategories = async (req, res) => {
  try {
    const categories = ['Electricity', 'Water', 'Internet', 'Cable TV', 'Phone', 'Other'];
    res.status(200).json({
      message: 'Bill categories retrieved successfully',
      data: categories
    });
  } catch (error) {
    console.error('Get bill categories error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};