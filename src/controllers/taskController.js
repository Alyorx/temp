const Task = require('../models/Task');
const Project = require('../models/Project');
const ProjectMembership = require('../models/ProjectMembership');

/**
 * Task Controller
 *
 * This is the core feature of TaskFlow — everything else exists to organize
 * and gate access to tasks. The permission model here is critical:
 * - admin/organizer can do anything with any task
 * - member can ONLY change the status field of their own assigned tasks
 */


// POST /projects/:id/tasks
// TODO : we now accept to have no assigned member to a task, so we need to update the validation logic accordingly.
const createTask = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const { title, description, status, priority, assignee_ids, due_date } = req.body;

    // Validate required fields
    if (!title) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Task title is required',
        },
      });
    }

    const normalizedAssignees = Array.isArray(assignee_ids) ? assignee_ids : [];

    if (!due_date) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Due date is required',
        },
      });
    }

    // Validate that all assignees are ACTIVE members of this project.
    for (const assigneeId of normalizedAssignees) {
      const membership = await ProjectMembership.findOne({
        project_id: projectId,
        user_id: assigneeId,
        status: 'active',
      });

      if (!membership) {
        return res.status(400).json({
          error: {
            code: 'INVALID_ASSIGNEE',
            message: `User ${assigneeId} is not an active member of this project`,
          },
        });
      }
    }

    const task = new Task({
      project_id: projectId,
      title,
      description: description || '',
      status: status || 'todo',
      priority: priority || 'medium',
      assignee_ids: normalizedAssignees,
      created_by: req.userId,
      due_date,
    });

    await task.save();

    res.status(201).json({ task });
  } catch (err) {
    next(err);
  }
};


 // GET /projects/:id/tasks
 
const listTasks = async (req, res, next) => {
  try {
    const projectId = req.params.id;

    const tasks = await Task.find({ project_id: projectId })
      .populate('assignee_ids', 'name email')
      .populate('created_by', 'name')
      .sort({ due_date: 1, created_at: -1 });

    res.json({ tasks });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /projects/:id/tasks/:taskId
 * WHO: admin, organizer, or member
 * WHY: same as list — anyone in the project can view any task
 */
const getTask = async (req, res, next) => {
  try {
    const { id: projectId, taskId } = req.params;

    const task = await Task.findOne({
      _id: taskId,
      project_id: projectId,
    })
      .populate('assignee_ids', 'name email')
      .populate('created_by', 'name');

    if (!task) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Task not found',
        },
      });
    }

    const project = await Project.findById(projectId).select('name');
    const membership = await ProjectMembership.findOne({
      project_id: projectId,
      user_id: req.userId,
    });
    const User = require('../models/User');
    const currentUser = await User.findById(req.userId).select('name email');

    const members = await ProjectMembership.find({
      project_id: projectId,
      status: { $in: ['invited', 'active'] },
    }).populate('user_id', 'name email role');

    const formattedTask = {
      id: task._id.toString(),
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assigneeId: task.assignee_ids[0]?._id.toString() || '',
      assigneeName: task.assignee_ids.map((a) => a.name).join(', ') || 'Unassigned',
      projectId: projectId,
      projectName: project?.name || 'Project',
      code: `TF-${task._id.toString().slice(-4).toUpperCase()}`,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      viewerRole: membership?.role || 'member',
      createdBy: task.created_by ? { id: task.created_by._id.toString(), name: task.created_by.name } : null,
      due_date: task.due_date,
    };

    res.json({
      task: formattedTask,
      members: members.map((m) => ({
        userId: m.user_id._id.toString(),
        name: m.user_id.name,
        email: m.user_id.email,
        role: m.role,
        status: m.status,
      })),
      currentUser: currentUser ? { id: currentUser._id.toString(), name: currentUser.name, email: currentUser.email } : null,
      viewerRole: membership?.role || 'member',
      viewer: currentUser ? { id: currentUser._id.toString(), name: currentUser.name } : null,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /projects/:id/tasks/:taskId
 * WHO: admin or organizer
 * WHY: only admins and organizers can edit tasks (including reassigning)
 *
 * Can edit any field. If assignee_ids changes, re-validate that all new
 * assignees are active members.
 */
const updateTask = async (req, res, next) => {
  try {
    const { id: projectId, taskId } = req.params;
    const { title, description, status, priority, assignee_ids, due_date } = req.body;

    const task = await Task.findOne({
      _id: taskId,
      project_id: projectId,
    });

    if (!task) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Task not found',
        },
      });
    }

    // If assignee_ids is being changed, validate all new assignees.
    if (assignee_ids !== undefined) {
      const normalizedAssignees = Array.isArray(assignee_ids) ? assignee_ids : [];

      for (const assigneeId of normalizedAssignees) {
        const membership = await ProjectMembership.findOne({
          project_id: projectId,
          user_id: assigneeId,
          status: 'active',
        });

        if (!membership) {
          return res.status(400).json({
            error: {
              code: 'INVALID_ASSIGNEE',
              message: `User ${assigneeId} is not an active member of this project`,
            },
          });
        }
      }
      task.assignee_ids = normalizedAssignees;
    }

    // Update only the fields that were provided
    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (status !== undefined) task.status = status;
    if (priority !== undefined) task.priority = priority;
    if (due_date !== undefined) task.due_date = due_date;

    await task.save();

    res.json({ task });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /projects/:id/tasks/:taskId
 * WHO: admin or organizer
 * WHY: only admins and organizers can delete tasks
 */
const deleteTask = async (req, res, next) => {
  try {
    const { id: projectId, taskId } = req.params;

    const task = await Task.findOneAndDelete({
      _id: taskId,
      project_id: projectId,
    });

    if (!task) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Task not found',
        },
      });
    }

    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /projects/:id/tasks/:taskId/status
 * WHO: admin, organizer, OR the task's assignee (if they're a member)
 * WHY: this is the ONLY endpoint a plain "member" role can call
 *
 * *** CRITICAL PERMISSION RULE ***
 * This endpoint implements custom authorization because the rule is:
 * - admin/organizer can always call it (any task, any status change)
 * - OR the caller is a member AND the task is assigned to them
 *
 * Additionally, this endpoint may ONLY change the `status` field.
 * If the request body contains ANY other field (title, description,
 * assignee_ids, etc.), respond with 400 — DO NOT silently ignore extra
 * fields. The frontend in Part 5 depends on this being a hard error so
 * it can't accidentally leak permission beyond what a member should have.
 *
 * This is the single most important permission boundary in the entire app.
 */
const updateTaskStatus = async (req, res, next) => {
  try {
    const { id: projectId, taskId } = req.params;
    const { status } = req.body;

    // HARD VALIDATION: this endpoint accepts ONLY a `status` field.
    // If the body contains anything else, reject immediately.
    const allowedFields = ['status'];
    const providedFields = Object.keys(req.body);
    const extraFields = providedFields.filter((f) => !allowedFields.includes(f));

    if (extraFields.length > 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_FIELDS',
          message: `This endpoint only accepts "status". Remove these fields: ${extraFields.join(', ')}`,
        },
      });
    }

    if (!status) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Status is required',
        },
      });
    }

    // Find the task
    const task = await Task.findOne({
      _id: taskId,
      project_id: projectId,
    });

    if (!task) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Task not found',
        },
      });
    }

    // Custom authorization: admin/organizer can always update,
    // OR the caller must be a member who is assigned to this task.
    if (req.projectRole === 'admin' || req.projectRole === 'organizer') {
      // Admin/organizer can always change status
      task.status = status;
      await task.save();
      return res.json({ task });
    }

    // If we reach here, the caller is a "member" — check if they're assigned.
    const isAssignee = task.assignee_ids.some(
      (id) => id.toString() === req.userId.toString()
    );

    if (!isAssignee) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You can only change the status of tasks assigned to you',
        },
      });
    }

    // They're a member assigned to this task — allow the status change.
    task.status = status;
    await task.save();

    res.json({ task });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createTask,
  listTasks,
  getTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
};
