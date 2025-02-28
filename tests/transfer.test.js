const mongoose = require('mongoose');
const {
  sendMoney,
  requestMoney,
  getTransferTransactions,
  cancelRequest,
  acceptRequest,
  getFees,
  getLimits,
  setLimit
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
      const sender = { _id: req.user._id, email: 'sender@example.com', transferLimits: { min: 100, max: 50000 } };
      User.findById.mockResolvedValue(sender);
      User.findOne.mockResolvedValue(sender);
      await sendMoney(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Cannot send money to yourself' });
    });

    it('should return 404 if recipient not found', async () => {
      req.body = { recipientEmail: 'recipient@example.com', amount: 500 };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      User.findById.mockResolvedValue({ _id: req.user._id, email: 'sender@example.com', transferLimits: { min: 100, max: 50000 } });
      User.findOne.mockResolvedValue(null);
      await sendMoney(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Recipient not found' });
    });

    it('should return 400 if amount below user limit', async () => {
      req.body = { recipientEmail: 'recipient@example.com', amount: 50 };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      const sender = { _id: req.user._id, email: 'sender@example.com', transferLimits: { min: 100, max: 50000 } };
      const recipient = { _id: new mongoose.Types.ObjectId(), email: 'recipient@example.com' };
      User.findById.mockResolvedValue(sender);
      User.findOne.mockResolvedValue(recipient);
      Wallet.findOne
        .mockResolvedValueOnce({ balance: 1000, transactions: [], save: jest.fn() })
        .mockResolvedValueOnce({ balance: 0, transactions: [], save: jest.fn() });
      await sendMoney(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Amount must be between 100 and 50000 NGN' });
    });

    it('should return 400 if amount above user limit', async () => {
      req.body = { recipientEmail: 'recipient@example.com', amount: 60000 };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      const sender = { _id: req.user._id, email: 'sender@example.com', transferLimits: { min: 100, max: 50000 } };
      const recipient = { _id: new mongoose.Types.ObjectId(), email: 'recipient@example.com' };
      User.findById.mockResolvedValue(sender);
      User.findOne.mockResolvedValue(recipient);
      Wallet.findOne
        .mockResolvedValueOnce({ balance: 1000, transactions: [], save: jest.fn() })
        .mockResolvedValueOnce({ balance: 0, transactions: [], save: jest.fn() });
      await sendMoney(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Amount must be between 100 and 50000 NGN' });
    });

    it('should return 400 if insufficient funds including fee', async () => {
      req.body = { recipientEmail: 'recipient@example.com', amount: 500 };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      const sender = { _id: req.user._id, email: 'sender@example.com', transferLimits: { min: 100, max: 50000 } };
      const recipient = { _id: new mongoose.Types.ObjectId(), email: 'recipient@example.com' };
      User.findById.mockResolvedValue(sender);
      User.findOne.mockResolvedValue(recipient);
      Wallet.findOne
        .mockResolvedValueOnce({ balance: 510, transactions: [], save: jest.fn() }) // 500 + fee (15) = 515
        .mockResolvedValueOnce({ balance: 0, transactions: [], save: jest.fn() });
      await sendMoney(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Insufficient funds including fee' });
    });

    it('should send money successfully with fee', async () => {
      req.body = { recipientEmail: 'recipient@example.com', amount: 500 };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      const sender = { _id: req.user._id, email: 'sender@example.com', transferLimits: { min: 100, max: 50000 } };
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
      expect(senderWallet.balance).toBe(485); // 1000 - (500 + 10 + 5)
      expect(recipientWallet.balance).toBe(500);
      expect(senderWallet.transactions[0].reference).toBe('TRF_123_sender');
      expect(senderWallet.transactions[0].amount).toBe(515); // Amount + fee
      expect(senderWallet.transactions[0].fee).toBe(15); // 10 + 1% of 500
      expect(recipientWallet.transactions[0].reference).toBe('TRF_123_recipient');
      expect(recipientWallet.transactions[0].amount).toBe(500);
      expect(senderWallet.save).toHaveBeenCalled();
      expect(recipientWallet.save).toHaveBeenCalled();
      expect(transferMock.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Money sent successfully',
        data: expect.objectContaining({ fee: 15 })
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

  // getTransferTransactions Tests
  describe('getTransferTransactions', () => {
    it('should retrieve transactions successfully', async () => {
      const transfers = [
        { 
          sender: { _id: req.user._id, email: 'sender@example.com' }, 
          recipient: { _id: new mongoose.Types.ObjectId(), email: 'recipient@example.com' }, 
          amount: 500 
        }
      ];
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
    });
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
        sender: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId(),
        type: 'request',
        status: 'pending'
      };
      Transfer.findById.mockResolvedValue(transfer);
      await acceptRequest(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 400 if amount below user limit', async () => {
      req.body = { transferId: '123' };
      const transfer = {
        _id: '123',
        sender: req.user._id,
        recipient: new mongoose.Types.ObjectId(),
        amount: 50,
        type: 'request',
        status: 'pending',
        reference: 'TRF_789'
      };
      Transfer.findById.mockResolvedValue(transfer);
      User.findById.mockResolvedValue({ _id: req.user._id, transferLimits: { min: 100, max: 50000 } });
      Wallet.findOne
        .mockResolvedValueOnce({ balance: 1000, transactions: [], save: jest.fn() })
        .mockResolvedValueOnce({ balance: 0, transactions: [], save: jest.fn() });
      await acceptRequest(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Amount must be between 100 and 50000 NGN' });
    });

    it('should return 400 if insufficient funds including fee', async () => {
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
      Transfer.findById.mockResolvedValue(transfer);
      User.findById.mockResolvedValue({ _id: req.user._id, transferLimits: { min: 100, max: 50000 } });
      Wallet.findOne
        .mockResolvedValueOnce({ balance: 510, transactions: [], save: jest.fn() }) // 500 + 15 = 515
        .mockResolvedValueOnce({ balance: 0, transactions: [], save: jest.fn() });
      await acceptRequest(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Insufficient funds including fee' });
    });

    it('should accept request successfully with fee', async () => {
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
      User.findById.mockResolvedValue({ _id: req.user._id, transferLimits: { min: 100, max: 50000 } });
      Wallet.findOne
        .mockResolvedValueOnce(senderWallet)
        .mockResolvedValueOnce(recipientWallet);

      await acceptRequest(req, res);
      expect(transfer.status).toBe('completed');
      expect(senderWallet.balance).toBe(687); // 1000 - (300 + 10 + 3)
      expect(recipientWallet.balance).toBe(300);
      expect(senderWallet.transactions[0].reference).toBe('TRF_123');
      expect(senderWallet.transactions[0].amount).toBe(313); // Amount + fee
      expect(senderWallet.transactions[0].fee).toBe(13); // 10 + 1% of 300
      expect(recipientWallet.transactions[0].reference).toBe('TRF_123');
      expect(recipientWallet.transactions[0].amount).toBe(300);
      expect(senderWallet.save).toHaveBeenCalled();
      expect(recipientWallet.save).toHaveBeenCalled();
      expect(transfer.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Money request accepted and transfer completed',
        data: expect.objectContaining({ fee: 13 })
      }));
    });
  });

  // getFees Tests
  describe('getFees', () => {
    it('should retrieve fee structure successfully', async () => {
      await getFees(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Fee structure retrieved successfully',
        data: { flat: 10, percentage: 0.01 }
      });
    });
  });

  // getLimits Tests
  describe('getLimits', () => {
    it('should return 404 if user not found', async () => {
      User.findById.mockResolvedValue(null);
      await getLimits(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'User not found' });
    });

    it('should retrieve limits successfully', async () => {
      User.findById.mockResolvedValue({ _id: req.user._id, transferLimits: { min: 100, max: 50000 } });
      await getLimits(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Transfer limits retrieved successfully',
        data: {
          userLimits: { min: 100, max: 50000 },
          globalLimits: { min: 50, max: 100000 }
        }
      });
    });
  });

  // setLimit Tests
  describe('setLimit', () => {
    it('should return 400 if min or max is missing or invalid', async () => {
      req.body = { min: '', max: '' };
      await setLimit(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Valid min and max limits are required' });
    });

    it('should return 400 if limits are outside global bounds', async () => {
      req.body = { min: 10, max: 200000 };
      User.findById.mockResolvedValue({ _id: req.user._id });
      await setLimit(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Limits must be between 50 and 100000 NGN' });
    });

    it('should return 400 if min is greater than or equal to max', async () => {
      req.body = { min: 1000, max: 500 };
      User.findById.mockResolvedValue({ _id: req.user._id });
      await setLimit(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Minimum limit must be less than maximum limit' });
    });

    it('should set limits successfully', async () => {
      req.body = { min: 200, max: 20000 };
      const user = { 
        _id: req.user._id, 
        transferLimits: { min: 100, max: 50000 }, 
        save: jest.fn().mockResolvedValue(true) 
      };
      User.findById.mockResolvedValue(user);
      await setLimit(req, res);
      expect(user.transferLimits).toEqual({ min: 200, max: 20000 });
      expect(user.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Transfer limits updated successfully',
        data: { min: 200, max: 20000 }
      });
    });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });
});