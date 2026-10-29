import { parseJson, formatApiError } from "./api";
import { apiFetch } from "./apiFetch";

const API_BASE = import.meta.env.VITE_API_BASE;

export function getAccessToken(): string | null {
  return localStorage.getItem("access_token");
}

export function getRefreshToken(): string | null {
  return localStorage.getItem("refresh_token");
}

function storeTokens(access: string, refresh: string) {
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
}

export function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

export async function login(username: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (res.status === 429)
    throw new Error(
      "Too many login attempts. Please wait a while and try again.",
    );
  if (!res.ok) throw new Error("Invalid username or password");
  const data = await parseJson(res);
  storeTokens(data.access, data.refresh);
}

export async function register(
  username: string,
  email: string,
  password: string,
) {
  const res = await fetch(`${API_BASE}/auth/register/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password }),
  });
  if (!res.ok) {
    const err = await parseJson(res);
    throw new Error(formatApiError(err));
  }
  // Registration doesn't log you in automatically - call login right after
  await login(username, password);
}

export async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;

  const res = await fetch(`${API_BASE}/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });

  if (!res.ok) return false;

  const data = await parseJson(res);
  localStorage.setItem("access_token", data.access);
  if (data.refresh) {
    localStorage.setItem("refresh_token", data.refresh);
  }
  return true;
}

export function isLoggedIn(): boolean {
  return !!getAccessToken();
}

export async function logout() {
  const refresh = getRefreshToken();
  try {
    await fetch(`${API_BASE}/auth/logout/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({ refresh }),
    });
  } catch {
    // fail silently - clearing local tokens still happens regardless
  }
  clearTokens();
}

export async function deleteAccount(password: string) {
  const res = await apiFetch(`${API_BASE}/auth/delete-account/`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const err = await parseJson(res);
    throw new Error(formatApiError(err, "Failed to delete account"));
  }
  clearTokens();
}
