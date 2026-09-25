/**
 * ============================================================================
 * TaskFlow — Project Detail Controller (project.js)
 * ============================================================================
 *
 * BACKEND ENDPOINTS CALLED BY THIS FILE:
 * 1. `GET    /projects/:id`
 *    - Loads project details, viewer's role on the project, members list, and tasks list.
 * 2. `PATCH  /projects/:id`
 *    - Updates project name and description (Admin ONLY).
 * 3. `DELETE /projects/:id`
 *    - Deletes the entire project (Admin ONLY).
 * 4. `POST   /projects/:id/members`
 *    - Invites a user to the project by email (Admin or Organizer).
 * 5. `PATCH  /projects/:id/members/:userId`
 *    - Changes a member's role between `admin`, `organizer`, and `member` (Admin ONLY).
 * 6. `DELETE /projects/:id/members/:userId`
 *    - Removes a member from the project (Admin ONLY).
 * 7. `POST   /projects/:id/tasks`
 *    - Creates a new task in the project (Admin or Organizer).
 * 8. `PATCH  /projects/:id/tasks/:taskId`
 *    - Updates task fields from the quick edit drawer (Admin or Organizer).
 * 9. `DELETE /projects/:id/tasks/:taskId`
 *    - Deletes a task from the project (Admin or Organizer).
 * 10. `POST  /auth/logout`
 *    - Signs out and clears the in-memory access token.
 *
 * ROLE VISIBILITY RULES (UX NICETY ONLY — SERVER ENFORCES REAL PERMISSIONS):
 * - `admin`:
 *   - Can edit project name/description inline and delete the project.
 *   - Can invite members by email AND change member roles / remove members.
 *   - Can create, edit, and delete tasks.
 * - `organizer`:
 *   - Cannot edit or delete the project.
 *   - Can invite members by email, but CANNOT change roles or remove admins/organizers.
 *   - Can create, edit, and delete tasks.
 * - `member`:
 *   - Read-only across the entire `project.html` page (no project edit, no member invite,
 *     no task create/edit/delete icons). Can click any task row to open `task.html?id=...`.
 *
 * SECURITY NOTE:
 * Hiding buttons in the DOM based on `project.role` is strictly a client-side UX nicety.
 * Parts 3 and 4 on the backend validate the user's JWT and project role on every request.
 */

import {
  apiRequest,
  escapeHtml,
  renderRoleBadge,
  renderStatusBadge,
  renderPriorityBadge,
  showToast,
  showApiErrorToast,
  getAccessToken,
  refreshAccessToken,
  requireAuth,
} from "./api.js";

const params = new URLSearchParams(window.location.search);
const projectId = params.get("id");

let currentProject = null;
let activeStatusFilter = "all";

// DOM Elements
const headerUserName = document.getElementById("header-user-name");
const breadcrumbProjectName = document.getElementById("breadcrumb-project-name");
const projectAccessError = document.getElementById("project-access-error");
const projectWorkspaceContent = document.getElementById("project-workspace-content");

const projectTitleDisplay = document.getElementById("project-title-display");
const projectDescDisplay = document.getElementById("project-desc-display");
const projectRoleBadgeSlot = document.getElementById("project-role-badge-slot");
const invitationActions = document.getElementById("invitation-actions");
const acceptInvitationBtn = document.getElementById("accept-invitation-btn");
const declineInvitationBtn = document.getElementById("decline-invitation-btn");

const adminProjectActions = document.getElementById("admin-project-actions");
const editProjectToggleBtn = document.getElementById("edit-project-toggle-btn");
const deleteProjectBtn = document.getElementById("delete-project-btn");
const inlineProjectEditPanel = document.getElementById("inline-project-edit-panel");
const inlineProjectEditForm = document.getElementById("inline-project-edit-form");
const cancelProjectEditBtn = document.getElementById("cancel-project-edit-btn");
const editProjectNameInput = document.getElementById("edit-project-name");
const editProjectDescInput = document.getElementById("edit-project-desc");

const toggleTaskFormBtn = document.getElementById("toggle-task-form-btn");
const taskModalPanel = document.getElementById("task-modal-panel");
const taskFormHeading = document.getElementById("task-form-heading");
const cancelTaskFormBtn = document.getElementById("cancel-task-form-btn");
const projectTaskForm = document.getElementById("project-task-form");
const taskFormEditId = document.getElementById("task-form-edit-id");
const taskTitleInput = document.getElementById("task-title-input");
const taskDescInput = document.getElementById("task-desc-input");
const taskAssigneeSelect = document.getElementById("task-assignee-select");
const taskStatusSelect = document.getElementById("task-status-select");
const taskPrioritySelect = document.getElementById("task-priority-select");
const taskDueDateInput = document.getElementById("task-due-date-input");
const taskFormSubmitBtn = document.getElementById("task-form-submit-btn");

const tasksCountLabel = document.getElementById("tasks-count-label");
const tasksLedgerContainer = document.getElementById("tasks-ledger-container");

const membersCountLabel = document.getElementById("members-count-label");
const inviteMemberBox = document.getElementById("invite-member-box");
const inviteMemberForm = document.getElementById("invite-member-form");
const inviteEmailInput = document.getElementById("invite-email-input");
const membersListEl = document.getElementById("members-list");
const logoutBtn = document.getElementById("logout-btn");

/**
 * Loads project detail, members, and tasks (`GET /projects/:id`).
 */
async function loadProjectDetail() {
  try {
    if (!projectId) {
      renderProjectAccessError({
        code: "INVALID_PROJECT_LINK",
        message: "This project link is missing a project ID.",
      });
      return;
    }

    if (!getAccessToken()) {
      await refreshAccessToken();
    }

    // TODO: add fetch from the api (`GET /projects/:id`)
    const data = await apiRequest(`/projects/${encodeURIComponent(projectId)}`, {
      method: "GET",
    });

    currentProject = data.project;

    // Set header username if available
    if (headerUserName && data.currentUser) {
      headerUserName.textContent = data.currentUser.name;
    }

    projectAccessError?.classList.add("is-hidden");
    projectWorkspaceContent?.classList.remove("is-hidden");

    renderProjectHeader(currentProject);
    renderMembersSection(currentProject);
    renderTasksSection(currentProject);
  } catch (err) {
    showApiErrorToast(err);
    renderProjectAccessError(err);
  }
}

function renderProjectAccessError(err) {
  if (!projectAccessError || !projectWorkspaceContent) return;
  projectWorkspaceContent.classList.add("is-hidden");
  projectAccessError.classList.remove("is-hidden");

  const code = err?.code || "ACCESS_DENIED";
  const message = err?.message || "You do not have permission to view this project or it no longer exists.";

  projectAccessError.innerHTML = `
    <h2 class="empty-state__title">[${escapeHtml(code)}] Project unavailable</h2>
    <p class="empty-state__desc">${escapeHtml(message)}</p>
    <a href="home.html" class="btn btn--primary">Back to your projects</a>
  `;
}

/**
 * Renders the project title, description, role badge, and Admin-only inline edit controls.
 */
function renderProjectHeader(project) {
  document.title = `${project.name} — TaskFlow`;
  if (breadcrumbProjectName) {
    breadcrumbProjectName.textContent = project.name;
  }
  if (projectTitleDisplay) {
    projectTitleDisplay.textContent = project.name;
  }
  if (projectDescDisplay) {
    projectDescDisplay.textContent = project.description;
  }
  if (projectRoleBadgeSlot) {
    projectRoleBadgeSlot.innerHTML =
      project.status === "invited"
        ? '<span class="form-hint">Pending invitation</span>'
        : renderRoleBadge(project.role);
  }

  const isInvitationPending = project.status === "invited";
  invitationActions?.classList.toggle("is-hidden", !isInvitationPending);

  // UX NICETY ONLY: Show inline project edit & delete buttons strictly for `admin`.
  // Real permission check is enforced on the backend (`PATCH /projects/:id`, `DELETE /projects/:id`).
  const isAdmin = project.role === "admin";
  adminProjectActions?.classList.toggle("is-hidden", !isAdmin);
  if (!isAdmin) {
    inlineProjectEditPanel?.classList.add("is-hidden");
  }
}

async function respondToInvitation(action) {
  try {
    await apiRequest(
      `/projects/${encodeURIComponent(projectId)}/members/invitation${action === "accept" ? "/accept" : ""}`,
      { method: action === "accept" ? "POST" : "DELETE" },
    );

    showToast({
      code: action === "accept" ? "INVITE_ACCEPTED" : "INVITE_DECLINED",
      message: action === "accept" ? "Project invitation accepted." : "Project invitation declined.",
      type: "success",
    });

    if (action === "decline") {
      window.location.href = "home.html";
      return;
    }

    await loadProjectDetail();
  } catch (err) {
    showApiErrorToast(err);
  }
}

acceptInvitationBtn?.addEventListener("click", () => respondToInvitation("accept"));
declineInvitationBtn?.addEventListener("click", () => respondToInvitation("decline"));

/**
 * Renders the Members section:
 * - Everyone in the project sees the member list and role badges.
 * - `admin` and `organizer` see the "Invite by email" input + button.
 * - `admin` ONLY sees role-change dropdowns and remove buttons next to members.
 *   (UX nicety only — enforced server-side in Part 3).
 */
function renderMembersSection(project) {
  const members = project.members || [];
  const viewerRole = project.role;
  const isAdmin = viewerRole === "admin";
  const canInvite = viewerRole === "admin" || viewerRole === "organizer";

  if (membersCountLabel) {
    membersCountLabel.textContent = `(${members.length})`;
  }

  // Show/hide "Invite by email" box for Admin and Organizer
  inviteMemberBox?.classList.toggle("is-hidden", !canInvite);

  // Populate assignee select dropdown inside the Task creation/edit form
  if (taskAssigneeSelect) {
    taskAssigneeSelect.innerHTML = `
      <option value="">Unassigned</option>
      ${members
        .filter((m) => m.status === "active")
        .map((m) => `<option value="${escapeHtml(m.userId)}">${escapeHtml(m.name)} (${escapeHtml(m.role)})</option>`)
        .join("")}
    `;
  }

  if (!membersListEl) return;

  membersListEl.innerHTML = members
    .map((member) => {
      // UX NICETY ONLY: Only admins see role-change and remove controls next to each member.
      const adminControlsHtml = isAdmin
        ? `
        <div class="member-item__controls">
          <label class="form-hint" for="role-select-${escapeHtml(member.userId)}">Role:</label>
          <div style="display: flex; align-items: center; gap: 0.375rem;">
            <select
              id="role-select-${escapeHtml(member.userId)}"
              class="member-role-select"
              data-member-role-select="${escapeHtml(member.userId)}"
              aria-label="Change role for ${escapeHtml(member.name)}"
            >
              <option value="admin" ${member.role === "admin" ? "selected" : ""}>Admin</option>
              <option value="organizer" ${member.role === "organizer" ? "selected" : ""}>Organizer</option>
              <option value="member" ${member.role === "member" ? "selected" : ""}>Member</option>
            </select>
            <button
              type="button"
              class="btn btn--danger btn--sm"
              data-remove-member="${escapeHtml(member.userId)}"
              data-remove-member-name="${escapeHtml(member.name)}"
              aria-label="Remove ${escapeHtml(member.name)} from project"
            >
              Remove
            </button>
          </div>
        </div>
      `
        : "";

      return `
        <li class="member-item">
          <div class="member-item__top">
            <div class="member-item__info">
              <span class="member-item__name">${escapeHtml(member.name)}</span>
              <span class="member-item__email">${escapeHtml(member.email)}</span>
            </div>
            ${renderRoleBadge(member.role)}
            ${member.status === "invited" ? '<span class="form-hint">Invitation pending</span>' : ""}
          </div>
          ${adminControlsHtml}
        </li>
      `;
    })
    .join("");

  // Wire Admin-only role change dropdowns (`PATCH /projects/:id/members/:userId`)
  membersListEl.querySelectorAll("[data-member-role-select]").forEach((selectEl) => {
    selectEl.addEventListener("change", async (e) => {
      const targetUserId = selectEl.getAttribute("data-member-role-select");
      const newRole = e.target.value;
      try {
        // TODO: add fetch from the api (`PATCH /projects/:id/members/:userId`)
        await apiRequest(`/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(targetUserId)}`, {
          method: "PATCH",
          body: JSON.stringify({ role: newRole }),
        });
        showToast({
          code: "ROLE_UPDATED",
          message: `Updated member role to ${newRole}.`,
          type: "success",
        });
        await loadProjectDetail();
      } catch (err) {
        showApiErrorToast(err);
        await loadProjectDetail();
      }
    });
  });

  // Wire Admin-only member removal buttons (`DELETE /projects/:id/members/:userId`)
  membersListEl.querySelectorAll("[data-remove-member]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const targetUserId = btn.getAttribute("data-remove-member");
      const targetName = btn.getAttribute("data-remove-member-name");
      try {
        // TODO: add fetch from the api (`DELETE /projects/:id/members/:userId`)
        await apiRequest(`/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(targetUserId)}`, {
          method: "DELETE",
        });
        showToast({
          code: "MEMBER_REMOVED",
          message: `Removed ${targetName} from ${project.name}.`,
          type: "info",
        });
        await loadProjectDetail();
      } catch (err) {
        showApiErrorToast(err);
      }
    });
  });
}

/**
 * Renders the Tasks section:
 * - Every project member sees all tasks (title, assignee name, status badge, priority badge)
 *   and can click any task to open `task.html?id=...`.
 * - `admin` and `organizer` see the "New task" button and Edit / Delete controls on each task.
 *   (UX nicety only — enforced server-side in Part 4).
 */
function renderTasksSection(project) {
  const allTasks = project.tasks || [];
  const viewerRole = project.role;
  const canManageTasks = viewerRole === "admin" || viewerRole === "organizer";

  // UX NICETY ONLY: Show "New task" button only for `admin` or `organizer`
  toggleTaskFormBtn?.classList.toggle("is-hidden", !canManageTasks);
  if (!canManageTasks) {
    taskModalPanel?.classList.add("is-hidden");
  }

  const filteredTasks =
    activeStatusFilter === "all" ? allTasks : allTasks.filter((t) => t.status === activeStatusFilter);

  if (tasksCountLabel) {
    tasksCountLabel.textContent = `(${filteredTasks.length})`;
  }

  if (!tasksLedgerContainer) return;

  if (filteredTasks.length === 0) {
    tasksLedgerContainer.innerHTML = `
      <div class="empty-state">
        <h3 class="empty-state__title">No tasks match this view</h3>
        <p class="empty-state__desc">
          ${
            activeStatusFilter === "all"
              ? "This project has no tasks yet."
              : "No tasks currently have the selected status."
          }
        </p>
      </div>
    `;
    return;
  }

  tasksLedgerContainer.innerHTML = `
    <div class="task-ledger">
      ${filteredTasks
        .map((task) => {
          const taskUrl = `task.html?id=${encodeURIComponent(task.id)}&projectId=${encodeURIComponent(project.id)}`;

          // UX NICETY ONLY: Admin & Organizer see Edit and Delete buttons on each task row
          const manageButtonsHtml = canManageTasks
            ? `
              <div class="task-row__actions">
                <button
                  type="button"
                  class="btn btn--secondary btn--sm"
                  data-edit-task="${escapeHtml(task.id)}"
                >
                  Edit
                </button>
                <button
                  type="button"
                  class="btn btn--danger btn--sm"
                  data-delete-task="${escapeHtml(task.id)}"
                  data-delete-task-title="${escapeHtml(task.title)}"
                >
                  Delete
                </button>
              </div>
            `
            : `
              <div class="task-row__actions">
                <a href="${taskUrl}" class="btn btn--ghost btn--sm">View details</a>
              </div>
            `;

          return `
            <article class="task-row task-row--priority-${escapeHtml(task.priority)}">
              <div class="task-row__main">
                <div class="task-row__meta-top">
                  <span class="task-row__id">${escapeHtml(task.code || task.id)}</span>
                  ${renderStatusBadge(task.status)}
                  ${renderPriorityBadge(task.priority)}
                </div>
                <a href="${taskUrl}" class="task-row__title-link">
                  ${escapeHtml(task.title)}
                </a>
                <div class="task-row__assignee">
                  Assigned to <strong>${escapeHtml(task.assigneeName)}</strong>
                </div>
              </div>
              ${manageButtonsHtml}
            </article>
          `;
        })
        .join("")}
    </div>
  `;

  // Wire Edit task buttons (`PATCH /projects/:id/tasks/:taskId`)
  tasksLedgerContainer.querySelectorAll("[data-edit-task]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTaskId = btn.getAttribute("data-edit-task");
      const taskObj = allTasks.find((t) => t.id === targetTaskId);
      if (taskObj) {
        openTaskFormForEdit(taskObj);
      }
    });
  });

  // Wire Delete task buttons (`DELETE /projects/:id/tasks/:taskId`)
  tasksLedgerContainer.querySelectorAll("[data-delete-task]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const targetTaskId = btn.getAttribute("data-delete-task");
      const targetTitle = btn.getAttribute("data-delete-task-title");
      try {
        // TODO: add fetch from the api (`DELETE /projects/:id/tasks/:taskId`)
        await apiRequest(`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(targetTaskId)}`, {
          method: "DELETE",
        });
        showToast({
          code: "TASK_DELETED",
          message: `Deleted task "${targetTitle}".`,
          type: "info",
        });
        await loadProjectDetail();
      } catch (err) {
        showApiErrorToast(err);
      }
    });
  });
}

/**
 * ============================================================================
 * EVENT LISTENERS — PROJECT INLINE EDIT & DELETE (ADMIN ONLY)
 * ============================================================================
 */
editProjectToggleBtn?.addEventListener("click", () => {
  if (!currentProject || !inlineProjectEditPanel) return;
  const isHidden = inlineProjectEditPanel.classList.contains("is-hidden");
  if (isHidden) {
    editProjectNameInput.value = currentProject.name;
    editProjectDescInput.value = currentProject.description;
    inlineProjectEditPanel.classList.remove("is-hidden");
    editProjectToggleBtn.setAttribute("aria-expanded", "true");
    editProjectNameInput.focus();
  } else {
    inlineProjectEditPanel.classList.add("is-hidden");
    editProjectToggleBtn.setAttribute("aria-expanded", "false");
  }
});

cancelProjectEditBtn?.addEventListener("click", () => {
  inlineProjectEditPanel?.classList.add("is-hidden");
  editProjectToggleBtn?.setAttribute("aria-expanded", "false");
});

inlineProjectEditForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = editProjectNameInput.value.trim();
  const description = editProjectDescInput.value.trim();

  try {
    // Update project details through the backend's PUT endpoint.
    await apiRequest(`/projects/${encodeURIComponent(projectId)}`, {
      method: "PUT",
      body: JSON.stringify({ name, description }),
    });

    inlineProjectEditPanel?.classList.add("is-hidden");
    editProjectToggleBtn?.setAttribute("aria-expanded", "false");
    showToast({
      code: "PROJECT_UPDATED",
      message: "Saved project details.",
      type: "success",
    });
    await loadProjectDetail();
  } catch (err) {
    showApiErrorToast(err);
  }
});

deleteProjectBtn?.addEventListener("click", async () => {
  if (!currentProject) return;
  try {
    // TODO: add fetch from the api (`DELETE /projects/:id`)
    await apiRequest(`/projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE",
    });
    showToast({
      code: "PROJECT_DELETED",
      message: `Deleted project "${currentProject.name}".`,
      type: "info",
    });
    window.location.href = "home.html";
  } catch (err) {
    showApiErrorToast(err);
  }
});

/**
 * ============================================================================
 * EVENT LISTENERS — INVITE MEMBER BY EMAIL (ADMIN & ORGANIZER)
 * ============================================================================
 */
inviteMemberForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = inviteEmailInput.value.trim();

  try {
    // TODO: add fetch from the api (`POST /projects/:id/members`)
    const result = await apiRequest(`/projects/${encodeURIComponent(projectId)}/members`, {
      method: "POST",
      body: JSON.stringify({ email }),
    });

    inviteMemberForm.reset();
    showToast({
      code: "MEMBER_INVITED",
      message: result.message || `Invitation sent to ${email}.`,
      type: "success",
    });
    await loadProjectDetail();
  } catch (err) {
    showApiErrorToast(err);
  }
});

/**
 * ============================================================================
 * EVENT LISTENERS — CREATE / EDIT TASK FORM (ADMIN & ORGANIZER)
 * ============================================================================
 */
function toDateTimeLocalValue(dateValue) {
  if (!dateValue) {
    const now = new Date();
    now.setHours(now.getHours() + 24);
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function openTaskFormForCreate() {
  if (!taskModalPanel) return;
  projectTaskForm?.reset();
  taskFormEditId.value = "";
  taskFormHeading.textContent = "Create new task";
  taskFormSubmitBtn.textContent = "Create task";
  if (taskDueDateInput) {
    taskDueDateInput.value = toDateTimeLocalValue("");
  }
  taskModalPanel.classList.remove("is-hidden");
  toggleTaskFormBtn?.setAttribute("aria-expanded", "true");
  taskTitleInput?.focus();
}

function openTaskFormForEdit(task) {
  if (!taskModalPanel) return;
  taskFormEditId.value = task.id;
  taskFormHeading.textContent = `Edit task ${task.code || ""}`;
  taskFormSubmitBtn.textContent = "Save changes";
  taskTitleInput.value = task.title;
  taskDescInput.value = task.description;
  taskAssigneeSelect.value = task.assigneeId || "";
  taskStatusSelect.value = task.status;
  taskPrioritySelect.value = task.priority;
  if (taskDueDateInput) {
    taskDueDateInput.value = toDateTimeLocalValue(task.due_date);
  }
  taskModalPanel.classList.remove("is-hidden");
  toggleTaskFormBtn?.setAttribute("aria-expanded", "true");
  taskTitleInput?.focus();
}

function closeTaskForm() {
  taskModalPanel?.classList.add("is-hidden");
  toggleTaskFormBtn?.setAttribute("aria-expanded", "false");
  projectTaskForm?.reset();
  if (taskFormEditId) taskFormEditId.value = "";
}

toggleTaskFormBtn?.addEventListener("click", () => {
  const isHidden = taskModalPanel.classList.contains("is-hidden");
  if (isHidden) {
    openTaskFormForCreate();
  } else {
    closeTaskForm();
  }
});

cancelTaskFormBtn?.addEventListener("click", closeTaskForm);

projectTaskForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const editingTaskId = taskFormEditId.value.trim();
  const payload = {
    title: taskTitleInput.value.trim(),
    description: taskDescInput.value.trim(),
    assignee_ids: taskAssigneeSelect.value ? [taskAssigneeSelect.value] : [],
    status: taskStatusSelect.value,
    priority: taskPrioritySelect.value,
    due_date:
      taskDueDateInput && taskDueDateInput.value
        ? new Date(taskDueDateInput.value).toISOString()
        : new Date().toISOString(),
  };

  try {
    if (editingTaskId) {
      // TODO: add fetch from the api (`PUT /projects/:id/tasks/:taskId`)
      await apiRequest(`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(editingTaskId)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      showToast({
        code: "TASK_UPDATED",
        message: "Saved task changes.",
        type: "success",
      });
    } else {
      // TODO: add fetch from the api (`POST /projects/:id/tasks`)
      const created = await apiRequest(`/projects/${encodeURIComponent(projectId)}/tasks`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast({
        code: "TASK_CREATED",
        message: `Created task "${created.task.title}".`,
        type: "success",
      });
    }

    closeTaskForm();
    await loadProjectDetail();
  } catch (err) {
    showApiErrorToast(err);
  }
});

/**
 * Status Filter Toolbar Listeners
 */
document.querySelectorAll("[data-status-filter]").forEach((btn) => {
  btn.addEventListener("click", () => {
    activeStatusFilter = btn.getAttribute("data-status-filter") || "all";
    document.querySelectorAll("[data-status-filter]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b === btn));
    });
    if (currentProject) {
      renderTasksSection(currentProject);
    }
  });
});

/**
 * Logout Listener (`POST /auth/logout`)
 */
logoutBtn?.addEventListener("click", async () => {
  try {
    // TODO: add fetch from the api (`POST /auth/logout`)
    await apiRequest("/auth/logout", { method: "POST" });
    window.location.href = "index.html";
  } catch (err) {
    showApiErrorToast(err);
  }
});

// Initial load
loadProjectDetail();
requireAuth();
