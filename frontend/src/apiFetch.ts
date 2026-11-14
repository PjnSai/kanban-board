import { getAccessToken, refreshAccessToken, clearTokens } from "./auth";

export async function apiFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const doFetch = (token: string | null) =>
    fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });

  let res = await doFetch(getAccessToken());

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doFetch(getAccessToken());
    } else {
      clearTokens();
      window.location.reload(); // forces back to login screen
    }
  }
  if (res.status === 429 || res.status >= 500) {
    window.dispatchEvent(
      new CustomEvent("app:service-notice", { detail: { status: res.status } }),
    );
  }
  return res;
}
