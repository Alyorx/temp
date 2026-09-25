const jwt = require('jsonwebtoken');

/**
 * requireAuth Middleware

 * ACCESS TOKEN DESIGN:
 * - Short-lived (15 min) 
 * - Sent in the Authorization header 
 * - Payload contains only { user_id, iat, exp }
 */

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'No access token provided',
      },
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    // Attach just the user_id downstream middleware and controllers
    req.userId = payload.user_id;
    next();
  } catch (err) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Access token is invalid or expired',
      },
    });
  }
};

module.exports = requireAuth;
