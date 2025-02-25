const mongoose = require('mongoose');

const kycSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    fullName: {
        type: String,
        required: true
    },
    idType: {
        type: String,
        enum: ['National ID', 'Passport', 'Driver License'],
        required: true
    },
    idNumber: {
        type: String,
        required: true,
        unique: true
    },
    documentImage: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['Pending', 'Verified', 'Rejected'],
        default: 'Pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
})

module.exports = mongoose.model('KYC', kycSchema);