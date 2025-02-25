const mongoose = require('mongoose');
const { submitKYC, approveKYC, rejectKYC, getKYCStatus } = require('../controllers/kycController');
const Kyc = require('../models/Kyc');

// Mock the Kyc model
jest.mock('../models/Kyc');

describe('KYC Controller', () => {
  let req, res;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Mock request and response objects
    req = {
      body: {},
      user: { _id: new mongoose.Types.ObjectId() },
      file: { path: 'path/to/image.jpg' },
      params: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  // submitKYC tests
  describe('submitKYC', () => {
    it('should return 400 if required fields are missing', async () => {
      req.body = { fullName: '' };
      req.file = null;

      await submitKYC(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'All fields are required' });
    });

    it('should return 400 if KYC is already verified', async () => {
      req.body = { fullName: 'John Doe', idType: 'Passport', idNumber: '123456' };
      Kyc.findOne.mockResolvedValue({ status: 'Verified', user: req.user._id });

      await submitKYC(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Your KYC has been verified. You cannot resubmit.'
      });
    });

    it('should delete rejected KYC and allow new submission', async () => {
      req.body = { fullName: 'John Doe', idType: 'Passport', idNumber: '123456' };
      const mockKyc = { _id: new mongoose.Types.ObjectId(), status: 'Rejected' };
      Kyc.findOne.mockResolvedValueOnce(mockKyc);
      Kyc.findOne.mockResolvedValueOnce(null); // For idNumber check
      Kyc.deleteOne.mockResolvedValue({});
      Kyc.prototype.save = jest.fn().mockResolvedValue({
        fullName: 'John Doe',
        status: 'Pending'
      });

      await submitKYC(req, res);

      expect(Kyc.deleteOne).toHaveBeenCalledWith({ _id: mockKyc._id });
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should successfully submit new KYC', async () => {
      req.body = { fullName: 'John Doe', idType: 'Passport', idNumber: '123456' };
      Kyc.findOne.mockResolvedValue(null);
      Kyc.prototype.save = jest.fn().mockResolvedValue({
        fullName: 'John Doe',
        status: 'Pending'
      });

      await submitKYC(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'KYC submitted successfully',
        data: expect.any(Object)
      });
    });
  });

  // approveKYC tests
  describe('approveKYC', () => {
    it('should return 404 if KYC not found', async () => {
      req.params.userId = new mongoose.Types.ObjectId();
      Kyc.findOne.mockResolvedValue(null);

      await approveKYC(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'No KYC found' });
    });

    it('should successfully approve KYC', async () => {
      req.params.userId = new mongoose.Types.ObjectId();
      const mockKyc = {
        status: 'Pending',
        save: jest.fn().mockResolvedValue({ status: 'Verified' })
      };
      Kyc.findOne.mockResolvedValue(mockKyc);

      await approveKYC(req, res);

      expect(mockKyc.status).toBe('Verified');
      expect(mockKyc.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // rejectKYC tests
  describe('rejectKYC', () => {
    it('should return 404 if KYC not found', async () => {
      req.params.userId = new mongoose.Types.ObjectId();
      Kyc.findOne.mockResolvedValue(null);

      await rejectKYC(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'No KYC found' });
    });

    it('should successfully reject and delete KYC', async () => {
      req.params.userId = new mongoose.Types.ObjectId();
      const mockKyc = { _id: new mongoose.Types.ObjectId() };
      Kyc.findOne.mockResolvedValue(mockKyc);
      Kyc.deleteOne.mockResolvedValue({});

      await rejectKYC(req, res);

      expect(Kyc.deleteOne).toHaveBeenCalledWith({ _id: mockKyc._id });
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // getKYCStatus tests
  describe('getKYCStatus', () => {
    it('should return 404 if KYC not found', async () => {
      Kyc.findOne.mockResolvedValue(null);

      await getKYCStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'No KYC found' });
    });

    it('should successfully return KYC status', async () => {
      const mockKyc = { status: 'Pending' };
      Kyc.findOne.mockResolvedValue(mockKyc);

      await getKYCStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'KYC status retrieved successfully',
        data: { kycStatus: 'Pending' }
      });
    });

    it('should handle server errors', async () => {
      Kyc.findOne.mockRejectedValue(new Error('Database error'));

      await getKYCStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Server error',
        error: 'Database error'
      });
    });
  });
});

// Mock the database connection for cleanup
afterAll(async () => {
  await mongoose.connection.close();
});