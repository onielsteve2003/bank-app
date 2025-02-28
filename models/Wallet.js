const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  type: { 
    type: String, 
    enum: ['deposit', 'withdrawal'], 
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
    type: String
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

const walletSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    unique: true 
  },
  balance: { 
    type: Number, 
    default: 0,
    min: 0 
  },
  transactions: [transactionSchema]
});

module.exports = mongoose.model('Wallet', walletSchema);