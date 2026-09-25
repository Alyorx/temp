const mongoose = require('mongoose');

/**
 * Task Model
 * The core object of the entire app everything else exists to organize and gate access to tasks. 
 * Every task belongs to exactly one project and must have an assignee.
 */
const taskSchema = new mongoose.Schema({
    // The project this task belongs to.
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Task must belong to a project'],
    },

    // Short summary displayed in list views and board columns
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
      minlength: [1, 'Task title cannot be empty'],
      maxlength: [200, 'Task title cannot exceed 200 characters'],
    },

    // Longer details visible in the task detail view
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
      default: '',
    },

    /**
     * Workflow status drives board-column placement.
     *
     * todo         not started
     * in_progress  actively being worked on
     * blocked      waiting on something external
     * done         completed
     *
     * (role: "member") can only change THIS field, and only
     * on tasks assigned to them. That constraint is enforced in the controller
     */
    status: {
      type: String,
      required: [true, 'Task status is required'],
      enum: {
        values: ['todo', 'in_progress', 'blocked', 'done'],
        message: '{VALUE} is not a valid status. Must be todo, in_progress, blocked, or done',
      },
      default: 'todo',
    },

    
    priority: {
      type: String,
      required: [true, 'Task priority is required'],
      enum: {
        values: ['low', 'medium', 'high'],
        message: '{VALUE} is not a valid priority. Must be low, medium, or high',
      },
      default: 'medium',
    },
    // Array of assignees a task can be shared between multiple people.
    // A task may be intentionally left unassigned, so an empty array is valid.
    assignee_ids: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
      ],
      default: [],
    },

    // organizer or admin can create tasks for other people
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Task must have a creator'],
    },

    // Required deadline — stored as a full Date (includes time) so the
    // frontend can display both date and time and sort precisely.
    due_date: {
      type: Date,
      required: [true, 'Task must have a due date and time'],
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

module.exports = mongoose.model('Task', taskSchema);
