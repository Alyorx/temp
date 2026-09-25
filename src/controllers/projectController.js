const Project = require('../models/Project');
const ProjectMembership = require('../models/ProjectMembership');
const Task = require('../models/Task');

/**
 * Project Controller
 * Handles project CRUD operations
 */


 // POST /projects.
 
const createProject = async (req, res, next) => {
  try {
    const { name, description, member_limit } = req.body;

    if (!name) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Project name is required',
        },
      });
    }

    // Create the project document.
    const project = new Project({
      name,
      description: description || '',
      member_limit: member_limit || 20,
      created_by: req.userId,
    });

    await project.save();

    
    const membership = new ProjectMembership({
      project_id: project._id,
      user_id: req.userId,
      role: 'admin',
      status: 'active',
      joined_at: new Date(),
      invited_by: null, 
    });

    await membership.save();

    res.status(201).json({ project });
  } catch (err) {
    next(err);
  }
};


 // GET /projects
 

const listProjects = async (req, res, next) => {
  try {
    
    let memberships = await ProjectMembership.find({
      user_id: req.userId,
    }).select('project_id role status');

    memberships = memberships.filter(
      membership =>
        membership.status === 'active' ||
        membership.status === 'invited'
    );

    const projectIds = [];
    for (const m of memberships) {
      projectIds.push(m.project_id);
    }

    // Fetch the projects
    const projects = await Project.find({
      _id: { $in: projectIds },
      deleted_at: null,
    }).sort({ updated_at: -1 });

    // Attach the user's role to each project for frontend display.
    const projectsWithRole = [];

    for (const project of projects) {
      for (const membership of memberships) {
        if (membership.project_id.toString() === project._id.toString()) {
          const [taskCount, memberCount] = await Promise.all([
            Task.countDocuments({ project_id: project._id }),
            ProjectMembership.countDocuments({
              project_id: project._id,
              status: { $in: ['active', 'invited'] },
            }),
          ]);

          projectsWithRole.push({
            id: project._id,
            name: project.name,
            description: project.description,
            created_by: project.created_by,
            member_limit: project.member_limit,
            role: membership.role,
            status: membership.status,
            taskCount,
            memberCount,
          });
          break;
        }
      }
    }

    // Fetch current user info for the frontend header
    const User = require('../models/User');
    const currentUser = await User.findById(req.userId).select('name email');

    res.json({
      projects: projectsWithRole,
      currentUser: currentUser ? { name: currentUser.name, email: currentUser.email } : null
    });
  } catch (err) {
    next(err);
  }
};


// GET /projects/:id

const getProject = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const User = require('../models/User');

    // Find the project
    const project = await Project.findOne({
      _id: projectId,
      deleted_at: null,
    });

    if (!project) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Project not found',
        },
      });
    }

    // Fetch all members of this project
    const memberships = await ProjectMembership.find({
      project_id: projectId,
      status: { $in: ['invited', 'active'] },
    }).populate('user_id', 'name email');

    const members = memberships.map(m => ({
      userId: m.user_id._id.toString(),
      name: m.user_id.name,
      email: m.user_id.email,
      role: m.role,
      status: m.status
    }));

    // Fetch all tasks for this project
    const tasks = await Task.find({
      project_id: projectId
    }).populate('assignee_ids', 'name').sort({ due_date: 1 });

    const tasksFormatted = tasks.map(t => ({
      id: t._id.toString(),
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      assigneeId: t.assignee_ids[0]?._id.toString(),
      assigneeName: t.assignee_ids.map(a => a.name).join(', '),
      code: `TF-${t._id.toString().slice(-4).toUpperCase()}`,
      due_date: t.due_date
    }));

    // Get current user info
    const currentUser = await User.findById(req.userId).select('name email');

    // Return project with embedded role, members, and tasks
    res.json({
      project: {
        id: project._id.toString(),
        name: project.name,
        description: project.description,
        role: req.projectRole,
        status: req.membership.status,
        members: members,
        tasks: tasksFormatted,
        taskCount: tasksFormatted.length,
        memberCount: members.length
      },
      currentUser: currentUser ? { name: currentUser.name, email: currentUser.email } : null
    });
  } catch (err) {
    next(err);
  }
};

// PUT /projects/:id

const updateProject = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const { name, description, member_limit } = req.body;

    const project = await Project.findOne({
      _id: projectId,
      deleted_at: null,
    });

    if (!project) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Project not found',
        },
      });
    }

    // Update only the fields that were provided.
    if (name !== undefined) project.name = name;
    if (description !== undefined) project.description = description;
    if (member_limit !== undefined) project.member_limit = member_limit;

    await project.save();

    res.json({ project });
  } catch (err) {
    next(err);
  }
};


 // DELETE /projects/:id
 
const deleteProject = async (req, res, next) => {
  try {
    const projectId = req.params.id;

    const project = await Project.findOne({
      _id: projectId,
      deleted_at: null,
    });

    if (!project) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Project not found',
        },
      });
    }

    // Soft delete: set the timestamp.
    project.deleted_at = new Date();
    await project.save();

    res.json({ message: 'Project deleted successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
};
