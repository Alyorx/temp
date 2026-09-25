/**
 * ============================================================================
 * TaskFlow — Projects Home Controller (home.js)
 * ============================================================================
 *
 * BACKEND ENDPOINTS CALLED BY THIS FILE:
 * 1. `GET /projects`
 *    - Returns only the projects the currently authenticated user belongs to,
 *      including the viewer's `role` (`admin` | `organizer` | `member`) on each project.
 * 2. `POST /projects`
 *    - Any authenticated user can create a new project; the backend automatically
 *      assigns the creator the `admin` role on that project.
 * 3. `POST /auth/logout`
 *    - Clears the httpOnly refresh cookie on the server and wipes the in-memory `accessToken`.
 *
 * ROLE VISIBILITY & SECURITY NOTE:
 * - Every authenticated user can see the "New project" button and their own project cards.
 * - Each project card displays a semantic role badge (color + text label together) showing
 *   whether the user is `admin`, `organizer`, or `member` on that specific project.
 * - Remember: client-side UI visibility is a UX nicety ONLY. The backend (Parts 3 & 4)
 *   enforces project membership and role permissions on every request.
 */

import { apiRequest, escapeHtml, renderRoleBadge, showToast, showApiErrorToast, refreshAccessToken } from "./api.js";

const projectsGrid = document.getElementById("projects-grid");
const headerUserName = document.getElementById("header-user-name");
const toggleNewProjectBtn = document.getElementById("toggle-new-project-btn");
const cancelNewProjectBtn = document.getElementById("cancel-new-project-btn");
const newProjectPanel = document.getElementById("new-project-panel");
const newProjectForm = document.getElementById("new-project-form");
const projectNameInput = document.getElementById("project-name-input");
const projectDescInput = document.getElementById("project-desc-input");
const logoutBtn = document.getElementById("logout-btn");

/**
 * Loads and renders the projects the current user belongs to (`GET /projects`).
 */
async function loadProjects() {
  try {
    await refreshAccessToken();
    // TODO: add fetch from the api (`GET /projects`)
    const data = await apiRequest("/projects", { method: "GET" });

    if (headerUserName && data.currentUser) {
      headerUserName.textContent = data.currentUser.name;
    }

    renderProjectsGrid(data.projects || []);
  } catch (err) {
    if (err?.status === 401 || err?.code === "SESSION_EXPIRED" || err?.code === "UNAUTHENTICATED") {
      window.location.replace("index.html");
      return;
    }
    showApiErrorToast(err);
  }
}

function renderProjectsGrid(projects) {
  if (!projectsGrid) return;

  if (projects.length === 0) {
    projectsGrid.innerHTML = `
      <div class="empty-state">
        <h2 class="empty-state__title">You don't belong to any projects yet</h2>
        <p class="empty-state__desc">
          Create your first project to start adding tasks and inviting collaborators, or ask a project admin to invite your email.
        </p>
        <button type="button" class="btn btn--primary" id="empty-create-project-btn">
          Create your first project
        </button>
      </div>
    `;
    document.getElementById("empty-create-project-btn")?.addEventListener("click", () => {
      setNewProjectPanelOpen(true);
    });
    return;
  }

  projectsGrid.innerHTML = projects
    .map((project) => {
      const isInvitation = project.status === "invited";
      const cardContent = `
        <div>
          <div class="project-card__top">
            <h2 class="project-card__name">${escapeHtml(project.name)}</h2>
            ${isInvitation ? '<span class="form-hint">Pending invitation</span>' : renderRoleBadge(project.role)}
          </div>
          <p class="project-card__desc">${escapeHtml(project.description)}</p>
        </div>
        <div class="project-card__footer">
          <div class="project-card__stats">
            ${isInvitation ? "<span>Choose whether to join this project</span>" : `<span><strong>${Number(project.taskCount || 0)}</strong> ${project.taskCount === 1 ? "task" : "tasks"}</span><span><strong>${Number(project.memberCount || 0)}</strong> ${project.memberCount === 1 ? "member" : "members"}</span>`}
          </div>
          ${isInvitation ? `<div class="form-actions"><button type="button" class="btn btn--primary btn--sm" data-accept-invitation="${escapeHtml(project.id)}">Accept</button><button type="button" class="btn btn--secondary btn--sm" data-decline-invitation="${escapeHtml(project.id)}">Decline</button></div>` : `<span class="project-card__code">${escapeHtml(project.code || project.id.toUpperCase())}</span>`}
        </div>
      `;

      return isInvitation
        ? `<article class="project-card" aria-label="Pending invitation to ${escapeHtml(project.name)}">${cardContent}</article>`
        : `<a href="project.html?id=${encodeURIComponent(project.id)}" class="project-card" aria-label="Open project ${escapeHtml(project.name)} (${escapeHtml(project.role)})">${cardContent}</a>`;
    })
    .join("");

  projectsGrid.querySelectorAll("[data-accept-invitation]").forEach((button) => {
    button.addEventListener("click", async () => {
      await respondToInvitation(button.dataset.acceptInvitation, "accept");
    });
  });

  projectsGrid.querySelectorAll("[data-decline-invitation]").forEach((button) => {
    button.addEventListener("click", async () => {
      await respondToInvitation(button.dataset.declineInvitation, "decline");
    });
  });
}

async function respondToInvitation(projectId, action) {
  try {
    await apiRequest(
      `/projects/${encodeURIComponent(projectId)}/members/invitation${action === "accept" ? "/accept" : ""}`,
      {
        method: action === "accept" ? "POST" : "DELETE",
      },
    );
    showToast({
      code: action === "accept" ? "INVITE_ACCEPTED" : "INVITE_DECLINED",
      message: action === "accept" ? "Project invitation accepted." : "Project invitation declined.",
      type: "success",
    });
    await loadProjects();
  } catch (err) {
    showApiErrorToast(err);
  }
}

function setNewProjectPanelOpen(isOpen) {
  if (!newProjectPanel || !toggleNewProjectBtn) return;
  newProjectPanel.classList.toggle("is-hidden", !isOpen);
  toggleNewProjectBtn.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) {
    projectNameInput?.focus();
  } else {
    newProjectForm?.reset();
  }
}

toggleNewProjectBtn?.addEventListener("click", () => {
  const currentlyOpen = !newProjectPanel.classList.contains("is-hidden");
  setNewProjectPanelOpen(!currentlyOpen);
});

cancelNewProjectBtn?.addEventListener("click", () => {
  setNewProjectPanelOpen(false);
});

/**
 * Handle New Project Creation (`POST /projects`)
 * Any authenticated user can create a project and becomes `admin` automatically.
 */
newProjectForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = projectNameInput.value.trim();
  const description = projectDescInput.value.trim();

  try {
    // TODO: add fetch from the api (`POST /projects`)
    const result = await apiRequest("/projects", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    });

    setNewProjectPanelOpen(false);
    showToast({
      code: "PROJECT_CREATED",
      message: `Created "${result.project.name}". You are assigned as Admin.`,
      type: "success",
    });

    await loadProjects();
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
loadProjects();
