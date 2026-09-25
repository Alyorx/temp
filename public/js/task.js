/**
 * ============================================================================
 * TaskFlow — Task Detail Controller (task.js)
 * ============================================================================
 *
 * BACKEND ENDPOINTS CALLED BY THIS FILE:
 * 1. `GET    /projects/:id/tasks/:taskId`
 *    - Loads all task fields and project membership context for the current viewer.
 * 2. `PATCH  /projects/:id/tasks/:taskId`
 *    - Full task update (title, description, status, priority, assigneeId) — Admin or Organizer ONLY.
 * 3. `PATCH  /projects/:id/tasks/:taskId/status`
 *    - Status-only update with payload `{ status }` — used when viewer is a plain `member`
 *      AND is the task's assignee (`task.assigneeId === currentUser.id`).
 * 4. `DELETE /projects/:id/tasks/:taskId`
 *    - Deletes the task and returns to `project.html?id=...` — Admin or Organizer ONLY.
 * 5. `POST   /auth/logout`
 *    - Signs out and clears the in-memory access token.
 *
 * ROLE VISIBILITY RULES (UX NICETY ONLY — SERVER ENFORCES REAL PERMISSIONS):
 * - All project members see the read-only task specification sheet on the left.
 * - Right-hand control panel renders one of 3 mutually exclusive states:
 *   1. Viewer is `admin` or `organizer`:
 *      Shows the full edit form (all fields) + Delete task button.
 *   2. Viewer is `member` AND `task.assigneeId === currentUser.id`:
 *      Shows ONLY a status dropdown (`todo` / `in_progress` / `blocked` / `done`) that
 *      PATCHes `/projects/:id/tasks/:taskId/status` with just `{ status }`.
 *   3. Viewer is `member` AND `task.assigneeId !== currentUser.id`:
 *      Fully read-only — zero form controls rendered.
 *
 * SECURITY NOTE:
 * Hiding form controls in the DOM is a UX nicety ONLY. The backend (Part 4) validates
 * both project role and `task.assigneeId === req.user.id` on every PATCH/DELETE request.
 */

import {
  apiRequest,
  escapeHtml,
  renderRoleBadge,
  renderStatusBadge,
  renderPriorityBadge,
  formatShortDate,
  showToast,
  showApiErrorToast,
  refreshAccessToken,
  getAccessToken,
  requireAuth,
} from "./api.js";

const params = new URLSearchParams(window.location.search);
const taskId = params.get("id");
let projectId = params.get("projectId") || "";

let currentTask = null;
let projectMembers = [];

// DOM Elements
const headerUserName = document.getElementById("header-user-name");
const breadcrumbProjectLink = document.getElementById("breadcrumb-project-link");
const breadcrumbTaskCode = document.getElementById("breadcrumb-task-code");
const backToProjectBtn = document.getElementById("back-to-project-btn");
const viewerRoleContext = document.getElementById("viewer-role-context");

const taskAccessError = document.getElementById("task-access-error");
const taskWorkspaceContent = document.getElementById("task-workspace-content");

// Read-only sheet fields
const taskDetailCode = document.getElementById("task-detail-code");
const taskDetailUpdated = document.getElementById("task-detail-updated");
const taskDetailTitle = document.getElementById("task-detail-title");
const taskDetailStatus = document.getElementById("task-detail-status");
const taskDetailPriority = document.getElementById("task-detail-priority");
const taskDetailAssignee = document.getElementById("task-detail-assignee");
const taskDetailProject = document.getElementById("task-detail-project");
const taskDetailDescription = document.getElementById("task-detail-description");

// Role-gated sections
const fullEditSection = document.getElementById("full-edit-section");
const memberStatusOnlySection = document.getElementById("member-status-only-section");
const memberReadonlySection = document.getElementById("member-readonly-section");

// Admin / Organizer Full Edit Form controls
const fullTaskEditForm = document.getElementById("full-task-edit-form");
const fullEditTitle = document.getElementById("full-edit-title");
const fullEditDescription = document.getElementById("full-edit-description");
const fullEditStatus = document.getElementById("full-edit-status");
const fullEditPriority = document.getElementById("full-edit-priority");
const fullEditAssignee = document.getElementById("full-edit-assignee");
const deleteTaskBtn = document.getElementById("delete-task-btn");

// Member + Assignee Status-Only Form controls
const memberStatusForm = document.getElementById("member-status-form");
const memberStatusSelect = document.getElementById("member-status-select");

// Member + Non-assignee notice
const readonlyAssigneeName = document.getElementById("readonly-assignee-name");
const logoutBtn = document.getElementById("logout-btn");

/**
 * Loads the task detail (`GET /projects/:id/tasks/:taskId`).
 * Supports opening a task with `task.html?id=<taskId>&projectId=<projectId>`.
 */
async function loadTaskDetail() {
  try {
    if (!taskId || !projectId) {
      renderTaskAccessError({
        code: "INVALID_TASK_LINK",
        message: "This task link is missing a task or project ID.",
      });
      return;
    }

    if (!getAccessToken()) {
      await refreshAccessToken();
    }

    // TODO: add fetch from the api (`GET /projects/:id/tasks/:taskId`)
    const endpoint = `/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`;

    const data = await apiRequest(endpoint, { method: "GET" });
    currentTask = data.task;
    projectMembers = data.members || [];
    const viewer = data.viewer || { id: data.currentUser?.id || null, name: data.currentUser?.name || "Viewer" };
    projectId = currentTask.projectId || projectId;

    // Set header username if available
    if (headerUserName && data.currentUser) {
      headerUserName.textContent = data.currentUser.name;
    }

    taskAccessError?.classList.add("is-hidden");
    taskWorkspaceContent?.classList.remove("is-hidden");

    renderReadOnlyTaskSheet(currentTask);
    renderRoleGatedControls(currentTask, projectMembers, viewer);
  } catch (err) {
    showApiErrorToast(err);
    renderTaskAccessError(err);
  }
}

function renderTaskAccessError(err) {
  if (!taskAccessError || !taskWorkspaceContent) return;
  taskWorkspaceContent.classList.add("is-hidden");
  taskAccessError.classList.remove("is-hidden");

  const code = err?.code || "TASK_UNAVAILABLE";
  const message = err?.message || "You do not have permission to view this task or it does not exist.";

  taskAccessError.innerHTML = `
    <h2 class="empty-state__title">[${escapeHtml(code)}] Cannot open task</h2>
    <p class="empty-state__desc">${escapeHtml(message)}</p>
    <a href="home.html" class="btn btn--primary">Return to your projects</a>
  `;
}

/**
 * Renders all task fields read-only for every project member.
 */
function renderReadOnlyTaskSheet(task) {
  document.title = `${task.code || task.id}: ${task.title} — TaskFlow`;

  const projectHref = `project.html?id=${encodeURIComponent(task.projectId)}`;
  if (breadcrumbProjectLink) {
    breadcrumbProjectLink.href = projectHref;
    breadcrumbProjectLink.textContent = task.projectName || "Project";
  }
  if (backToProjectBtn) {
    backToProjectBtn.href = projectHref;
    backToProjectBtn.textContent = `Back to ${task.projectName || "project"}`;
  }
  if (breadcrumbTaskCode) {
    breadcrumbTaskCode.textContent = task.code || task.id;
  }

  if (viewerRoleContext) {
    viewerRoleContext.innerHTML = renderRoleBadge(task.viewerRole);
  }

  if (taskDetailCode) {
    taskDetailCode.textContent = task.code || task.id;
  }
  if (taskDetailUpdated) {
    const updatedStr = formatShortDate(task.updatedAt || task.createdAt);
    taskDetailUpdated.textContent = updatedStr ? `Updated ${updatedStr}` : "";
  }
  if (taskDetailTitle) {
    taskDetailTitle.textContent = task.title;
  }
  if (taskDetailStatus) {
    taskDetailStatus.innerHTML = renderStatusBadge(task.status);
  }
  if (taskDetailPriority) {
    taskDetailPriority.innerHTML = renderPriorityBadge(task.priority);
  }
  if (taskDetailAssignee) {
    taskDetailAssignee.textContent = task.assigneeName || "Unassigned";
  }
  if (taskDetailProject) {
    taskDetailProject.textContent = task.projectName || task.projectId;
  }
  if (taskDetailDescription) {
    taskDetailDescription.textContent = task.description || "No description provided.";
  }
}

/**
 * Renders the exact role-gated control state required by Part 5:
 * - Case 1: Viewer is `admin` or `organizer` -> Full edit form + delete button
 * - Case 2: Viewer is `member` AND assignee -> Status dropdown ONLY
 * - Case 3: Viewer is `member` AND NOT assignee -> Strictly read-only (no controls)
 *
 * NOTE: Client-side hiding is a UX nicety ONLY; backend Part 4 enforces permissions.
 */
function renderRoleGatedControls(task, members, viewer) {
  const safeViewer = viewer || { id: null, name: "Viewer" };
  const role = task?.viewerRole || "member";
  const isAdminOrOrganizer = role === "admin" || role === "organizer";
  const isAssignedMember = role === "member" && !!task?.assigneeId && task.assigneeId === safeViewer.id;

  const safeMembers = Array.isArray(members) ? members : [];

  // Hide all three sections first
  fullEditSection?.classList.add("is-hidden");
  memberStatusOnlySection?.classList.add("is-hidden");
  memberReadonlySection?.classList.add("is-hidden");

  if (isAdminOrOrganizer) {
    // Case 1: Admin / Organizer sees full edit form + delete
    fullEditSection?.classList.remove("is-hidden");

    fullEditTitle.value = task.title;
    fullEditDescription.value = task.description;
    fullEditStatus.value = task.status;
    fullEditPriority.value = task.priority;

    fullEditAssignee.innerHTML = safeMembers
      .filter((m) => m.status === "active")
      .map(
        (m) =>
          `<option value="${escapeHtml(m.userId)}" ${m.userId === task.assigneeId ? "selected" : ""}>${escapeHtml(m.name)} (${escapeHtml(m.role)})</option>`,
      )
      .join("");

    if (!safeMembers.length) {
      fullEditAssignee.innerHTML = '<option value="">No project members available</option>';
    }
    return;
  }

  if (isAssignedMember) {
    // Case 2: Plain member who IS the assignee sees ONLY the status dropdown
    memberStatusOnlySection?.classList.remove("is-hidden");
    memberStatusSelect.value = task.status;
    return;
  }

  // Case 3: Plain member who is NOT the assignee sees NO controls at all
  memberReadonlySection?.classList.remove("is-hidden");
  if (readonlyAssigneeName) {
    readonlyAssigneeName.textContent = task.assigneeName || "another member";
  }
}

/**
 * Handle Full Task Edit Submission (`PUT /projects/:id/tasks/:taskId` — Admin / Organizer)
 */
fullTaskEditForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentTask) return;

  const payload = {
    title: fullEditTitle.value.trim(),
    description: fullEditDescription.value.trim(),
    status: fullEditStatus.value,
    priority: fullEditPriority.value,
    assignee_ids: fullEditAssignee.value ? [fullEditAssignee.value] : [],
  };

  try {
    // TODO: add fetch from the api (`PUT /projects/:id/tasks/:taskId`)
    await apiRequest(`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(currentTask.id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });

    showToast({
      code: "TASK_SAVED",
      message: "Saved task changes.",
      type: "success",
    });
    await loadTaskDetail();
  } catch (err) {
    showApiErrorToast(err);
  }
});

/**
 * Handle Delete Task (`DELETE /projects/:id/tasks/:taskId` — Admin / Organizer)
 */
deleteTaskBtn?.addEventListener("click", async () => {
  if (!currentTask) return;

  try {
    // TODO: add fetch from the api (`DELETE /projects/:id/tasks/:taskId`)
    await apiRequest(`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(currentTask.id)}`, {
      method: "DELETE",
    });

    showToast({
      code: "TASK_DELETED",
      message: `Deleted task "${currentTask.title}".`,
      type: "info",
    });
    window.location.href = `project.html?id=${encodeURIComponent(projectId)}`;
  } catch (err) {
    showApiErrorToast(err);
  }
});

/**
 * Handle Assigned Member Status-Only Update (`PATCH /projects/:id/tasks/:taskId/status`)
 * Sends strictly `{ status }` in the request body.
 */
memberStatusForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentTask) return;

  const status = memberStatusSelect.value;

  try {
    // TODO: add fetch from the api (`PATCH /projects/:id/tasks/:taskId/status`)
    await apiRequest(`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(currentTask.id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });

    showToast({
      code: "STATUS_UPDATED",
      message: `Updated task status to "${status.replace("_", " ")}".`,
      type: "success",
    });
    await loadTaskDetail();
  } catch (err) {
    showApiErrorToast(err);
  }
});

/**
 * Handle Logout (`POST /auth/logout`)
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
loadTaskDetail();
requireAuth();
