const authRoutes = require('./auth.routes')

module.exports = (app) => {
    app.use('/api/auth', authRoutes)
}