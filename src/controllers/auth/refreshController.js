const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const { signAccessToken, signRefreshToken, setRefreshCookie } = require('./tokenHelpers');

/**
 * Refresh Token Controller
 *
 * Verify the refresh cookie and rotate both tokens.
 * Token rotation means every refresh invalidates the previous refresh token —
 * if an attacker stole the old cookie, it's already dead by the time they
 * try to use it (assuming the legitimate user refreshed first).
 */

/**
 * POST /auth/refresh
 *
 * Verify the refresh cookie and rotate both tokens.
 */
const refresh = async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;

    if (!token) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'No refresh token provided',
        },
      });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Refresh token is invalid or expired',
        },
      });
    }

    // Confirm the user still exists (they might have been deleted).
    const user = await User.findById(payload.user_id);
    if (!user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'User no longer exists',
        },
      });
    }

    // Issue fresh tokens — rotation.
    const newAccessToken = signAccessToken(user._id);
    const newRefreshToken = signRefreshToken(user._id);

    setRefreshCookie(res, newRefreshToken);

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    next(err);
  }
};

module.exports = { refresh };
