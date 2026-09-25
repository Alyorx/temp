const { Router } = require('express');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const {
  createTask,
  listTasks,
  getTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
} = require('../controllers/taskController');

const router = Router({ mergeParams: true });

/**
 * Task Routes
 *
 * All routes require authentication and project membership.
 * Nested under /api/projects/:id/tasks in server.js, so :id comes
 * from the parent router (projectRoutes).
 */

// Create a new task — admins and organizers only
router.post('/', requireAuth, requireRole('admin', 'organizer'), createTask);

// List all tasks in the project — any active member can see all tasks
router.get('/', requireAuth, requireRole('admin', 'organizer', 'member'), listTasks);

// Get one task — any active member can view any task
router.get('/:taskId', requireAuth, requireRole('admin', 'organizer', 'member'), getTask);

// Update any field of a task — admins and organizers only
router.put('/:taskId', requireAuth, requireRole('admin', 'organizer'), updateTask);

// Delete a task — admins and organizers only
router.delete('/:taskId', requireAuth, requireRole('admin', 'organizer'), deleteTask);

// Update ONLY the status field — special endpoint with custom auth
// (admins/organizers always, OR members if they're assigned to the task)
router.patch('/:taskId/status', requireAuth, requireRole('admin', 'organizer', 'member'), updateTaskStatus);

module.exports = router;
