import { apiFetch } from './apiFetch';

const API_BASE = 'http://localhost:8000/api';

export const clientId = crypto.randomUUID();

export async function updateCard(cardId: number, listId: number, position: number) {
  const res = await apiFetch(`${API_BASE}/cards/${cardId}/`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Id': clientId,
    },
    body: JSON.stringify({ list: listId, position }),
  });
  if (!res.ok) throw new Error(`Failed to update card ${cardId}: HTTP ${res.status}`);
  return res.json();
}

export async function createBoard(name: string) {
  const res = await apiFetch(`${API_BASE}/boards/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Failed to create board: HTTP ${res.status}`);
  return res.json();
}

export async function createList(boardId: number, name: string, position: number) {
  const res = await apiFetch(`${API_BASE}/lists/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ board: boardId, name, position }),
  });
  if (!res.ok) throw new Error(`Failed to create list: HTTP ${res.status}`);
  return res.json();
}

export async function createCard(listId: number, title: string, position: number) {
  const res = await apiFetch(`${API_BASE}/cards/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Id': clientId,
    },
    body: JSON.stringify({ list: listId, title, position }),
  });
  if (!res.ok) throw new Error(`Failed to create card: HTTP ${res.status}`);
  return res.json();
}

export async function updateBoard(boardId: number, name: string) {
  const res = await apiFetch(`${API_BASE}/boards/${boardId}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Failed to update board: HTTP ${res.status}`);
  return res.json();
}

export async function updateList(listId: number, name: string) {
  const res = await apiFetch(`${API_BASE}/lists/${listId}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Failed to update list: HTTP ${res.status}`);
  return res.json();
}

export async function updateCardTitle(cardId: number, title: string) {
  const res = await apiFetch(`${API_BASE}/cards/${cardId}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to update card: HTTP ${res.status}`);
  return res.json();
}


export async function deleteBoard(boardId: number) {
  const res = await apiFetch(`${API_BASE}/boards/${boardId}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete board: HTTP ${res.status}`);
}

export async function deleteList(listId: number) {
  const res = await apiFetch(`${API_BASE}/lists/${listId}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete list: HTTP ${res.status}`);
}

export async function deleteCard(cardId: number) {
  const res = await apiFetch(`${API_BASE}/cards/${cardId}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete card: HTTP ${res.status}`);
}

export async function updateListPosition(listId: number, position: number) {
  const res = await apiFetch(`${API_BASE}/lists/${listId}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ position }),
  });
  if (!res.ok) throw new Error(`Failed to update list: HTTP ${res.status}`);
  return res.json();
}