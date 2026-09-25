/*
 * Auth Controller (Main Entry Point)
 *
 * This file aggregates all auth-related controllers for cleaner organization.
 * Each controller is now in its own file for better maintainability:
 *   - registerController.js  → POST /auth/register
 *   - loginController.js     → POST /auth/login
 *   - refreshController.js   → POST /auth/refresh
 *   - logoutController.js    → POST /auth/logout
 *   - tokenHelpers.js        → JWT signing & cookie utilities
 *
 */

const { register } = require('./auth/registerController');
const { login } = require('./auth/loginController');
const { refresh } = require('./auth/refreshController');
const { logout } = require('./auth/logoutController');

module.exports = { register, login, refresh, logout };
