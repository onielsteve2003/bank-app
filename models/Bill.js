const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: String,
    enum: ['Electricity', 'Water', 'Internet', 'Cable TV', 'Phone', 'Other'],
    required: true
  },
  provider: {
    type: String,
    required: true
  },
  billReference: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  reference: {
    type: String,
    default: () => `BILL_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  }
});

module.exports = mongoose.model('Bill', billSchema);