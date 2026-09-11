const API_BASE = 'http://localhost:8000/api';

export async function updateCard(cardId: number, listId: number, position: number) {
  const res = await fetch(`${API_BASE}/cards/${cardId}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ list: listId, position }),
  });
  if (!res.ok) throw new Error(`Failed to update card ${cardId}: HTTP ${res.status}`);
  return res.json();
}