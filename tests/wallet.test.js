const mongoose = require('mongoose');
const { 
  getWalletBalance, 
  deposit, 
  withdraw, 
  getTransactions 
} = require('../controllers/walletController');
const Wallet = require('../models/Wallet');
const Kyc = require('../models/Kyc');

// Mock the models
jest.mock('../models/Wallet');
jest.mock('../models/Kyc');

describe('Wallet Controller', () => {
  let req, res;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Mock request and response objects
    req = {
      user: { _id: new mongoose.Types.ObjectId() },
      body: {},
      params: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  // getWalletBalance tests
  describe('getWalletBalance', () => {
    it('should return 404 if wallet not found', async () => {
      Wallet.findOne.mockResolvedValue(null);

      await getWalletBalance(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Wallet not found' });
    });

    it('should return wallet balance successfully', async () => {
      const mockWallet = { balance: 1500 };
      Wallet.findOne.mockResolvedValue(mockWallet);

      await getWalletBalance(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Wallet balance retrieved successfully',
        data: { balance: 1500 }
      });
    });

    it('should handle server errors', async () => {
      Wallet.findOne.mockRejectedValue(new Error('Database error'));

      await getWalletBalance(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Server error',
        error: 'Database error'
      });
    });
  });

  // deposit tests
  describe('deposit', () => {
    it('should return 400 if amount is invalid', async () => {
      req.body = { amount: -100 };

      await deposit(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Valid amount is required' });
    });

    it('should return 403 if KYC is not verified', async () => {
      req.body = { amount: 1000 };
      Kyc.findOne.mockResolvedValue({ status: 'Pending' });

      await deposit(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'KYC verification required for transactions'
      });
    });

    it('should create new wallet and deposit successfully', async () => {
      req.body = { amount: 1000 };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      Wallet.findOne.mockResolvedValue(null);
      const mockWallet = {
        user: req.user._id,
        balance: 0,
        transactions: [],
        save: jest.fn().mockResolvedValue({ balance: 1000, transactions: [{}] })
      };
      Wallet.mockImplementation(() => mockWallet);

      await deposit(req, res);

      expect(mockWallet.balance).toBe(1000);
      expect(mockWallet.transactions.length).toBe(1);
      expect(mockWallet.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should deposit to existing wallet successfully', async () => {
      req.body = { amount: 1000 };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      const mockWallet = {
        balance: 500,
        transactions: [],
        save: jest.fn().mockResolvedValue({ balance: 1500, transactions: [{}] })
      };
      Wallet.findOne.mockResolvedValue(mockWallet);

      await deposit(req, res);

      expect(mockWallet.balance).toBe(1500);
      expect(mockWallet.transactions.length).toBe(1);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // withdraw tests
  describe('withdraw', () => {
    it('should return 400 if amount is invalid', async () => {
      req.body = { amount: 0 };

      await withdraw(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Valid amount is required' });
    });

    it('should return 403 if KYC is not verified', async () => {
      req.body = { amount: 500 };
      Kyc.findOne.mockResolvedValue(null);

      await withdraw(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'KYC verification required for transactions'
      });
    });

    it('should return 404 if wallet not found', async () => {
      req.body = { amount: 500 };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      Wallet.findOne.mockResolvedValue(null);

      await withdraw(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Wallet not found' });
    });

    it('should return 400 if insufficient funds', async () => {
      req.body = { amount: 1000 };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      Wallet.findOne.mockResolvedValue({ balance: 500, transactions: [] });

      await withdraw(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Insufficient funds' });
    });

    it('should withdraw successfully', async () => {
      req.body = { amount: 500 };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      const mockWallet = {
        balance: 1500,
        transactions: [],
        save: jest.fn().mockResolvedValue({ balance: 1000, transactions: [{}] })
      };
      Wallet.findOne.mockResolvedValue(mockWallet);

      await withdraw(req, res);

      expect(mockWallet.balance).toBe(1000);
      expect(mockWallet.transactions.length).toBe(1);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // getTransactions tests
  describe('getTransactions', () => {
    it('should return 404 if wallet not found', async () => {
      Wallet.findOne.mockResolvedValue(null);

      await getTransactions(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Wallet not found' });
    });

    it('should return transaction history successfully', async () => {
      const mockTransactions = [
        { type: 'deposit', amount: 1000 },
        { type: 'withdrawal', amount: 500 }
      ];
      Wallet.findOne.mockResolvedValue({ transactions: mockTransactions });

      await getTransactions(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Transaction history retrieved successfully',
        data: mockTransactions
      });
    });

    it('should handle server errors', async () => {
      Wallet.findOne.mockRejectedValue(new Error('Database error'));

      await getTransactions(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Server error',
        error: 'Database error'
      });
    });
  });
});

// Cleanup
afterAll(async () => {
  await mongoose.connection.close();
});