const nodemailer = require('nodemailer');

/**
 * Email Service
 *
 * Sends invite notifications via SMTP. In development, point this at
 * Mailtrap or a similar testing service. In production, use a real
 * provider (SendGrid, Mailgun, AWS SES, etc.).
 *
 * TODO: Configure SMTP transport with real credentials in production.
 * Set these env vars in .env:
 *   - SMTP_HOST (your SMTP provider hostname)
 *   - SMTP_PORT (587 for TLS, 465 for SSL)
 *   - SMTP_USER (your SMTP username)
 *   - SMTP_PASS (your SMTP password)
 *   - EMAIL_FROM (the "From" address, e.g. noreply@taskflow.app)
 */

const createTransporter = () => {
  const requiredConfig = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM', 'CLIENT_ORIGIN'];
  const missingConfig = requiredConfig.filter((key) => !process.env[key]);
  if (missingConfig.length) {
    throw new Error(`Email configuration is missing: ${missingConfig.join(', ')}`);
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

/**
 * Send an invite email to an existing user.
 * The user already has an account, so the link takes them straight to
 * the project. Viewing it will activate their membership.
 */
const sendExistingUserInvite = async ({ toEmail, projectName, projectId, inviterName }) => {
  const transporter = createTransporter();

  const projectUrl = `${process.env.CLIENT_ORIGIN}/project.html?id=${encodeURIComponent(projectId)}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'noreply@taskflow.app',
    to: toEmail,
    subject: `You've been invited to ${projectName}`,
    html: `
      <h1>Project Invite</h1>
      <p><strong>${inviterName}</strong> invited you to collaborate on <strong>${projectName}</strong>.</p>
      <p><a href="${projectUrl}">View Project</a></p>
      <p>If you don't recognize this invite, you can safely ignore this email.</p>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL] Invite sent to existing user ${toEmail}:`, info.messageId);
  } catch (err) {
    // Log but don't throw — a failed email shouldn't block the invite flow.
    console.error(`[EMAIL ERROR] Failed to send invite to ${toEmail}:`, err.message);
  }
};

/**
 * Send a signup-invite email to someone who doesn't have an account yet.
 * The link takes them to the registration page with a token or project ID
 * in the URL so the frontend can auto-create their membership after signup.
 */
const sendSignupInvite = async ({ toEmail, projectName, projectId, inviterName }) => {
  const transporter = createTransporter();

  const signupUrl = `${process.env.CLIENT_ORIGIN}/index.html?inviteProject=${encodeURIComponent(projectId)}&inviteEmail=${encodeURIComponent(toEmail)}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'noreply@taskflow.app',
    to: toEmail,
    subject: `${inviterName} invited you to ${projectName} on TaskFlow`,
    html: `
      <h1>You're Invited</h1>
      <p><strong>${inviterName}</strong> invited you to join <strong>${projectName}</strong> on TaskFlow.</p>
      <p>You don't have an account yet. <a href="${signupUrl}">Sign up here</a> to get started.</p>
      <p>If you don't want to join, you can safely ignore this email.</p>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL] Signup invite sent to ${toEmail}:`, info.messageId);
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed to send signup invite to ${toEmail}:`, err.message);
  }
};

module.exports = {
  sendExistingUserInvite,
  sendSignupInvite,
};
