const request = require('supertest');
const app = require('../server'); 
const mongoose = require('mongoose');
const User = require('../models/User');

// Setup for clearing the users collection before each test to avoid duplicates
beforeEach(async () => {
  await mongoose.connection.dropDatabase(); // Ensure database is cleared before each test
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
});

afterAll(async () => {
  await mongoose.disconnect(); // Ensure the connection is closed after all tests
});

// Set a global timeout for Jest to handle long-running operations
jest.setTimeout(10000);  // Increase timeout from default 5000ms to 10 seconds

jest.mock('../utils/sendEmail', () => ({
  sendMail: jest.fn().mockResolvedValue(true),
}));

describe('Authentication Routes', () => {
  // Test the registration endpoint
  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'testuser@example.com',
          password: 'password123',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('_id');
      expect(response.body.email).toBe('testuser@example.com');
    });

    it('should return error if user already exists', async () => {
      // Create a user first
      await User.create({
        email: 'testuser@example.com',
        password: 'password123',
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'testuser@example.com',
          password: 'password123',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('User already exists');
    });
  });

  // Test the login endpoint
  describe('POST /api/auth/login', () => {
    it('should log in successfully', async () => {
      const user = await User.create({
        email: 'testuser@example.com',
        password: 'password123',
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'password123',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
    });

    it('should return error for invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid credentials - User not found');
    });
  });

  // Test forgot password endpoint
  describe('POST /api/auth/forgot-password', () => {
    beforeAll(() => {
      jest.setTimeout(45000);
    });
    it('should send a password reset email', async () => {
      const user = await User.create({
        email: 'testuser@example.com',
        password: 'password123',
      });

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'testuser@example.com' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Password reset email sent successfully');
    });

    it('should return error for non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('User not found');
    });
  });

  // Test reset password endpoint
  describe('POST /api/auth/reset-password', () => {
    it('should reset the password successfully', async () => {
      const user = await User.create({
        email: 'testuser@example.com',
        password: 'password123',
      });

      // Generate reset password token
      const resetToken = user.generateResetPasswordToken();
      await user.save();

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          resetToken,
          newPassword: 'newpassword123',
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Password reset successful');
    });

    it('should return error if token is invalid or expired', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          resetToken: 'invalid-token',
          newPassword: 'newpassword123',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid or expired token');
    });
  });

  // Test the logout endpoint
  describe('POST /api/auth/logout', () => {
    it('should log out successfully', async () => {
      const response = await request(app).post('/api/auth/logout');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Logged out successfully');
    });
  });
});
