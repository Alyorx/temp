const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const Project = require('../../models/Project');
const ProjectMembership = require('../../models/ProjectMembership');
const { signAccessToken, signRefreshToken, setRefreshCookie } = require('./tokenHelpers');

/**
 * Registration Controller
 *
 * Handles new account creation with password hashing delegated to
 * the User model's pre-save hook.
 *
 * PASSWORD RULE:
 *   Minimum 8 characters — Length is the strongest single factor for
 *   password entropy; we rely on bcrypt (cost 12) to make each guess expensive.
 */

const MIN_PASSWORD_LENGTH = 8;

/**
 * POST /auth/register
 *
 * Create a new account. The pre-save hook on User hashes the password,
 * so we store the raw value in password_hash and let Mongoose do the work.
 * Returns 201 with the new user object — password_hash is stripped by
 * the model's toJSON().
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password, inviteProjectId } = req.body;

    // Validate required fields early so we give a clear error before
    // hitting the DB.
    if (!name || !email || !password) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'name, email, and password are required',
        },
      });
    }

    // Minimum 8 characters — see password rule comment at top of file.
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        },
      });
    }

    // Store the raw password in password_hash — the pre-save hook hashes it.
    // This avoids duplicating the bcrypt call here.
    const user = new User({ name, email, password_hash: password });
    await user.save();

    let invitationAttached = false;
    if (inviteProjectId) {
      const project = await Project.findOne({ _id: inviteProjectId, deleted_at: null });
      if (project) {
        await ProjectMembership.create({
          project_id: project._id,
          user_id: user._id,
          role: 'member',
          status: 'invited',
          invited_by: null,
        });
        invitationAttached = true;
      }
    }

    // Generate access and refresh tokens
    const accessToken = signAccessToken(user._id);
    const refreshToken = signRefreshToken(user._id);

    setRefreshCookie(res, refreshToken);

    // 201 Created — toJSON() on the model strips password_hash automatically.
    res.status(201).json({
      accessToken,
      user: user.toJSON(),
      invitationAttached
    });
  } catch (err) {
    next(err); // centralized handler in server.js catches 11000 (duplicate email)
  }
};

module.exports = { register };
