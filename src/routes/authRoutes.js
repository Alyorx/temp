const { Router } = require('express');
const { register, login, refresh, logout } = require('../controllers/authController');
const { strictLimiter } = require('../middleware/rateLimiter');

const router = Router();


// Auth Routes


// Account creation — rate-limited to prevent bulk fake-account creation.
router.post('/register', strictLimiter, register);

// Credential verification — same strict limit to slow password guessing.
router.post('/login', strictLimiter, login);

// Silently rotate tokens using the httpOnly refresh cookie.
router.post('/refresh', refresh);

// Clear the refresh cookie; client drops the access token from memory.
router.post('/logout', logout);

module.exports = router;
