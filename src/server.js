require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const connectDB = require('./config/db');
const { generalLimiter } = require('./middleware/rateLimiter');
const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');
const memberRoutes = require('./routes/memberRoutes');
const taskRoutes = require('./routes/taskRoutes');

// App setup
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware 

// Parse JSON 
app.use(express.json());

// Parse cookies
app.use(cookieParser());

// CORS with credentials so the browser can send cookies.
app.use(
  cors({
    origin: (origin, callback) => {
      if (process.env.NODE_ENV === 'production') {
        const allowedOrigins = [process.env.CLIENT_ORIGIN].filter(Boolean);

        if (!origin || allowedOrigins.includes(origin) || /\.vercel\.app$/.test(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error('Not allowed by CORS'));
        return;
      }

      // Allow localhost, loopback, Vercel preview, and forwarded web-preview origins during development.
      if (!origin || /localhost|127\.0\.0\.1|\.github\.dev|\.vscode\.dev|\.app\.github\.dev|\.vercel\.app/.test(origin)) {
        callback(null, true);
        return;
      }

      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
  })
);

// Ensure DB connection for incoming requests (vital for Serverless environments like Vercel)
app.use(async (_req, _res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

// Apply rate limiting globally broad protection against DoS and scraping
app.use(generalLimiter);

// Routes
// Health check
app.get(['/health', '/api/health'], (_req, res) => {
  res.json({ status: 'ok' });
});

// Mount auth routes register, login, refresh, logout.
app.use('/api/auth', authRoutes);

// Mount project routes create, list, get, update, delete projects.
app.use('/api/projects', projectRoutes);

// Mount member routes add, remove, list members of a project.
app.use('/api/projects/:id/members', memberRoutes);

// Mount task routes — the core feature of TaskFlow.
app.use('/api/projects/:id/tasks', taskRoutes);

// 404 
app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource does not exist',
    },
  });
});

// Centralized error handler
app.use((err, _req, res, _next) => {
  // Mongoose validation error 
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: messages.join('. '),
      },
    });
  }

  // Duplicate key 
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json({
      error: {
        code: 'DUPLICATE',
        message: `A record with that ${field} already exists`,
      },
    });
  }

  // Mongoose bad ObjectId 
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    return res.status(400).json({
      error: {
        code: 'INVALID_ID',
        message: 'The provided ID is not a valid format',
      },
    });
  }

  // Everything else 
  const statusCode = err.statusCode || 500;
  const code = err.errorCode || 'INTERNAL_ERROR';
  const message =
    process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message || 'An unexpected error occurred';

  // Log the full error server-side for debugging.
  console.error(`[${code}]`, err);

  res.status(statusCode).json({
    error: { code, message },
  });
});

// Starter 
// Only call listen if run directly via CLI (e.g., node src/server.js)
if (require.main === module) {
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`TaskFlow API running on port ${PORT}`);
    });
  });
}

// Export for Vercel / serverless / testing
module.exports = app;
