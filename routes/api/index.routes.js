const authRoutes = require('./auth.routes')
const kycRoutes = require('./kyc.routes')

module.exports = (app) => {
    app.use('/api/auth', authRoutes)
    app.use('/api/kyc', kycRoutes);
}