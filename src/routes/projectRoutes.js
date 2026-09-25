const { Router } = require('express');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
} = require('../controllers/projectController');

const router = Router();

/**
 * Project Routes
 *
 * All routes require authentication (requireAuth middleware).
 * Role checks are applied per-endpoint via requireRole.
 */

// Create a new project — any authenticated user can create one and
// becomes its first admin automatically.
router.post('/', requireAuth, createProject);

// List all projects the authenticated user has access to (active or invited).
router.get('/', requireAuth, listProjects);

// Get one project — requires active membership with any role.
// Special case: if membership is 'invited', viewing activates it.
router.get('/:id', requireAuth, requireRole('admin', 'organizer', 'member'), getProject);

// Update project settings — admins only.
router.put('/:id', requireAuth, requireRole('admin'), updateProject);

// Soft-delete a project — admins only.
router.delete('/:id', requireAuth, requireRole('admin'), deleteProject);

module.exports = router;
