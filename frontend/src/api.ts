import { apiFetch } from './apiFetch';
import { getAccessToken } from './auth';

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