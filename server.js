const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const morgan = require('morgan');
const cors = require('cors');
const errorHandler = require('./utils/errorHandler');

dotenv.config();
connectDB();

const app = express();
app.use(express.json());
app.use(morgan("dev"));
app.use(cors());

// Error Handling Middleware
app.use(errorHandler);

// Routes
require('./routes/api/index.routes')(app);

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
