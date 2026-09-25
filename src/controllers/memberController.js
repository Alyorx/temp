const ProjectMembership = require('../models/ProjectMembership');
const Project = require('../models/Project');
const User = require('../models/User');
const Task = require('../models/Task');
const { sendExistingUserInvite, sendSignupInvite } = require('../services/emailService');


 // Handles project membership management
 

/*
 * GET /projects/:id/members
 * Lists all members with their role, status, and when they joined.
 */
const listMembers = async (req, res, next) => {
  try {
    const projectId = req.params.id;

    // Find all memberships for this project
    const memberships = await ProjectMembership.find({
      project_id: projectId,
      status: { $in: ['invited', 'active'] },
    })
      .populate('user_id', 'name email')
      .populate('invited_by', 'name')
      .sort({ created_at: -1 });

    const members = memberships.map((m) => ({
      userId: m.user_id._id,
      name: m.user_id.name,
      email: m.user_id.email,
      role: m.role,
      status: m.status,
      joinedAt: m.joined_at,
      invitedBy: m.invited_by ? m.invited_by.name : null,
    }));

    res.json({ members });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /projects/:id/members
 * 
 * Invites a user by email. If member_limit is reached → 409.
 * If the email belongs to an existing User → create ProjectMembership with
 * status 'invited' and send an email. If no account exists → send a
 * signup-invite email (when they register, the frontend will create their
 * membership).
 */
const inviteMember = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!email) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email is required',
        },
      });
    }

    // Find the project to check member_limit.
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

    // Count current members (invited + active, excluding removed).
    const currentMemberCount = await ProjectMembership.countDocuments({
      project_id: projectId,
      status: { $in: ['invited', 'active'] },
    });

    if (currentMemberCount >= project.member_limit) {
      return res.status(409).json({
        error: {
          code: 'MEMBER_LIMIT_REACHED',
          message: `This project has reached its member limit of ${project.member_limit}`,
        },
      });
    }

    // Check if a user with this email exists.
    const invitedUser = await User.findOne({ email });

    // Get inviter's name for the email.
    const inviter = await User.findById(req.userId).select('name');

    if (invitedUser) {
      // User exists — check if they're already a member.
      const existingMembership = await ProjectMembership.findOne({
        project_id: projectId,
        user_id: invitedUser._id,
      });

      if (existingMembership && existingMembership.status !== 'removed') {
        if (existingMembership.status === 'invited') {
          await sendExistingUserInvite({
            toEmail: invitedUser.email,
            projectName: project.name,
            projectId: project._id.toString(),
            inviterName: inviter.name,
          });

          return res.status(200).json({
            code: 'INVITE_RESENT',
            message: 'A fresh invitation link was sent to this user',
            invitedUser: {
              name: invitedUser.name,
              email: invitedUser.email,
            },
          });
        }

        return res.status(409).json({
          error: {
            code: 'ALREADY_MEMBER',
            message: 'This user is already an active member of the project',
          },
        });
      }

      // If they were removed, reactivate the membership.
      if (existingMembership && existingMembership.status === 'removed') {
        existingMembership.status = 'invited';
        existingMembership.role = 'member';
        existingMembership.invited_by = req.userId;
        existingMembership.joined_at = null;
        await existingMembership.save();
      } else {
        // Create a new membership with status 'invited'.
        const membership = new ProjectMembership({
          project_id: projectId,
          user_id: invitedUser._id,
          role: 'member', 
          status: 'invited',
          invited_by: req.userId,
        });
        await membership.save();
      }

      // Send an email to the existing user.
      await sendExistingUserInvite({
        toEmail: email,
        projectName: project.name,
        projectId: project._id.toString(),
        inviterName: inviter.name,
      });

      res.status(201).json({
        message: 'Invitation sent to existing user',
        invitedUser: {
          name: invitedUser.name,
          email: invitedUser.email,
        },
      });
    } else {
      await sendSignupInvite({
        toEmail: email,
        projectName: project.name,
        projectId: project._id.toString(),
        inviterName: inviter.name,
      });

      res.status(201).json({
        message: 'Signup invite sent. Membership will be created when they register.',
        invitedUser: { email },
      });
    }
  } catch (err) {
    next(err);
  }
};

// POST /projects/:id/members/invitation/accept
const acceptInvitation = async (req, res, next) => {
  try {
    const membership = await ProjectMembership.findOne({
      project_id: req.params.id,
      user_id: req.userId,
      status: 'invited',
    });

    if (!membership) {
      return res.status(404).json({
        error: { code: 'INVITE_NOT_FOUND', message: 'No pending invitation found' },
      });
    }

    membership.status = 'active';
    membership.joined_at = new Date();
    await membership.save();

    res.json({ message: 'Project invitation accepted' });
  } catch (err) {
    next(err);
  }
};

// DELETE /projects/:id/members/invitation
const declineInvitation = async (req, res, next) => {
  try {
    const membership = await ProjectMembership.findOne({
      project_id: req.params.id,
      user_id: req.userId,
      status: 'invited',
    });

    if (!membership) {
      return res.status(404).json({
        error: { code: 'INVITE_NOT_FOUND', message: 'No pending invitation found' },
      });
    }

    membership.status = 'removed';
    await membership.save();

    res.json({ message: 'Project invitation declined' });
  } catch (err) {
    next(err);
  }
};


// PATCH /projects/:id/members/:userId

const updateMemberRole = async (req, res, next) => {
  try {
    const { id: projectId, userId: targetUserId } = req.params;
    const { role } = req.body;

    if (!role || !['admin', 'organizer', 'member'].includes(role)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Valid role is required (admin, organizer, or member)',
        },
      });
    }

    const membership = await ProjectMembership.findOne({
      project_id: projectId,
      user_id: targetUserId,
    });

    if (!membership || membership.status === 'removed') {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Member not found',
        },
      });
    }

    // If demoting an admin, check if they're the last one.
    if (membership.role === 'admin' && role !== 'admin') {
      const adminCount = await ProjectMembership.countDocuments({
        project_id: projectId,
        role: 'admin',
        status: 'active',
      });

      if (adminCount <= 1) {
        return res.status(409).json({
          error: {
            code: 'SOLE_ADMIN',
            message: 'Cannot demote the last admin. Promote someone else first.',
          },
        });
      }
    }

    membership.role = role;
    await membership.save();

    res.json({ message: 'Member role updated successfully', membership });
  } catch (err) {
    next(err);
  }
};


//  DELETE /projects/:id/members/:userId
const removeMember = async (req, res, next) => {
  try {
    const { id: projectId, userId: targetUserId } = req.params;

    const membership = await ProjectMembership.findOne({
      project_id: projectId,
      user_id: targetUserId,
    });

    if (!membership || membership.status === 'removed') {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Member not found',
        },
      });
    }

    // Organizers cannot remove admins or other organizers
    if (req.projectRole === 'organizer' && membership.role !== 'member') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Organizers can only remove members, not admins or organizers',
        },
      });
    }

    // If removing an admin, check if they're the last one.
    if (membership.role === 'admin') {
      const adminCount = await ProjectMembership.countDocuments({
        project_id: projectId,
        role: 'admin',
        status: 'active',
      });

      if (adminCount <= 1) {
        return res.status(409).json({
          error: {
            code: 'SOLE_ADMIN',
            message: 'Cannot remove the last admin',
          },
        });
      }
    }

    // Remove the member from any tasks they're assigned to.
    const tasks = await Task.find({
      project_id: projectId,
      assignee_ids: targetUserId
    });

    for (const task of tasks) {
      task.assignee_ids = task.assignee_ids.filter(
        id => id.toString() !== targetUserId.toString()
      );
      await task.save();
    }

    // Mark the membership as removed instead of deleting it.
    // This preserves the audit trail.
    membership.status = 'removed';
    await membership.save();

    res.json({ message: 'Member removed successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listMembers,
  inviteMember,
  acceptInvitation,
  declineInvitation,
  updateMemberRole,
  removeMember,
};
