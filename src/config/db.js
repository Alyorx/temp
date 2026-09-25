const mongoose = require('mongoose');

// Database Connection (handles cached connections for Serverless environments like Vercel)
const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) {
    return;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`MongoDB connection error: ${err.message}`);
    throw err;
  }
};

// Logs
mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error(`MongoDB runtime error: ${err.message}`);
});

module.exports = connectDB;
