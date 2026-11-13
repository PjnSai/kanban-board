import { apiFetch } from "./apiFetch";

const API_BASE = import.meta.env.VITE_API_BASE;

export async function parseJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return { detail: "Something went wrong. Please try again." };
  }
}

export function formatApiError(
  data: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (!data || typeof data !== "object") return fallback;
  const messages = Object.values(data as Record<string, unknown>)
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter((m): m is string => typeof m === "string");
  return messages.length ? messages.join(" ") : fallback;
}

function generateClientId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const clientId = generateClientId();

export async function updateCard(
  cardId: number,
  listId: number,
  position: number,
) {
  const res = await apiFetch(`${API_BASE}/cards/${cardId}/`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Id": clientId,
    },
    body: JSON.stringify({ list: listId, position }),
  });
  if (!res.ok)
    throw new Error(`Failed to update card ${cardId}: HTTP ${res.status}`);
  return res.json();
}

export async function createBoard(name: string) {
  const res = await apiFetch(`${API_BASE}/boards/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const data = await parseJson(res);
    throw new Error(formatApiError(data, "Failed to create board"));
  }
  return res.json();
}

export async function createList(
  boardId: number,
  name: string,
  position: number,
) {
  const res = await apiFetch(`${API_BASE}/lists/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Id": clientId,
    },
    body: JSON.stringify({ board: boardId, name, position }),
  });
  if (!res.ok) {
    const data = await parseJson(res);
    throw new Error(formatApiError(data, "Failed to create list"));
  }
  return res.json();
}

export async function createCard(
  listId: number,
  title: string,
  position: number,
) {
  const res = await apiFetch(`${API_BASE}/cards/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Id": clientId,
    },
    body: JSON.stringify({ list: listId, title, position }),
  });
  if (!res.ok) {
    const data = await parseJson(res);
    throw new Error(formatApiError(data, "Failed to create card"));
  }
  return res.json();
}

export async function updateBoard(boardId: number, name: string) {
  const res = await apiFetch(`${API_BASE}/boards/${boardId}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Failed to update board: HTTP ${res.status}`);
  return res.json();
}

export async function updateList(listId: number, name: string) {
  const res = await apiFetch(`${API_BASE}/lists/${listId}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Failed to update list: HTTP ${res.status}`);
  return res.json();
}

export async function updateCardTitle(cardId: number, title: string) {
  const res = await apiFetch(`${API_BASE}/cards/${cardId}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to update card: HTTP ${res.status}`);
  return res.json();
}

export async function deleteBoard(boardId: number) {
  const res = await apiFetch(`${API_BASE}/boards/${boardId}/`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete board: HTTP ${res.status}`);
}

export async function deleteList(listId: number) {
  const res = await apiFetch(`${API_BASE}/lists/${listId}/`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete list: HTTP ${res.status}`);
}

export async function deleteCard(cardId: number) {
  const res = await apiFetch(`${API_BASE}/cards/${cardId}/`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete card: HTTP ${res.status}`);
}

export async function updateListPosition(listId: number, position: number) {
  const res = await apiFetch(`${API_BASE}/lists/${listId}/`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Id": clientId,
    },
    body: JSON.stringify({ position }),
  });
  if (!res.ok) throw new Error(`Failed to update list: HTTP ${res.status}`);
  return res.json();
}

export async function updateBoardPosition(boardId: number, position: number) {
  const res = await apiFetch(`${API_BASE}/boards/${boardId}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ position }),
  });
  if (!res.ok) throw new Error(`Failed to update board: HTTP ${res.status}`);
  return res.json();
}

export async function leaveBoard(boardId: number) {
  const res = await apiFetch(`${API_BASE}/boards/${boardId}/leave/`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to leave board: HTTP ${res.status}`);
  return res.json();
}

export async function removeCollaborator(boardId: number, username: string) {
  const res = await apiFetch(
    `${API_BASE}/boards/${boardId}/remove-collaborator/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Id": clientId,
      },
      body: JSON.stringify({ username }),
    },
  );
  const data = await res.json();
  if (!res.ok)
    throw new Error(
      data.detail || `Failed to remove collaborator: HTTP ${res.status}`,
    );
  return data;
}

export async function requestPasswordReset(email: string) {
  const res = await fetch(`${API_BASE}/auth/password-reset/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await parseJson(res);
  if (!res.ok)
    throw new Error(data.detail || "Failed to request password reset");
  return data;
}

export async function confirmPasswordReset(
  uid: string,
  token: string,
  newPassword: string,
) {
  const res = await fetch(`${API_BASE}/auth/password-reset-confirm/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, token, new_password: newPassword }),
  });
  const data = await parseJson(res);
  if (!res.ok)
    throw new Error(formatApiError(data, "Failed to reset password"));
  return data;
}

export interface Me {
  id: number;
  username: string;
  email: string;
  date_joined: string;
  boards_owned: number;
}

export async function getMe(): Promise<Me> {
  const res = await apiFetch(`${API_BASE}/auth/me/`, { method: "GET" });
  const data = await parseJson(res);
  if (!res.ok)
    throw new Error(formatApiError(data, "Failed to load your profile"));
  return data;
}

export async function changeEmail(
  email: string,
  password: string,
): Promise<string> {
  const res = await apiFetch(`${API_BASE}/auth/change-email/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(formatApiError(data, "Failed to change email"));
  return data.email;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
) {
  const res = await apiFetch(`${API_BASE}/auth/change-password/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
  const data = await parseJson(res);
  if (!res.ok)
    throw new Error(formatApiError(data, "Failed to change password"));
}

export async function getWsTicket(boardId: string | number): Promise<string> {
  const res = await apiFetch(`${API_BASE}/boards/${boardId}/ws-ticket/`, {
    method: "GET",
  });
  const data = await parseJson(res);
  if (!res.ok)
    throw new Error(formatApiError(data, "Could not open live updates"));
  return data.ticket;
}

export interface Invitation {
  id: number;
  board: number;
  board_name: string;
  inviter: string;
  invitee: string;
  role: string;
  created_at: string;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function invitationRequest(
  path: string,
  method: string,
  body?: unknown,
  fallback = "Request failed",
) {
  const res = await apiFetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Client-Id": clientId },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new ApiError(formatApiError(data, fallback), res.status);
  return data;
}

export const getMyInvitations = (): Promise<Invitation[]> =>
  invitationRequest(
    "/invitations/",
    "GET",
    undefined,
    "Could not load invitations",
  );

export const acceptInvitation = (id: number) =>
  invitationRequest(
    `/invitations/${id}/accept/`,
    "POST",
    undefined,
    "Could not accept the invitation",
  );

export const declineInvitation = (id: number, block = false) =>
  invitationRequest(
    `/invitations/${id}/decline/`,
    "POST",
    { block },
    "Could not decline the invitation",
  );

export const getBoardInvitations = (boardId: number): Promise<Invitation[]> =>
  invitationRequest(
    `/boards/${boardId}/invitations/`,
    "GET",
    undefined,
    "Could not load invitations",
  );

export const sendInvitation = (
  boardId: number,
  username: string,
  role = "editor",
): Promise<Invitation> =>
  invitationRequest(
    `/boards/${boardId}/invitations/`,
    "POST",
    { username, role },
    "Could not send the invitation",
  );

export const cancelInvitation = (id: number) =>
  invitationRequest(
    `/invitations/${id}/`,
    "DELETE",
    undefined,
    "Could not cancel the invitation",
  );

export const getBlocks = (): Promise<string[]> =>
  invitationRequest(
    "/blocks/",
    "GET",
    undefined,
    "Could not load your block list",
  );

export const unblockUser = (username: string) =>
  invitationRequest(
    `/blocks/${encodeURIComponent(username)}/`,
    "DELETE",
    undefined,
    "Could not unblock that user",
  );

export interface Member {
  username: string;
  role: "owner" | "manager" | "editor" | "viewer";
}

export const getMembers = (boardId: number): Promise<Member[]> =>
  invitationRequest(
    `/boards/${boardId}/members/`,
    "GET",
    undefined,
    "Could not load members",
  );

export const setMemberRole = (
  boardId: number,
  username: string,
  role: string,
) =>
  invitationRequest(
    `/boards/${boardId}/set-role/`,
    "POST",
    { username, role },
    "Could not change the role",
  );

export const removeMember = (boardId: number, username: string) =>
  invitationRequest(
    `/boards/${boardId}/remove-collaborator/`,
    "POST",
    { username },
    "Could not remove that person",
  );

export interface AppNotification {
  id: number;
  kind: string;
  message: string;
  board_id: number | null;
  created_at: string;
  read: boolean;
  dismissed: boolean;
}

export interface NotificationsResponse {
  unread: number;
  notifications: AppNotification[];
}

export const getNotifications = (): Promise<NotificationsResponse> =>
  invitationRequest(
    "/notifications/",
    "GET",
    undefined,
    "Could not load notifications",
  );

export const markNotificationRead = (id: number) =>
  invitationRequest(
    `/notifications/${id}/read/`,
    "POST",
    undefined,
    "Could not update the notification",
  );

export const markAllNotificationsRead = () =>
  invitationRequest(
    "/notifications/read-all/",
    "POST",
    undefined,
    "Could not update your notifications",
  );

export interface InvitationLimits {
  pending_sent: number;
  max_pending_sent: number;
  pending_received: number;
  max_pending_received: number;
  blocked: number;
  max_blocks: number;
  max_members_per_board: number;
  max_pending_per_board: number;
  invites_per_hour: number;
}

export const getNotificationsPreview = (
  limit: number,
): Promise<NotificationsResponse & { total: number }> =>
  invitationRequest(
    `/notifications/?limit=${limit}`,
    "GET",
    undefined,
    "Could not load notifications",
  );

export const deleteNotification = (id: number) =>
  invitationRequest(
    `/notifications/${id}/`,
    "DELETE",
    undefined,
    "Could not delete the notification",
  );

export const clearNotifications = (scope: "all" | "read") =>
  invitationRequest(
    scope === "read" ? "/notifications/?scope=read" : "/notifications/",
    "DELETE",
    undefined,
    "Could not clear your notifications",
  );

export const getSentInvitations = (): Promise<Invitation[]> =>
  invitationRequest(
    "/invitations/sent/",
    "GET",
    undefined,
    "Could not load sent invitations",
  );

export const getInvitationLimits = (): Promise<InvitationLimits> =>
  invitationRequest(
    "/invitations/limits/",
    "GET",
    undefined,
    "Could not load your invitation limits",
  );

export const dismissNotification = (id: number) =>
  invitationRequest(
    `/notifications/${id}/dismiss/`,
    "POST",
    undefined,
    "Could not clear that notification",
  );

export const dismissAllNotifications = () =>
  invitationRequest(
    "/notifications/dismiss-all/",
    "POST",
    undefined,
    "Could not clear your notifications",
  );

export const getBellNotifications = (
  limit: number,
): Promise<NotificationsResponse & { total: number; bell_total: number }> =>
  invitationRequest(
    `/notifications/?scope=bell&limit=${limit}`,
    "GET",
    undefined,
    "Could not load notifications",
  );

export const getAllNotifications = (): Promise<
  NotificationsResponse & { total: number }
> =>
  invitationRequest(
    "/notifications/",
    "GET",
    undefined,
    "Could not load notifications",
  );
