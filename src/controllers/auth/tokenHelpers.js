const jwt = require('jsonwebtoken');

/**
 * Token Helper Functions
 *
 * TOKEN STRATEGY — two-token approach:
 *
 *   Access token  (JWT, 15 min, sent in JSON body)
 *     → stored in memory on the client, never in localStorage.
 *     → short lifespan limits the damage if it leaks.
 *
 *   Refresh token (JWT, 7 days, set as httpOnly + Secure + SameSite=Strict cookie)
 *     → httpOnly means JS cannot read it, so XSS attacks can't steal it.
 *     → Secure ensures it is never sent over plain HTTP in production.
 *     → SameSite=Strict blocks it from being sent in cross-site requests,
 *       which defeats the most common CSRF vector.
 *     → Lives in a cookie so the browser sends it automatically to /auth/refresh
 *       without the frontend having to manage it explicitly.
 */

const signAccessToken = (userId) =>
  jwt.sign({ user_id: userId }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: '15m',
  });

const signRefreshToken = (userId) =>
  jwt.sign({ user_id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '7d',
  });

/**
 * Set the refresh token as an httpOnly cookie.
 * Called on login and on every token rotation.
 */
const setRefreshCookie = (res, token) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  });
};

module.exports = { signAccessToken, signRefreshToken, setRefreshCookie };
