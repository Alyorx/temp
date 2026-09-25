const { Router } = require('express');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { strictLimiter } = require('../middleware/rateLimiter');
const {
  listMembers,
  inviteMember,
  acceptInvitation,
  declineInvitation,
  updateMemberRole,
  removeMember,
} = require('../controllers/memberController');

const router = Router({ mergeParams: true });

/**
 * Member Routes
 *
 * All routes require authentication and project membership.
 * Role checks are enforced per-endpoint via requireRole.
 *
 * These routes are mounted at /api/projects/:id/members in server.js,
 * so :id comes from the parent router (projectRoutes).
 */

// List all members in the project any active member can see the roster.
router.get('/', requireAuth, requireRole('admin', 'organizer', 'member'), listMembers);

// Invite a new member by email — admins and organizers can invite.
// Apply the strict rate limiter to slow invite-spam attacks.
router.post('/', requireAuth, requireRole('admin', 'organizer'), strictLimiter, inviteMember);

// Pending invitees must explicitly accept or decline their invitation.
router.post('/invitation/accept', requireAuth, acceptInvitation);
router.delete('/invitation', requireAuth, declineInvitation);

// Update a member's role — admins only.
router.patch('/:userId', requireAuth, requireRole('admin'), updateMemberRole);

// Remove a member — admins and organizers, but organizers cannot remove
// admins or other organizers (enforced in the controller).
router.delete('/:userId', requireAuth, requireRole('admin', 'organizer'), removeMember);

module.exports = router;
