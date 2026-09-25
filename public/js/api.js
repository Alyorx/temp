/**
 * ============================================================================
 * TaskFlow — Shared API Wrapper & Auth State (api.js)
 * ============================================================================
 *
 * BACKEND ENDPOINTS CALLED BY THIS MODULE:
 * - Auth (Part 2):
 *   - POST   /auth/register                        (Public)
 *   - POST   /auth/login                           (Public)
 *   - POST   /auth/refresh                         (Uses httpOnly refresh cookie)
 *   - POST   /auth/logout                          (Authenticated)
 * - Projects & Members (Part 3):
 *   - GET    /projects                             (Any authenticated user)
 *   - POST   /projects                             (Any authenticated user -> becomes admin)
 *   - GET    /projects/:id                         (Project member: admin | organizer | member)
 *   - PUT  /projects/:id                         (Project admin ONLY)
 *   - DELETE /projects/:id                         (Project admin ONLY)
 *   - GET    /projects/:id/members                 (Project member: admin | organizer | member)
 *   - POST   /projects/:id/members                 (Project admin | organizer)
 *   - PATCH  /projects/:id/members/:userId         (Project admin ONLY)
 *   - DELETE /projects/:id/members/:userId         (Project admin | organizer)
 * - Tasks (Part 4):
 *   - GET    /projects/:id/tasks                   (Project member: admin | organizer | member)
 *   - POST   /projects/:id/tasks                   (Project admin | organizer)
 *   - GET    /projects/:id/tasks/:taskId           (Project member: admin | organizer | member)
 *   - PUT    /projects/:id/tasks/:taskId           (Project admin | organizer)
 *   - PATCH  /projects/:id/tasks/:taskId/status    (Assigned member OR admin | organizer)
 *   - DELETE /projects/:id/tasks/:taskId           (Project admin | organizer)
 *
 * SECURITY & PERMISSION NOTE:
 * Showing or hiding buttons in the frontend based on `admin`, `organizer`, or `member`
 * roles is a UX NICETY ONLY. The frontend must NEVER be treated as the source of truth
 * for permissions; actual authorization enforcement lives server-side in Parts 3 and 4.
 */

function resolveApiBaseUrl() {
  const { protocol, hostname, port } = window.location;

  if (!port) {
    return `${protocol}//${hostname}/api`;
  }

  const normalizedPort = port === "3000" || port === "8000" ? "5000" : port;
  const origin = `${protocol}//${hostname}:${normalizedPort}`;
  return `${origin}/api`;
}

const API_BASE_URL = resolveApiBaseUrl();

/**
 * SECURITY NOTE — IN-MEMORY ACCESS TOKEN ONLY (NO localStorage):
 * We store the short-lived JWT accessToken strictly in a JavaScript variable in memory,
 * NEVER in localStorage or sessionStorage.
 * Why: Any third-party script or XSS vulnerability on the page can read localStorage
 * and exfiltrate long-lived tokens. By keeping the access token in memory and relying on
 * an `httpOnly; Secure; SameSite` refresh cookie sent automatically via
 * `credentials: 'include'` to `POST /auth/refresh`, tokens cannot be stolen via JS.
 */
let accessToken = null;

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token;
}

export function clearAccessToken() {
  accessToken = null;
}

/**
 * Typed Error class matching the backend's `{ error: { code, message } }` payload shape.
 */
export class ApiError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "ApiError";
    this.code = code || "UNKNOWN_ERROR";
    this.status = status;
  }
}

/**
 * ============================================================================
 * SHARED FETCH WRAPPER WITH 401 -> REFRESH -> RETRY FLOW
 * ============================================================================
 */

/**
 * Calls `POST /auth/refresh` with `credentials: 'include'` so the browser sends
 * the httpOnly refresh cookie and receives a fresh short-lived accessToken in memory.
 */
export async function refreshAccessToken() {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    clearAccessToken();
    throw new ApiError("SESSION_EXPIRED", "Your session has expired. Please sign in again.", 401);
  }
  const data = await response.json();
  setAccessToken(data.accessToken);
  return data.accessToken;
}

/**
 * Shared fetch wrapper for all API calls.
 * - Attaches `credentials: 'include'` and `Authorization: Bearer <accessToken>`
 * - On 401, calls `POST /auth/refresh` ONCE and retries the original request
 * - Parses and throws `ApiError` using the backend's `{ error: { code, message } }` shape
 */
export async function apiRequest(endpoint, options = {}, isRetry = false) {
  const isAuthPublicRoute = endpoint === "/auth/login" || endpoint === "/auth/register";

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    credentials: "include", // Required so httpOnly refresh cookies are sent/received
    headers,
  });

  if (response.status === 401 && !isRetry && !isAuthPublicRoute) {
    try {
      await refreshAccessToken();
      return await apiRequest(endpoint, options, true);
    } catch (refreshError) {
      clearAccessToken();
      window.location.href = "index.html";
      throw refreshError;
    }
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errCode = payload?.error?.code || `HTTP_${response.status}`;
    const errMsg = payload?.error?.message || "Request could not be completed.";
    throw new ApiError(errCode, errMsg, response.status);
  }
  return payload;
}

/**
 * ============================================================================
 * SHARED UI HELPERS (Badges, Escaping, Toast Banner)
 * ============================================================================
 */

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ROLE_LABELS = {
  admin: "Admin",
  organizer: "Organizer",
  member: "Member",
};

const STATUS_LABELS = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

const PRIORITY_LABELS = {
  low: "Low priority",
  medium: "Medium priority",
  high: "High priority",
};

/**
 * Renders a semantic role badge (Always color + explicit text label together).
 */
export function renderRoleBadge(role) {
  const normalized = ["admin", "organizer", "member"].includes(role) ? role : "member";
  const label = ROLE_LABELS[normalized];
  return `<span class="badge badge--role-${normalized}"><span class="badge__dot" aria-hidden="true"></span>${escapeHtml(label)}</span>`;
}

/**
 * Renders a semantic status badge (Always color + explicit text label together).
 */
export function renderStatusBadge(status) {
  const normalized = ["todo", "in_progress", "blocked", "done"].includes(status) ? status : "todo";
  const label = STATUS_LABELS[normalized];
  return `<span class="badge badge--status-${normalized}"><span class="badge__dot" aria-hidden="true"></span>${escapeHtml(label)}</span>`;
}

/**
 * Renders a semantic priority badge (Always color + explicit text label together).
 */
export function renderPriorityBadge(priority) {
  const normalized = ["low", "medium", "high"].includes(priority) ? priority : "medium";
  const label = PRIORITY_LABELS[normalized];
  return `<span class="badge badge--priority-${normalized}">${escapeHtml(label)}</span>`;
}

export function formatShortDate(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Displays a structured toast notification instead of a raw `alert()`.
 * Formats backend `{ error: { code, message } }` payloads clearly.
 */
export function showToast({ code, message, type = "info", durationMs = 4500 }) {
  let region = document.getElementById("toast-region");
  if (!region) {
    region = document.createElement("div");
    region.id = "toast-region";
    region.className = "toast-region";
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "toast--error" : type === "success" ? "toast--success" : ""}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");

  toast.innerHTML = `
    <div class="toast__body">
      ${code ? `<span class="toast__code">${escapeHtml(code)}</span>` : ""}
      <span class="toast__message">${escapeHtml(message)}</span>
    </div>
    <button type="button" class="toast__close" aria-label="Dismiss notification">&times;</button>
  `;

  const closeBtn = toast.querySelector(".toast__close");
  const removeToast = () => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  };
  closeBtn.addEventListener("click", removeToast);
  region.appendChild(toast);

  if (durationMs > 0) {
    window.setTimeout(removeToast, durationMs);
  }
}

export function showApiErrorToast(err) {
  if (err instanceof ApiError) {
    showToast({
      code: err.code,
      message: err.message,
      type: "error",
    });
    return;
  }
  showToast({
    code: "UNEXPECTED_ERROR",
    message: err?.message || "Something went wrong while communicating with the server.",
    type: "error",
  });
}

export async function requireAuth() {
  if (getAccessToken()) return true;

  try {
    await refreshAccessToken();
    return true;
  } catch (err) {
    clearAccessToken();
    window.location.replace("index.html");
    return false;
  }
}
