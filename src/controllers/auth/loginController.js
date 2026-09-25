const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const { signAccessToken, signRefreshToken, setRefreshCookie } = require('./tokenHelpers');

/**
 * Login Controller
 *
 * Verify credentials and issue both tokens.
 * We deliberately return the same error message for "no such email" and
 * "wrong password" — distinguishing them would let an attacker enumerate
 * which emails are registered.
 */

/**
 * POST /auth/login
 *
 * Verify credentials and issue both tokens.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'email and password are required',
        },
      });
    }

    // Explicitly select password_hash because the schema hides it by default.
    const user = await User.findOne({ email }).select('+password_hash');

    // Use a constant-time comparison even in the "user not found" branch to
    // avoid timing attacks that could reveal whether an email is registered.
    const passwordMatch = user ? await user.comparePassword(password) : false;

    if (!user || !passwordMatch) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Email or password is incorrect',
        },
      });
    }

    const accessToken = signAccessToken(user._id);
    const refreshToken = signRefreshToken(user._id);

    setRefreshCookie(res, refreshToken);

    // Access token goes in the body; the refresh token is already in the cookie.
    res.json({
      accessToken,
      user: user.toJSON(), // strips password_hash
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { login };
