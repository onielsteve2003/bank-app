const authRoutes = require('./auth.routes')
const kycRoutes = require('./kyc.routes')
const walletRoutes = require('./wallet.routes');
const paymentRoutes = require('./payment.routes');
const transferRoutes = require('./transfer.routes');
const billRoutes = require('./bill.routes');
const merchantRoutes = require('./merchant.routes');
const qrRoutes = require('./qr.routes');

module.exports = (app) => {
    app.use('/api/auth', authRoutes);
    app.use('/api/kyc', kycRoutes);
    app.use('/api/wallet', walletRoutes);
    app.use('/api/payment', paymentRoutes);
    app.use('/api/transfer', transferRoutes);
    app.use('/api/bills', billRoutes); 
    app.use('/api/merchants', merchantRoutes);
    app.use('/api/qr', qrRoutes);
}