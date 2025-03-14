const { addMerchant, getMerchantQRCode, payMerchant } = require('../controllers/merchantController');
const Wallet = require('../models/Wallet');
const Kyc = require('../models/Kyc');
const Merchant = require('../models/Merchant');
const { generateQRCode } = require('../utils/qrUtils');

jest.mock('../models/Wallet');
jest.mock('../models/Kyc');
jest.mock('../models/Merchant');
jest.mock('../utils/qrUtils');

describe('Merchant Controller', () => {
  let mockRequest;
  let mockResponse;

  beforeEach(() => {
    mockRequest = {
      body: {},
      user: { _id: 'user123' },
      query: {}
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('addMerchant', () => {
    it('should fail if required fields are missing', async () => {
      await addMerchant(mockRequest, mockResponse);
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Name, email, and business ID are required'
      });
    });

    it('should fail if merchant email already exists', async () => {
      mockRequest.body = {
        name: 'Test Merchant',
        email: 'test@email.com',
        businessId: 'B123'
      };
      Merchant.findOne.mockResolvedValue({ email: 'test@email.com' });

      await addMerchant(mockRequest, mockResponse);
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'A merchant with this email already exists'
      });
    });

    it('should successfully add merchant', async () => {
      mockRequest.body = {
        name: 'Test Merchant',
        email: 'test@email.com',
        businessId: 'B123'
      };
      Merchant.findOne.mockResolvedValue(null);
      generateQRCode.mockResolvedValue('mock-qr-code');
      Merchant.prototype.save = jest.fn().mockResolvedValue({});

      await addMerchant(mockRequest, mockResponse);
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Merchant added successfully',
        data: expect.any(Object)
      });
    });
  });

  describe('getMerchantQRCode', () => {
    it('should fail if businessId is not provided', async () => {
      await getMerchantQRCode(mockRequest, mockResponse);
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Business ID is required'
      });
    });

    it('should return QR code for existing merchant', async () => {
      mockRequest.query = { businessId: 'B123' };
      const mockMerchant = {
        businessId: 'B123',
        name: 'Test Merchant',
        qrCode: 'mock-qr-code',
        save: jest.fn()
      };
      Merchant.findOne.mockResolvedValue(mockMerchant);

      await getMerchantQRCode(mockRequest, mockResponse);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Merchant QR code retrieved successfully',
        data: { qrCode: 'mock-qr-code' }
      });
    });
  });

  describe('payMerchant', () => {
    it('should fail if required fields are missing', async () => {
      await payMerchant(mockRequest, mockResponse);
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Business ID and valid amount are required'
      });
    });

    it('should successfully pay merchant', async () => {
      mockRequest.body = {
        businessId: 'B123',
        amount: 100
      };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      const mockWallet = {
        balance: 200,
        transactions: [],
        save: jest.fn()
      };
      Wallet.findOne.mockResolvedValue(mockWallet);
      Merchant.findOne.mockResolvedValue({ businessId: 'B123', name: 'Test Merchant' });

      await payMerchant(mockRequest, mockResponse);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Merchant payment successful',
        data: expect.any(Object)
      });
    });
  });
});