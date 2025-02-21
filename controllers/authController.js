const User = require('../models/User');
const { generateToken } = require('../utils/jwtUtils');
const { sendMail } = require('../utils/sendEmail');
const dotenv = require('dotenv');
const crypto = require('crypto');

dotenv.config();

// Register user
const registerUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create a new user
    const user = await User.create({ email, password });

    if (user) {
      res.status(201).json({
        _id: user._id,
        email: user.email,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Login user
const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials - User not found' });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials - Incorrect password' });
    }

    // Generate JWT token
    const token = generateToken(user._id);
    return res.status(200).json({ token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Forgot password
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    // Generate reset password token and set expiration time
    const resetToken = user.generateResetPasswordToken();
    await user.save();

    // Construct the password reset URL
    const resetUrl = `http://localhost:5000/api/auth/reset-password/${resetToken}`;

    // Prepare the email content
    const htmlContent = `
      <h1>Password Reset Request</h1>
      <p>Click <a href="${resetUrl}">here</a> to reset your password.</p>
      <p>This link will expire in 10 minutes.</p>
    `;

    // Send reset password email using the sendMail function
    await sendMail({
      from: process.env.EMAIL_DEFAULT_FROM,
      to: email,
      subject: "Password Reset Request",
      html: htmlContent,
    });

    res.status(200).json({ message: 'Password reset email sent successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Reset password
const resetPassword = async (req, res) => {
  const { resetToken, newPassword } = req.body;

  try {
    // Hash the resetToken from the request to compare with stored token
    const hashedResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    
    // Log the hashed reset token for debugging
    console.log('Hashed Reset Token:', hashedResetToken);
    
    // Find the user by the hashed reset token
    const user = await User.findOne({ resetPasswordToken: hashedResetToken });

    if (!user || user.resetPasswordExpire < Date.now()) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    // Update password and clear reset token
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();  // Ensure the user is saved after updating

    res.status(200).json({ message: 'Password reset successful' });
  } catch (err) {
    console.error(err);  // Log the error for debugging
    res.status(500).json({ message: 'Server error' });
  }
};

// Logout user
const logoutUser = (req, res) => {
  res.status(200).json({ message: 'Logged out successfully' });
};

module.exports = { registerUser, loginUser, forgotPassword, resetPassword, logoutUser };
