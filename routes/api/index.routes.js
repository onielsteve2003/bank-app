const authRoutes = require('./auth.routes')
const kycRoutes = require('./kyc.routes')
const walletRoutes = require('./wallet.routes');
const paymentRoutes = require('./payment.routes');

module.exports = (app) => {
    app.use('/api/auth', authRoutes);
    app.use('/api/kyc', kycRoutes);
    app.use('/api/wallet', walletRoutes);
    app.use('/api/payment', paymentRoutes);
}