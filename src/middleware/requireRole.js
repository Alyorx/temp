const ProjectMembership = require('../models/ProjectMembership');


// PURPOSE: this middleware proves permission.


const requireRole = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      const projectId = req.params.id;
      const userId = req.userId; 

      // Look up the caller's membership in this project.
      const membership = await ProjectMembership.findOne({
        project_id: projectId,
        user_id: userId,
      });

      // No membership = not a member at all.
      if (!membership) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'You are not a member of this project',
          },
        });
      }

      // Removed members can't do anything, even if their role would allow it.
      if (membership.status === 'removed') {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Your membership has been revoked',
          },
        });
      }

      if (membership.status === 'invited' && req.method !== 'GET') {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'You must accept the project invite first',
          },
        });
      }

      
      if (!allowedRoles.includes(membership.role)) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`,
          },
        });
      }

      req.projectRole = membership.role;
      req.membership = membership; 

      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = requireRole;
