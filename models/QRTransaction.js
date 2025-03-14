const mongoose = require('mongoose');

const qrTransactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['generate', 'scan'],
    required: true
  },
  qrCode: {
    type: String, // URL or string representation of the QR code (for generated QR codes)
    required: function () { return this.type === 'generate'; }
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function () { return this.type === 'scan'; }
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  reference: {
    type: String,
    default: () => `QR_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  }
});

module.exports = mongoose.model('QRTransaction', qrTransactionSchema);