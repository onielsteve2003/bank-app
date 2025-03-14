const { payBill, getBillCategories } = require('../controllers/billController');
const Wallet = require('../models/Wallet');
const Kyc = require('../models/Kyc');
const Bill = require('../models/Bill');

jest.mock('../models/Wallet');
jest.mock('../models/Kyc');
jest.mock('../models/Bill');

describe('Bill Controller', () => {
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

  describe('payBill', () => {
    it('should fail if required fields are missing', async () => {
      await payBill(mockRequest, mockResponse);
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Category, provider, bill reference, and valid amount are required'
      });
    });

    it('should fail if KYC is not verified', async () => {
      mockRequest.body = {
        category: 'Electricity',
        provider: 'TestProvider',
        billReference: '12345',
        amount: 100
      };
      Kyc.findOne.mockResolvedValue({ status: 'Pending' });

      await payBill(mockRequest, mockResponse);
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'KYC verification required'
      });
    });

    it('should fail if insufficient funds', async () => {
      mockRequest.body = {
        category: 'Electricity',
        provider: 'TestProvider',
        billReference: '12345',
        amount: 100
      };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      Wallet.findOne.mockResolvedValue({ balance: 50 });

      await payBill(mockRequest, mockResponse);
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Insufficient funds or wallet not found'
      });
    });

    it('should successfully pay bill', async () => {
      mockRequest.body = {
        category: 'Electricity',
        provider: 'TestProvider',
        billReference: '12345',
        amount: 100
      };
      Kyc.findOne.mockResolvedValue({ status: 'Verified' });
      const mockWallet = {
        balance: 200,
        transactions: [],
        save: jest.fn()
      };
      Wallet.findOne.mockResolvedValue(mockWallet);
      Bill.prototype.save = jest.fn().mockResolvedValue({});

      await payBill(mockRequest, mockResponse);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Bill payment successful',
        data: expect.any(Object)
      });
    });
  });

  describe('getBillCategories', () => {
    it('should return bill categories', async () => {
      await getBillCategories(mockRequest, mockResponse);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Bill categories retrieved successfully',
        data: expect.arrayContaining(['Electricity', 'Water', 'Internet'])
      });
    });
  });
});