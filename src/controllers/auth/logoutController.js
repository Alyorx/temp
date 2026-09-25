/**
 * Logout Controller
 *
 * Clear the refresh cookie. The access token can't be server-side
 * revoked (it's stateless), so the client is responsible for dropping
 * it from memory. The cookie clearing is what actually ends the session
 * on the server's side.
 */

/**
 * POST /auth/logout
 *
 * Clear the refresh cookie.
 */
const logout = (_req, res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });

  res.json({ message: 'Logged out successfully' });
};

module.exports = { logout };
