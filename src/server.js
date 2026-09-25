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
// In local development and VS Code web preview, the browser may be served from a
// forwarded remote origin (for example: https://8000-<id>.app.github.dev), so we
// allow those origins too instead of forcing localhost only.
app.use(
  cors({
    origin: (origin, callback) => {
      if (process.env.NODE_ENV === 'production') {
        const allowedOrigins = [process.env.CLIENT_ORIGIN].filter(Boolean);

        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error('Not allowed by CORS'));
        return;
      }

      // Allow localhost, loopback, and forwarded web-preview origins during development.
      if (!origin || /localhost|127\.0\.0\.1|\.github\.dev|\.vscode\.dev|\.app\.github\.dev/.test(origin)) {
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

// Apply rate limiting globally broad protection against DoS and scraping
app.use(generalLimiter);

// Routes
// Health check
app.get('/health', (_req, res) => {
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

/**
 * Express calls this when next(err) is invoked or a middleware throws.
 * It normalizes every error into the project's standard JSON shape:
 *   { "error": { "code": "...", "message": "..." } }
 
 * Mongoose validation errors get special treatment so the client receives a useful message
 */
app.use((err, _req, res, _next) => {
  //  Mongoose validation error 
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
  // If the thrower set a statusCode, use it otherwise default to 500.
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

// Connect to MongoDB first, then start listening
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`TaskFlow API running on port ${PORT}`);
  });
});

// Export for testing (supertest can import the app without calling listen).
module.exports = app;
