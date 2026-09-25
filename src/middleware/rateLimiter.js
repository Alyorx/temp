const rateLimit = require('express-rate-limit');

/*
 * Rate Limiting Middleware
 *
 * Two limiters with different budgets:
 *   - generalLimiter  : protection on every route
 *   - strictLimiter   : on auth endpoints 
 */

/**
 * General limiter applied globally in server.js.
 * 100 req/min 
 */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute window
  max: 100,              // 100 requests per window per IP

  // Standard Retry-After header tells the client exactly when to retry.
  standardHeaders: true,
  legacyHeaders: false,

  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please slow down.',
      },
    });
  },
});


 // Strict limiter applied to POST /auth/login and POST /auth/register, invite-member
 
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minute window
  max: 10,                   // 10 attempts per window per IP

  standardHeaders: true,
  legacyHeaders: false,

  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many attempts. Please wait 15 minutes before trying again.',
      },
    });
  },
});

module.exports = { generalLimiter, strictLimiter };
