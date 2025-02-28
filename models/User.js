const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

bcrypt.setRandomFallback(require("crypto").randomBytes);

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: [true, "Password is required"],
    minlength: [6, "Password must be at least 6 characters"],
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  transferLimits: {
    min: { type: Number, default: 100 },
    max: { type: Number, default: 50000 } 
  }
});

// Hash the password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to check if password matches
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate reset password token and set expiration time
userSchema.methods.generateResetPasswordToken = function () {
  // Generate a 5-digit reset token (between 10000 and 99999)
  const resetToken = Math.floor(10000 + Math.random() * 90000).toString();

  // Set reset password token to user
  this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes expiration

  return resetToken;
};

module.exports = mongoose.model('User', userSchema);
