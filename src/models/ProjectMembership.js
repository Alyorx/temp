const mongoose = require('mongoose');

/**
 * ProjectMembership Model
 *
 * This is WHERE role lives 
 * role is scoped per-membership, not per-user to handel the edge case (A person can be an admin on Project A and a plain member on Project B)
 * thierfor the JWT never carries a role
 */
const membershipSchema = new mongoose.Schema({
    // Which project this membership belongs to.
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project reference is required'],
    },

    // Which user holds this membership.
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
    },

    /**
     * Per-project role.
     *
     * admin        full control, including soft-deleting the project.
                    Cannot be removed if he is the last admin (409) edge case
     * organizer    can manage members and tasks  
                    cannot delete the project or manage admins/organizers
     * member       read-only except they can change the STATUS field
                    of tasks assigned to them
     */
    role: {
      type: String,
      required: [true, 'Role is required'],
      enum: {
        values: ['admin', 'organizer', 'member'],
        message: '{VALUE} is not a valid role. Must be admin, organizer, or member',
      },
    },

    // null for the project creator
    invited_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    /**
     * Membership lifecycle status.
     *
     * invited   the user has been added but hasn't accepted yet.
     * active    the user has accepted and can interact with the project.
     * removed   the membership was revoked
     */
    // Default is 'invited' — a user must explicitly accept before they
    // can interact with the project. Only the project creator is
    // auto-set to 'active' at creation time (handled in the controller).
    status: {
      type: String,
      required: [true, 'Membership status is required'],
      enum: {
        values: ['invited', 'active', 'removed'],
        message: '{VALUE} is not a valid status. Must be invited, active, or removed',
      },
      default: 'invited',
    },

    // When the user accepted the invitation (or was auto-added).
    joined_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
  }
);

// optimizer for searching for project_id then a specific user_id
membershipSchema.index({ project_id: 1, user_id: 1 }, { unique: true });

// optimizer for searching for user_id then a specific project_id
membershipSchema.index({ user_id: 1, project_id: 1 });

module.exports = mongoose.model('ProjectMembership', membershipSchema);
