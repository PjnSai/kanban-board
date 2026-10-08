import { apiFetch } from "./apiFetch";

const API_BASE = import.meta.env.VITE_API_BASE;

export async function parseJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return { detail: "Something went wrong. Please try again." };
  }
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
  if (!res.ok) throw new Error(`Failed to create board: HTTP ${res.status}`);
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
  if (!res.ok) throw new Error(`Failed to create list: HTTP ${res.status}`);
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
  if (!res.ok) throw new Error(`Failed to create card: HTTP ${res.status}`);
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

export async function addCollaborator(boardId: number, username: string) {
  const res = await apiFetch(
    `${API_BASE}/boards/${boardId}/add-collaborator/`,
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
      data.detail || `Failed to add collaborator: HTTP ${res.status}`,
    );
  return data;
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
  if (!res.ok) throw new Error(data.detail || "Failed to reset password");
  return data;
}
