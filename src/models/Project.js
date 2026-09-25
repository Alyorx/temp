const mongoose = require('mongoose');

/**
 * Project Model
 *
 * A project is the top-level container that groups tasks and members.
 * Deleting a project is a soft operation so it can be recovered.
 */
const projectSchema = new mongoose.Schema({
    // Displayed in the sidebar, breadcrumbs, and page title
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      minlength: [1, 'Project name cannot be empty'],
      maxlength: [100, 'Project name cannot exceed 100 characters'],
    },

    // Optional longer explanation visible on the project overview page
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },

    // The user who created the project
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Project must have a creator'],
    },

    member_limit: {
      type: Number,
      default: 20,
      min: [1, 'Member limit must be at least 1'],
      max: [100, 'Member limit cannot exceed 100'],
    },

    // Soft-delete timestamp. When set, the project is treated as deleted everywhere
    deleted_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

/**
 * most queries should exclude soft-deleted projects.
 * Usage: Project.find().notDeleted()
 * Don't forget to use meeeeeeeeeeeee
 */
projectSchema.query.notDeleted = function () {
  return this.where({ deleted_at: null });
};

module.exports = mongoose.model('Project', projectSchema);
