/**
 * ============================================================================
 * TaskFlow — Authentication Page Controller (auth.js)
 * ============================================================================
 *
 * BACKEND ENDPOINTS CALLED BY THIS FILE:
 * 1. `POST /auth/login`
 *    - Payload: `{ email, password }`
 *    - Response: `{ accessToken, user: { id, name, email } }` + sets `httpOnly` refresh cookie
 * 2. `POST /auth/register`
 *    - Payload: `{ name, email, password }`
 *    - Response: `{ accessToken, user: { id, name, email } }` + sets `httpOnly` refresh cookie
 *
 * ROLE VISIBILITY & SECURITY NOTE:
 * - `index.html` is accessible to unauthenticated visitors.
 * - On successful login or registration, the returned `accessToken` is stored in memory ONLY
 *   (`setAccessToken(data.accessToken)` in `api.js` — NOT `localStorage` due to XSS risk)
 *   before redirecting to `home.html`.
 * - Any role-based UI hiding on subsequent pages is a UX nicety ONLY; the backend enforces
 *   all permissions server-side (Parts 3 and 4).
 */

import {
  apiRequest,
  setAccessToken,
  escapeHtml,
  showToast,
  showApiErrorToast,
  getAccessToken,
  refreshAccessToken,
} from "./api.js?v=invite-flow";

const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const panelLogin = document.getElementById("panel-login");
const panelRegister = document.getElementById("panel-register");
const authHeading = document.getElementById("auth-heading");
const authSubheading = document.getElementById("auth-subheading");
const errorBanner = document.getElementById("auth-error-banner");

const loginEmailInput = document.getElementById("login-email");
const loginPasswordInput = document.getElementById("login-password");
const registerEmailInput = document.getElementById("register-email");
const inviteParams = new URLSearchParams(window.location.search);
const inviteProjectId = inviteParams.get("inviteProject");
const inviteEmail = inviteParams.get("inviteEmail");

function clearAuthError() {
  if (!errorBanner) return;
  errorBanner.classList.add("is-hidden");
  errorBanner.innerHTML = "";
}

function renderAuthError(err) {
  if (!errorBanner) return;
  const code = err?.code || "AUTH_ERROR";
  const message = err?.message || "Unable to authenticate with those credentials.";
  errorBanner.innerHTML = `<span class="inline-banner__code">[${escapeHtml(code)}]</span>${escapeHtml(message)}`;
  errorBanner.classList.remove("is-hidden");
  showApiErrorToast(err);
}

function switchAuthTab(mode) {
  clearAuthError();
  const isLogin = mode === "login";

  tabLogin.setAttribute("aria-selected", String(isLogin));
  tabRegister.setAttribute("aria-selected", String(!isLogin));

  panelLogin.classList.toggle("is-hidden", !isLogin);
  panelRegister.classList.toggle("is-hidden", isLogin);

  if (isLogin) {
    authHeading.textContent = "Sign in to your workspace";
    authSubheading.textContent = "Organize project tasks with role-scoped access control.";
    loginEmailInput.focus();
  } else {
    authHeading.textContent = "Create your TaskFlow account";
    authSubheading.textContent = "Start organizing tasks and inviting project collaborators.";
    document.getElementById("register-name")?.focus();
  }
}

tabLogin?.addEventListener("click", () => switchAuthTab("login"));
tabRegister?.addEventListener("click", () => switchAuthTab("register"));

if (inviteProjectId) {
  switchAuthTab("register");
  if (inviteEmail && registerEmailInput) {
    registerEmailInput.value = inviteEmail;
  }
}

/**
 * Handle Login Submission (`POST /auth/login`)
 */
panelLogin?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearAuthError();

  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value;

  try {
    // TODO: add fetch from the api (`POST /auth/login`)
    const response = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    // Keep short-lived accessToken strictly in memory (never localStorage — XSS risk)
    setAccessToken(response.accessToken);

    showToast({
      code: "AUTH_OK",
      message: `Signed in as ${response.user.name}. Redirecting...`,
      type: "success",
      durationMs: 1500,
    });

    window.location.href = "home.html";
  } catch (err) {
    renderAuthError(err);
  }
});

/**
 * Handle Create Account Submission (`POST /auth/register`)
 */
panelRegister?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearAuthError();

  const name = document.getElementById("register-name").value.trim();
  const email = registerEmailInput.value.trim();
  const password = document.getElementById("register-password").value;

  try {
    // TODO: add fetch from the api (`POST /auth/register`)
    const response = await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password, inviteProjectId }),
    });

    // Store returned accessToken in JS memory only (never localStorage — XSS risk)
    setAccessToken(response.accessToken);

    showToast({
      code: "ACCOUNT_CREATED",
      message: `Welcome, ${response.user.name}. Redirecting to your projects...`,
      type: "success",
      durationMs: 1500,
    });

    window.location.href = "home.html";
  } catch (err) {
    renderAuthError(err);
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  if (getAccessToken()) {
    window.location.replace("home.html");
    return true;
  }

  try {
    await refreshAccessToken();
    window.location.replace("home.html");
    return true;
  } catch (err) {
    return false;
  }
});
