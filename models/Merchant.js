const mongoose = require('mongoose');

const merchantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  businessId: {
    type: String,
    required: true,
    unique: true
  },
  qrCode: {
    type: String, // URL or string representation of the QR code
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Merchant', merchantSchema);