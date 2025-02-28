const mongoose = require('mongoose');
const {
  sendMoney,
  requestMoney,
  getTransferTransactions,
  cancelRequest,
  acceptRequest
} = require('../controllers/transferController');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Kyc = require('../models/Kyc');
const Transfer = require('../models/Transfer');

// Mock dependencies
jest.mock('../models/User');
jest.mock('../models/Wallet');
jest.mock('../models/Kyc');
jest.mock('../models/Transfer');

describe('Transfer Controller', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      user: { _id: new mongoose.Types.ObjectId() },
      body: {},
      query: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  // sendMoney Tests
  describe('sendMoney', () => {
    it('should return 400 if recipientEmail or amount is missing', async () => {
      req.body = { recipientEmail: '', amount: '' };
      await sendMoney(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Recipient email and valid amount are required' });
    });

    it('should return 403 if sender KYC is not verified', async () => {
      req.body = { recipientEmail: 'recipient@example.com', amount: 500 };
      Kyc.findOne.mockResolvedValue(null);
      await sendMoney(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Sender KYC verification required' });
    });

    it('should return 400 if sender tries to send to self', async () => {
      req.body = { recipientEmail: 'sender@example.com', amount: 500 };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      const sender = { _id: req.user._id, email: 'sender@example.com' };
      User.findById.mockResolvedValue(sender);
      User.findOne.mockResolvedValue(sender); // Same user as sender
      await sendMoney(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Cannot send money to yourself' });
    });

    it('should return 404 if recipient not found', async () => {
      req.body = { recipientEmail: 'recipient@example.com', amount: 500 };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      User.findById.mockResolvedValue({ _id: req.user._id, email: 'sender@example.com' });
      User.findOne.mockResolvedValue(null);
      await sendMoney(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Recipient not found' });
    });

    it('should return 400 if insufficient funds', async () => {
      req.body = { recipientEmail: 'recipient@example.com', amount: 500 };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      const sender = { _id: req.user._id, email: 'sender@example.com' };
      const recipient = { _id: new mongoose.Types.ObjectId(), email: 'recipient@example.com' };
      User.findById.mockResolvedValue(sender);
      User.findOne.mockResolvedValue(recipient);
      Wallet.findOne
        .mockResolvedValueOnce({ balance: 200, transactions: [], save: jest.fn() })
        .mockResolvedValueOnce({ balance: 0, transactions: [], save: jest.fn() });
      await sendMoney(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Insufficient funds' });
    });

    it('should send money successfully', async () => {
      req.body = { recipientEmail: 'recipient@example.com', amount: 500 };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      const sender = { _id: req.user._id, email: 'sender@example.com' };
      const recipient = { _id: new mongoose.Types.ObjectId(), email: 'recipient@example.com' };
      const senderWallet = { balance: 1000, transactions: [], save: jest.fn().mockResolvedValue(true) };
      const recipientWallet = { balance: 0, transactions: [], save: jest.fn().mockResolvedValue(true) };
      User.findById.mockResolvedValue(sender);
      User.findOne.mockResolvedValue(recipient);
      Wallet.findOne
        .mockResolvedValueOnce(senderWallet)
        .mockResolvedValueOnce(recipientWallet);
      const transferMock = {
        reference: 'TRF_123',
        save: jest.fn().mockResolvedValue({ reference: 'TRF_123' })
      };
      jest.spyOn(Transfer.prototype, 'save').mockImplementation(() => transferMock.save());
      Transfer.mockImplementation(() => transferMock);

      await sendMoney(req, res);
      expect(senderWallet.balance).toBe(500);
      expect(recipientWallet.balance).toBe(500);
      expect(senderWallet.transactions[0].reference).toBe('TRF_123_sender');
      expect(recipientWallet.transactions[0].reference).toBe('TRF_123_recipient');
      expect(senderWallet.save).toHaveBeenCalled();
      expect(recipientWallet.save).toHaveBeenCalled();
      expect(transferMock.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Money sent successfully'
      }));
    });
  });

  // requestMoney Tests
  describe('requestMoney', () => {
    it('should return 400 if senderEmail or amount is missing', async () => {
      req.body = { senderEmail: '', amount: '' };
      await requestMoney(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 403 if recipient KYC is not verified', async () => {
      req.body = { senderEmail: 'sender@example.com', amount: 300 };
      Kyc.findOne.mockResolvedValue(null);
      await requestMoney(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 404 if sender not found', async () => {
      req.body = { senderEmail: 'sender@example.com', amount: 300 };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      User.findOne.mockResolvedValue(null);
      await requestMoney(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should request money successfully', async () => {
      req.body = { senderEmail: 'sender@example.com', amount: 300 };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      const sender = { _id: new mongoose.Types.ObjectId(), email: 'sender@example.com' };
      User.findOne.mockResolvedValue(sender);
      const transferMock = {
        sender: sender._id,
        recipient: req.user._id,
        amount: 300,
        type: 'request',
        status: 'pending',
        reference: 'TRF_456',
        save: jest.fn().mockResolvedValue(true)
      };
      jest.spyOn(Transfer.prototype, 'save').mockImplementation(() => transferMock.save());
      Transfer.mockImplementation(() => transferMock);

      await requestMoney(req, res);
      expect(transferMock.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Money request sent successfully'
      }));
    });
  });

  describe('getTransferTransactions', () => {
    it('should retrieve transactions successfully', async () => {
      const transfers = [
        { 
          sender: { _id: req.user._id, email: 'sender@example.com' }, 
          recipient: { _id: new mongoose.Types.ObjectId(), email: 'recipient@example.com' }, 
          amount: 500 
        }
      ];
      // Mock query with full Promise-like behavior
      const mockQuery = {
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue(Promise.resolve(transfers))
        })
      };
      Transfer.find.mockReturnValue(mockQuery);
      await getTransferTransactions(req, res);
      expect(Transfer.find).toHaveBeenCalledWith({
        $or: [{ sender: req.user._id }, { recipient: req.user._id }]
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Transfer transactions retrieved successfully',
        data: transfers
      });
    }, 10000);
  });
  
  // cancelRequest Tests
  describe('cancelRequest', () => {
    it('should return 400 if transferId is missing', async () => {
      req.body = {};
      await cancelRequest(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 if transfer not found', async () => {
      req.body = { transferId: '123' };
      Transfer.findById.mockResolvedValue(null);
      await cancelRequest(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should allow recipient to cancel request', async () => {
      req.body = { transferId: '123' };
      const transfer = {
        _id: '123',
        recipient: req.user._id,
        sender: new mongoose.Types.ObjectId(),
        type: 'request',
        status: 'pending',
        save: jest.fn().mockResolvedValue(true)
      };
      Transfer.findById.mockResolvedValue(transfer);
      await cancelRequest(req, res);
      expect(transfer.status).toBe('cancelled');
      expect(transfer.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should allow sender to cancel request', async () => {
      req.body = { transferId: '123' };
      const transfer = {
        _id: '123',
        sender: req.user._id,
        recipient: new mongoose.Types.ObjectId(),
        type: 'request',
        status: 'pending',
        save: jest.fn().mockResolvedValue(true)
      };
      Transfer.findById.mockResolvedValue(transfer);
      await cancelRequest(req, res);
      expect(transfer.status).toBe('cancelled');
      expect(transfer.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 403 for unauthorized cancellation', async () => {
      req.body = { transferId: '123' };
      const transfer = {
        _id: '123',
        sender: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId(),
        type: 'request',
        status: 'pending'
      };
      Transfer.findById.mockResolvedValue(transfer);
      await cancelRequest(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  // acceptRequest Tests
  describe('acceptRequest', () => {
    it('should return 400 if transferId is missing', async () => {
      req.body = {};
      await acceptRequest(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 if transfer not found', async () => {
      req.body = { transferId: '123' };
      Transfer.findById.mockResolvedValue(null);
      await acceptRequest(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 403 if unauthorized or invalid request', async () => {
      req.body = { transferId: '123' };
      const transfer = {
        _id: '123',
        sender: new mongoose.Types.ObjectId(), // Different from req.user._id
        recipient: new mongoose.Types.ObjectId(),
        type: 'request',
        status: 'pending'
      };
      Transfer.findById.mockResolvedValue(transfer);
      await acceptRequest(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 400 if insufficient funds', async () => {
      req.body = { transferId: '123' };
      const transfer = {
        _id: '123',
        sender: req.user._id,
        recipient: new mongoose.Types.ObjectId(),
        amount: 500,
        type: 'request',
        status: 'pending',
        reference: 'TRF_789'
      };
      const senderWallet = { balance: 200, transactions: [], save: jest.fn() };
      const recipientWallet = { balance: 0, transactions: [], save: jest.fn() };
      Transfer.findById.mockResolvedValue(transfer);
      Wallet.findOne
        .mockResolvedValueOnce(senderWallet)
        .mockResolvedValueOnce(recipientWallet);
      await acceptRequest(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Insufficient funds' });
    });

    it('should accept request successfully', async () => {
      req.body = { transferId: '123' };
      const transfer = {
        _id: '123',
        sender: req.user._id,
        recipient: new mongoose.Types.ObjectId(),
        amount: 300,
        type: 'request',
        status: 'pending',
        reference: 'TRF_123',
        save: jest.fn().mockResolvedValue(true)
      };
      const senderWallet = { balance: 1000, transactions: [], save: jest.fn().mockResolvedValue(true) };
      const recipientWallet = { balance: 0, transactions: [], save: jest.fn().mockResolvedValue(true) };
      Transfer.findById.mockResolvedValue(transfer);
      Wallet.findOne
        .mockResolvedValueOnce(senderWallet)
        .mockResolvedValueOnce(recipientWallet);

      await acceptRequest(req, res);
      expect(transfer.status).toBe('completed');
      expect(senderWallet.balance).toBe(700);
      expect(recipientWallet.balance).toBe(300);
      expect(senderWallet.transactions[0].reference).toBe('TRF_123');
      expect(recipientWallet.transactions[0].reference).toBe('TRF_123');
      expect(senderWallet.save).toHaveBeenCalled();
      expect(recipientWallet.save).toHaveBeenCalled();
      expect(transfer.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Money request accepted and transfer completed'
      }));
    });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });
});