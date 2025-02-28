const mongoose = require('mongoose');
const axios = require('axios');
const crypto = require('crypto');
const {
  initializePayment,
  chargePayment,
  getTransactionStatus,
  handleWebhook,
  deposit,
  withdraw,
  getWalletBalance,
  getTransactions
} = require('../controllers/paymentController');
const Wallet = require('../models/Wallet');
const Kyc = require('../models/Kyc');

// Mock dependencies
jest.mock('axios');
jest.mock('../models/Wallet');
jest.mock('../models/Kyc');

describe('Payment Controller', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      user: { _id: new mongoose.Types.ObjectId() },
      body: {},
      query: {},
      headers: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_120b89d7613bbb0f5245929f9b15b0e440cee4da';
  });

  // initializePayment tests
  describe('initializePayment', () => {
    it('should return 400 if amount or email missing', async () => {
      req.body = { amount: '' };
      await initializePayment(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Amount and email are required' });
    });

    it('should return 403 if KYC not verified', async () => {
      req.body = { amount: 500, email: 'test@example.com' };
      Kyc.findOne.mockResolvedValue({ status: 'Pending' });
      await initializePayment(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should initialize payment successfully', async () => {
      req.body = { amount: 500, email: 'test@example.com' };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      axios.post.mockResolvedValue({ data: { data: { authorization_url: 'url' } } });
      await initializePayment(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Payment initialized successfully',
        data: { authorization_url: 'url' }
      });
    });
  });

  // chargePayment tests
  describe('chargePayment', () => {
    it('should return 400 if reference missing', async () => {
      req.body = {};
      await chargePayment(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should charge payment successfully', async () => {
      req.body = { reference: 'ref123' };
      axios.get.mockResolvedValue({
        data: { data: { status: 'success', amount: 50000, metadata: { userId: req.user._id } } }
      });
      const mockWallet = { balance: 0, transactions: [], save: jest.fn().mockResolvedValue(true) };
      Wallet.findOne.mockResolvedValue(mockWallet);
      await chargePayment(req, res);
      expect(mockWallet.balance).toBe(500);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // getTransactionStatus tests
  describe('getTransactionStatus', () => {
    it('should return 400 if reference missing', async () => {
      req.query = {};
      await getTransactionStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should get transaction status successfully', async () => {
      req.query = { reference: 'ref123' };
      axios.get.mockResolvedValue({ data: { data: { status: 'success' } } });
      await getTransactionStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // handleWebhook tests
  describe('handleWebhook', () => {
    it('should return 401 if signature invalid', async () => {
      req.body = Buffer.from(JSON.stringify({ event: 'charge.success' }));
      req.headers['x-paystack-signature'] = 'wrong_hash';
      await handleWebhook(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Invalid signature' });
    });

    it('should process charge.success event', async () => {
      const event = { event: 'charge.success', data: { reference: 'ref123', amount: 50000, metadata: { userId: req.user._id } } };
      req.body = Buffer.from(JSON.stringify(event));
      const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(JSON.stringify(event)).digest('hex');
      req.headers['x-paystack-signature'] = hash;
      const mockWallet = { balance: 0, transactions: [], save: jest.fn().mockResolvedValue(true) };
      Wallet.findOne.mockResolvedValue(mockWallet);
      await handleWebhook(req, res);
      expect(mockWallet.balance).toBe(500);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('Webhook received');
    });
  });

  // deposit tests
  describe('deposit', () => {
    it('should return 400 if amount invalid', async () => {
      req.body = { amount: 0 };
      await deposit(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should prompt for payment initialization', async () => {
      req.body = { amount: 500 };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      await deposit(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Please initialize payment with /api/payment/gateway',
        nextStep: 'POST /api/payment/gateway with amount and email'
      });
    });
  });

  // withdraw tests
  describe('withdraw', () => {
    it('should return 400 if inputs missing', async () => {
      req.body = { amount: '' };
      await withdraw(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 403 if KYC not verified', async () => {
      req.body = { amount: 500, bankCode: '044', accountNumber: '0690000031' };
      Kyc.findOne.mockResolvedValue(null);
      await withdraw(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 400 if insufficient funds', async () => {
      req.body = { amount: 500, bankCode: '044', accountNumber: '0690000031' };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      Wallet.findOne.mockResolvedValue({ balance: 100, transactions: [] });
      await withdraw(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // getWalletBalance tests
  describe('getWalletBalance', () => {
    it('should return 404 if wallet not found', async () => {
      Wallet.findOne.mockResolvedValue(null);
      await getWalletBalance(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return balance successfully', async () => {
      Wallet.findOne.mockResolvedValue({ balance: 1000 });
      await getWalletBalance(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // getTransactions tests
  describe('getTransactions', () => {
    it('should return 404 if wallet not found', async () => {
      Wallet.findOne.mockResolvedValue(null);
      await getTransactions(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return transactions successfully', async () => {
      Wallet.findOne.mockResolvedValue({ transactions: [{ type: 'deposit', amount: 500 }] });
      await getTransactions(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });
});