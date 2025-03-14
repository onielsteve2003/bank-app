const { generateQR, scanQR, getQRHistory } = require('../controllers/qrController');
const Wallet = require('../models/Wallet');
const Kyc = require('../models/Kyc');
const QRTransaction = require('../models/QRTransaction');
const User = require('../models/User');
const Merchant = require('../models/Merchant');
const { generateQRCode } = require('../utils/qrUtils');

jest.mock('../models/Wallet');
jest.mock('../models/Kyc');
jest.mock('../models/QRTransaction');
jest.mock('../models/User');
jest.mock('../models/Merchant');
jest.mock('../utils/qrUtils');

describe('QR Controller', () => {
  let mockRequest;
  let mockResponse;

  beforeEach(() => {
    mockRequest = {
      body: {},
      user: { _id: 'user123' }
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateQR', () => {
    it('should fail if amount is invalid', async () => {
      await generateQR(mockRequest, mockResponse);
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Valid amount is required'
      });
    });

    it('should successfully generate QR code', async () => {
      mockRequest.body = { amount: 100 };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      generateQRCode.mockResolvedValue('mock-qr-code');
      QRTransaction.prototype.save = jest.fn().mockResolvedValue({ _id: 'trans123' });

      await generateQR(mockRequest, mockResponse);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'QR code generated successfully',
        data: expect.any(Object)
      });
    });
  });

  describe('scanQR', () => {
    it('should fail if qrCode is not provided', async () => {
      await scanQR(mockRequest, mockResponse);
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'QR code is required'
      });
    });

    it('should successfully process user-to-user payment', async () => {
      mockRequest.body = {
        qrCode: 'https://mock-qr-code.com/%7B%22userId%22%3A%22recipient123%22%2C%22amount%22%3A100%7D'
      };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      const mockSenderWallet = {
        balance: 200,
        transactions: [],
        save: jest.fn()
      };
      const mockRecipientWallet = {
        balance: 50,
        transactions: [],
        save: jest.fn()
      };
      Wallet.findOne
        .mockResolvedValueOnce(mockSenderWallet)
        .mockResolvedValueOnce(mockRecipientWallet);
      User.findById.mockResolvedValue({ email: 'recipient@test.com' });
      QRTransaction.prototype.save = jest.fn().mockResolvedValue({ _id: 'trans123' });
      QRTransaction.findOne.mockResolvedValue(null);

      await scanQR(mockRequest, mockResponse);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Payment successful via QR code',
        data: expect.any(Object)
      });
    });
  });

  describe('getQRHistory', () => {
    it('should return QR transaction history', async () => {
      const mockTransactions = [
        { _id: 'trans1', user: 'user123', amount: 100 },
        { _id: 'trans2', user: 'user123', amount: 200 }
      ];
      QRTransaction.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue(mockTransactions)
      });

      await getQRHistory(mockRequest, mockResponse);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'QR transaction history retrieved successfully',
        data: mockTransactions
      });
    });
  });
});