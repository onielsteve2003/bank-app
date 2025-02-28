const axios = require('axios');
const crypto = require('crypto');
const Wallet = require('../models/Wallet');
const Kyc = require('../models/Kyc');

const PAYSTACK_BASE_URL = 'https://api.paystack.co';
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// Initialize Payment (Deposit)
exports.initializePayment = async (req, res) => {
  try {
    const { amount, email } = req.body;

    if (!amount || amount <= 0 || !email) {
      return res.status(400).json({ message: 'Amount and email are required' });
    }

    // Check KYC status
    const kyc = await Kyc.findOne({ user: req.user._id });
    if (!kyc || kyc.status !== 'Verified') {
      return res.status(403).json({ message: 'KYC verification required' });
    }

    const response = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        email,
        amount: amount * 100, // Paystack uses kobo (multiply by 100 for NGN)
        callback_url: 'http://localhost:5000/api/payment/callback',
        metadata: { userId: req.user._id.toString() }
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.status(200).json({
      message: 'Payment initialized successfully',
      data: response.data.data // Contains authorization_url for client redirect
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Charge Payment (Finalize Deposit or Withdrawal)
exports.chargePayment = async (req, res) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({ message: 'Transaction reference required' });
    }

    const response = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const { status, amount, metadata } = response.data.data;
    if (status !== 'success') {
      return res.status(400).json({ message: 'Payment not successful' });
    }

    const userId = metadata.userId;
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      wallet = new Wallet({ user: userId });
    }

    const transaction = {
      type: 'deposit',
      amount: amount / 100, // Convert back from kobo
      reference,
      status: 'completed'
    };

    wallet.transactions.push(transaction);
    wallet.balance += transaction.amount;
    await wallet.save();

    res.status(200).json({
      message: 'Payment charged and wallet updated',
      data: { balance: wallet.balance, transaction }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get Transaction Status
exports.getTransactionStatus = async (req, res) => {
  try {
    const { reference } = req.query;

    if (!reference) {
      return res.status(400).json({ message: 'Transaction reference required' });
    }

    const response = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
        }
      }
    );

    res.status(200).json({
      message: 'Transaction status retrieved',
      data: response.data.data
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Webhook Handler (Paystack notifies this endpoint)
exports.handleWebhook = async (req, res) => {
  try {
    // Raw body is a Buffer, convert to string and parse
    const rawBody = req.body.toString('utf8');
    const event = JSON.parse(rawBody);
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    // Compute the HMAC SHA512 signature
    const hash = crypto
      .createHmac('sha512', secretKey)
      .update(rawBody) // Use raw string body for hashing
      .digest('hex');

    // Compare with the signature from Paystack
    if (req.headers['x-paystack-signature'] !== hash) {
      console.log('Invalid signature:', req.headers['x-paystack-signature'], 'Calculated:', hash);
      return res.status(401).json({ message: 'Invalid signature' });
    }

    // Process the event if signature is valid
    if (event.event === 'charge.success') {
      const { reference, amount, metadata } = event.data;
      const userId = metadata.userId;

      let wallet = await Wallet.findOne({ user: userId });
      if (!wallet) {
        wallet = new Wallet({ user: userId });
      }

      const transactionExists = wallet.transactions.some(t => t.reference === reference);
      if (!transactionExists) {
        const transaction = {
          type: 'deposit',
          amount: amount / 100,
          reference,
          status: 'completed'
        };
        wallet.transactions.push(transaction);
        wallet.balance += transaction.amount;
        await wallet.save();
      }
    }

    res.status(200).send('Webhook received');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ message: 'Webhook error', error: error.message });
  }
};

// Update Existing Deposit (with Paystack)
exports.deposit = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }
    const kyc = await Kyc.findOne({ user: req.user._id });
    if (!kyc || kyc.status !== 'Verified') {
      return res.status(403).json({ message: 'KYC verification required' });
    }
    return res.status(200).json({
      message: 'Please initialize payment with /api/payment/gateway',
      nextStep: 'POST /api/payment/gateway with amount and email'
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Withdrawal with Paystack Transfer
exports.withdraw = async (req, res) => {
  try {
    const { amount, bankCode, accountNumber } = req.body;
    const parsedAmount = parseFloat(amount);

    if (!parsedAmount || parsedAmount <= 0 || !bankCode || !accountNumber) {
      return res.status(400).json({ message: 'Amount (positive number), bank code, and account number required' });
    }

    const kyc = await Kyc.findOne({ user: req.user._id });
    if (!kyc || kyc.status !== 'Verified') {
      return res.status(403).json({ message: 'KYC verification required' });
    }

    const wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet || wallet.balance < parsedAmount) {
      return res.status(400).json({ message: 'Insufficient funds or wallet not found' });
    }

    const isTestMode = PAYSTACK_SECRET_KEY.startsWith('sk_test_');
    let recipientName = 'Withdrawal Recipient';
    let recipientCode;
    let transferData;

    if (isTestMode && accountNumber === '0000000000') {
      return res.status(400).json({ message: 'Invalid test account number. Use a valid Paystack test account (e.g., 0690000031 with bank code 044)' });
    }

    if (isTestMode && bankCode === '044' && accountNumber === '0690000031') {
      console.warn('Mocking recipient creation and transfer for test account 0690000031 in test mode');
      recipientCode = 'RCP_test_mock_123';
      transferData = {
        status: true,
        data: {
          transfer_code: `TRF_mock_${Date.now()}`
        }
      }; // Mock successful transfer response
    } else if (!isTestMode) {
      const resolveResponse = await axios.get(
        `${PAYSTACK_BASE_URL}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        {
          headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
        }
      ).catch(error => {
        console.error('Account resolution error:', error.response?.data, error.message);
        throw new Error(`Account resolution failed: ${error.response?.data?.message || error.message}`);
      });

      if (!resolveResponse.data.status || !resolveResponse.data.data.account_name) {
        throw new Error('Account resolution failed: Invalid account details');
      }
      recipientName = resolveResponse.data.data.account_name;

      const recipientResponse = await axios.post(
        `${PAYSTACK_BASE_URL}/transferrecipient`,
        {
          type: 'nuban',
          name: recipientName,
          account_number: accountNumber,
          bank_code: bankCode,
          currency: 'NGN'
        },
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      ).catch(error => {
        throw new Error(`Recipient creation failed: ${error.response?.data?.message || error.message}`);
      });
      recipientCode = recipientResponse.data.data.recipient_code;

      const transferResponse = await axios.post(
        `${PAYSTACK_BASE_URL}/transfer`,
        {
          source: 'balance',
          amount: Math.floor(parsedAmount * 100),
          recipient: recipientCode,
          reason: 'Wallet Withdrawal'
        },
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      ).catch(error => {
        console.error('Transfer error response:', error.response?.data, error.message);
        throw new Error(`Transfer failed: ${error.response?.data?.message || error.message}`);
      });
      transferData = transferResponse;
    } else {
      const recipientResponse = await axios.post(
        `${PAYSTACK_BASE_URL}/transferrecipient`,
        {
          type: 'nuban',
          name: recipientName,
          account_number: accountNumber,
          bank_code: bankCode,
          currency: 'NGN'
        },
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      ).catch(error => {
        console.error('Recipient creation raw error:', error.message, error.response?.data, error.response?.status);
        throw new Error(`Recipient creation failed: ${error.response?.data?.message || error.message}`);
      });
      recipientCode = recipientResponse.data.data.recipient_code;

      const transferResponse = await axios.post(
        `${PAYSTACK_BASE_URL}/transfer`,
        {
          source: 'balance',
          amount: Math.floor(parsedAmount * 100),
          recipient: recipientCode,
          reason: 'Wallet Withdrawal'
        },
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      ).catch(error => {
        console.error('Transfer error response:', error.response?.data, error.message);
        throw new Error(`Transfer failed: ${error.response?.data?.message || error.message}`);
      });
      transferData = transferResponse;
    }

    if (transferData.status) {
      const transaction = {
        type: 'withdrawal',
        amount: parsedAmount,
        reference: transferData.data.transfer_code,
        status: 'completed'
      };
      console.log('Before update:', wallet.balance);
      wallet.transactions.push(transaction);
      wallet.balance -= parsedAmount;
      console.log('After update:', wallet.balance);
      await wallet.save();

      res.status(200).json({
        message: 'Withdrawal successful',
        data: { balance: wallet.balance, transaction }
      });
    } else {
      res.status(400).json({ message: 'Withdrawal failed' });
    }
  } catch (error) {
    console.error('Withdrawal error:', error.message, error.response?.data, error.response?.status);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

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