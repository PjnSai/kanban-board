import { useState, useEffect } from "react";
import { apiFetch } from "./apiFetch";
import {
  createList,
  createCard,
  updateList,
  updateCardTitle,
  deleteList,
  deleteCard,
  clientId,
  getWsTicket,
  updateCardDescription,
} from "./api";
import { useConfirm } from "./confirmContext";
import { openLiveSocket } from "./liveSocket";

interface Card {
  id: number;
  title: string;
  position: number;
  description?: string;
}
interface List {
  id: number;
  name: string;
  position: number;
  cards: Card[];
}
interface Board {
  id: number;
  name: string;
  lists: List[];
  collaborators: string[];
  is_owner: boolean;
  my_role: string | null;
}

const API_BASE = import.meta.env.VITE_API_BASE;
const WS_BASE = import.meta.env.VITE_WS_BASE;

function friendly(err: unknown, fallback: string) {
  const text = err instanceof Error ? err.message : "";
  if (text.includes("403") || text.toLowerCase().includes("permission")) {
    return "You don't have editor access on this board. Ask the owner or a manager if you need to make changes.";
  }
  return text || fallback;
}

export function useBoard(boardId: number) {
  const confirm = useConfirm();
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [membersVersion, setMembersVersion] = useState(0);

  const [newListName, setNewListName] = useState("");
  const [newCardTitle, setNewCardTitle] = useState<{
    [listId: number]: string;
  }>({});
  const [editingListId, setEditingListId] = useState<number | null>(null);
  const [editListName, setEditListName] = useState("");
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [editCardTitle, setEditCardTitle] = useState("");

  useEffect(() => {
    setLoading(true);
    apiFetch(`${API_BASE}/boards/${boardId}/`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setBoard(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [boardId]);

  useEffect(() => {
    if (!boardId) return;

    const reloadBoard = async () => {
      try {
        const res = await apiFetch(`${API_BASE}/boards/${boardId}/`);
        if (res.status === 403 || res.status === 404) {
          setRemoved(true);
          return;
        }
        if (!res.ok) return;
        setBoard(await res.json());
      } catch {
        // keep what is on screen
      }
    };

    const handleMessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      if (data.origin === clientId) return;

      if (data.event === "card_moved") {
        setBoard((prev) => {
          if (!prev) return prev;
          const newLists = prev.lists.map((l) => ({
            ...l,
            cards: [...l.cards],
          }));
          let movedCard: Card | undefined;
          newLists.forEach((list) => {
            const idx = list.cards.findIndex((c) => c.id === data.card_id);
            if (idx !== -1) [movedCard] = list.cards.splice(idx, 1);
          });
          if (movedCard) {
            const updatedCard = { ...movedCard, title: data.title };
            const destList = newLists.find((l) => l.id === data.list_id);
            destList?.cards.splice(data.position, 0, updatedCard);
          }
          return { ...prev, lists: newLists };
        });
      }

      if (data.event === "list_moved") {
        setBoard((prev) => {
          if (!prev) return prev;
          const list = prev.lists.find((l) => l.id === data.list_id);
          if (!list) return prev;
          const others = prev.lists.filter((l) => l.id !== data.list_id);
          const newLists = [...others];
          const updatedList = { ...list, name: data.name };
          newLists.splice(data.position, 0, updatedList);
          return { ...prev, lists: newLists };
        });
      }

      if (data.event === "list_created") {
        setBoard((prev) => {
          if (!prev) return prev;
          if (prev.lists.some((l) => l.id === data.list_id)) return prev;
          const newList = {
            id: data.list_id,
            name: data.name,
            position: data.position,
            cards: [],
          };
          return { ...prev, lists: [...prev.lists, newList] };
        });
      }

      if (data.event === "card_created") {
        setBoard((prev) => {
          if (!prev) return prev;
          const list = prev.lists.find((l) => l.id === data.list_id);
          if (!list || list.cards.some((c) => c.id === data.card_id))
            return prev;
          const newCard = {
            id: data.card_id,
            title: data.title,
            position: data.position,
          };
          return {
            ...prev,
            lists: prev.lists.map((l) =>
              l.id === data.list_id
                ? { ...l, cards: [...l.cards, newCard] }
                : l,
            ),
          };
        });
      }

      if (data.event === "list_deleted") {
        setBoard((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            lists: prev.lists.filter((l) => l.id !== data.list_id),
          };
        });
      }

      if (data.event === "card_deleted") {
        setBoard((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            lists: prev.lists.map((l) => ({
              ...l,
              cards: l.cards.filter((c) => c.id !== data.card_id),
            })),
          };
        });
      }

      if (data.event === "collaborator_added") {
        setBoard((prev) => {
          if (!prev) return prev;
          if (prev.collaborators.includes(data.username)) return prev;
          return {
            ...prev,
            collaborators: [...prev.collaborators, data.username],
          };
        });
      }

      if (data.event === "collaborator_removed") {
        setBoard((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            collaborators: prev.collaborators.filter(
              (c) => c !== data.username,
            ),
          };
        });
      }
      if (
        data.event === "role_changed" ||
        data.event === "collaborator_removed" ||
        data.event === "access_revoked"
      ) {
        setMembersVersion((v) => v + 1);
        reloadBoard();
      }
    };
    const connection = openLiveSocket({
      getUrl: async () =>
        `${WS_BASE}/boards/${boardId}/?ticket=${encodeURIComponent(await getWsTicket(boardId))}`,
      onMessage: handleMessage,
      onResync: () => reloadBoard(),
      onGiveUp: (reason) => {
        if (reason === "no-access") setRemoved(true);
      },
    });

    return () => {
      connection.close();
    };
  }, [boardId]);

  async function handleCreateList(e: React.FormEvent) {
    e.preventDefault();
    const name = newListName.trim();
    if (!name || !board) return;
    try {
      const position = board.lists.length;
      const newList = await createList(boardId, name, position);
      setBoard({
        ...board,
        lists: [...board.lists, { ...newList, cards: [] }],
      });
      setNewListName("");
    } catch (err) {
      setNotice(friendly(err, "Failed to create list"));
    }
  }

  async function handleCreateCard(listId: number, e: React.FormEvent) {
    e.preventDefault();
    const title = newCardTitle[listId]?.trim();
    if (!title || !board) return;
    try {
      const list = board.lists.find((l) => l.id === listId);
      const position = list ? list.cards.length : 0;
      const newCard = await createCard(listId, title, position);
      setBoard({
        ...board,
        lists: board.lists.map((l) =>
          l.id === listId ? { ...l, cards: [...l.cards, newCard] } : l,
        ),
      });
      setNewCardTitle((prev) => ({ ...prev, [listId]: "" }));
    } catch (err) {
      setNotice(friendly(err, "Failed to create card"));
    }
  }

  function startEditingList(list: List) {
    setEditingListId(list.id);
    setEditListName(list.name);
  }

  async function saveEditList(listId: number) {
    const name = editListName.trim();
    setEditingListId(null);
    if (!name || !board) return;
    try {
      await updateList(listId, name);
      setBoard({
        ...board,
        lists: board.lists.map((l) => (l.id === listId ? { ...l, name } : l)),
      });
    } catch (err) {
      setNotice(friendly(err, "Failed to update list"));
    }
  }

  function startEditingCard(card: Card) {
    setEditingCardId(card.id);
    setEditCardTitle(card.title);
  }

  async function saveEditCard(cardId: number) {
    const title = editCardTitle.trim();
    setEditingCardId(null);
    if (!title || !board) return;
    try {
      await updateCardTitle(cardId, title);
      setBoard({
        ...board,
        lists: board.lists.map((l) => ({
          ...l,
          cards: l.cards.map((c) => (c.id === cardId ? { ...c, title } : c)),
        })),
      });
    } catch (err) {
      setNotice(friendly(err, "Failed to update card"));
    }
  }

  async function handleDeleteList(listId: number) {
    if (!board) return;
    const target = board.lists.find((l) => l.id === listId);
    const ok = await confirm({
      title: "Delete this list?",
      message: `"${target?.name ?? "This list"}" and all of its cards will be permanently deleted.`,
      confirmLabel: "Delete list",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteList(listId);
      setBoard({ ...board, lists: board.lists.filter((l) => l.id !== listId) });
    } catch (err) {
      setNotice(friendly(err, "Failed to delete list"));
    }
  }

  async function handleDeleteCard(cardId: number) {
    if (!board) return;
    try {
      await deleteCard(cardId);
      setBoard({
        ...board,
        lists: board.lists.map((l) => ({
          ...l,
          cards: l.cards.filter((c) => c.id !== cardId),
        })),
      });
    } catch (err) {
      setNotice(friendly(err, "Failed to delete card"));
    }
  }

  async function saveCardDescription(cardId: number, description: string) {
    try {
      await updateCardDescription(cardId, description);
      setBoard((prev) =>
        prev
          ? {
              ...prev,
              lists: prev.lists.map((l) => ({
                ...l,
                cards: l.cards.map((c) =>
                  c.id === cardId ? { ...c, description } : c,
                ),
              })),
            }
          : prev,
      );
      return true;
    } catch (err) {
      setNotice(friendly(err, "Failed to save the description"));
      return false;
    }
  }

  return {
    board,
    setBoard,
    loading,
    error,
    setError,
    notice,
    setNotice,
    removed,
    membersVersion,
    newListName,
    setNewListName,
    newCardTitle,
    setNewCardTitle,
    editingListId,
    editListName,
    setEditListName,
    editingCardId,
    editCardTitle,
    setEditCardTitle,
    handleCreateList,
    handleCreateCard,
    startEditingList,
    saveEditList,
    startEditingCard,
    saveEditCard,
    handleDeleteList,
    handleDeleteCard,
    saveCardDescription,
  };
}
