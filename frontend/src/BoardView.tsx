import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  DragOverlay,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import ListColumn from "./ListColumn";
import MembersPanel from "./MembersPanel";
import { useBoard } from "./useBoard";
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { updateCard, updateListPosition } from "./api";
import PageMessage from "./PageMessage";
import CardDetailDialog from "./CardDetailDialog";

interface Card {
  id: number;
  title: string;
  position: number;
}

function BoardView() {
  const { id } = useParams();
  const boardId = Number(id);

  const {
    board,
    setBoard,
    loading,
    error,
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
  } = useBoard(boardId);

  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [openCardId, setOpenCardId] = useState<number | null>(null);

  const canEdit =
    board?.my_role === "owner" ||
    board?.my_role === "manager" ||
    board?.my_role === "editor";

  const [activeColumn, setActiveColumn] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );

  const noSensors = useSensors();

  function handleDragStart(event: DragStartEvent) {
    if (!canEdit) return;
    const activeId = event.active.id;

    if (typeof activeId === "string" && activeId.startsWith("col-")) {
      const listId = parseInt(activeId.replace("col-", ""), 10);
      const found = board?.lists.find((l) => l.id === listId);
      if (found) setActiveColumn(found);
      return;
    }

    const cardId = activeId as number;
    for (const list of board?.lists ?? []) {
      const found = list.cards.find((c) => c.id === cardId);
      if (found) {
        setActiveCard(found);
        return;
      }
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!canEdit) return;
    setActiveCard(null);
    setActiveColumn(null);
    const { active, over } = event;
    if (!over || !board) return;

    // --- handle a column list being dragged ---
    if (typeof active.id === "string" && active.id.startsWith("col-")) {
      const activeListId = parseInt(active.id.replace("col-", ""), 10);
      let overListId: number | null = null;

      if (typeof over.id === "string" && over.id.startsWith("col-")) {
        overListId = parseInt(over.id.replace("col-", ""), 10);
      } else if (typeof over.id === "string" && over.id.startsWith("list-")) {
        overListId = parseInt(over.id.replace("list-", ""), 10);
      } else {
        const overCardId = over.id as number;
        const containingList = board.lists.find((l) =>
          l.cards.some((c) => c.id === overCardId),
        );
        if (containingList) overListId = containingList.id;
      }

      if (overListId === null || activeListId === overListId) return;

      const oldIndex = board.lists.findIndex((l) => l.id === activeListId);
      const newIndex = board.lists.findIndex((l) => l.id === overListId);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(board.lists, oldIndex, newIndex);
      setBoard({ ...board, lists: reordered });

      reordered.forEach((list, index) => {
        updateListPosition(list.id, index).catch(console.error);
      });
      return;
    }

    const activeCardId = active.id as number;
    const overId = over.id;

    let sourceListIndex = -1;
    let sourceCardIndex = -1;
    board.lists.forEach((list, li) => {
      const ci = list.cards.findIndex((c) => c.id === activeCardId);
      if (ci !== -1) {
        sourceListIndex = li;
        sourceCardIndex = ci;
      }
    });
    if (sourceListIndex === -1) return;

    let destListIndex = -1;
    let destCardIndex = -1;

    if (typeof overId === "string" && overId.startsWith("list-")) {
      const destListId = parseInt(overId.replace("list-", ""), 10);
      destListIndex = board.lists.findIndex((l) => l.id === destListId);
      destCardIndex = board.lists[destListIndex]?.cards.length ?? 0;
    } else {
      board.lists.forEach((list, li) => {
        const ci = list.cards.findIndex((c) => c.id === overId);
        if (ci !== -1) {
          destListIndex = li;
          destCardIndex = ci;
        }
      });
    }
    if (destListIndex === -1) return;

    const newLists = board.lists.map((l) => ({ ...l, cards: [...l.cards] }));
    const [movedCard] = newLists[sourceListIndex].cards.splice(
      sourceCardIndex,
      1,
    );
    newLists[destListIndex].cards.splice(destCardIndex, 0, movedCard);

    setBoard({ ...board, lists: newLists });

    newLists[sourceListIndex].cards.forEach((card, index) => {
      updateCard(card.id, newLists[sourceListIndex].id, index).catch(
        console.error,
      );
    });
    if (destListIndex !== sourceListIndex) {
      newLists[destListIndex].cards.forEach((card, index) => {
        updateCard(card.id, newLists[destListIndex].id, index).catch(
          console.error,
        );
      });
    }
  }
  if (removed)
    return (
      <PageMessage
        title="You no longer have access to this board"
        message="The owner or a manager removed you from this board. If you think this is a mistake, ask them to invite you again."
      />
    );

  if (loading)
    return <p className="text-slate-400 text-sm">Loading board...</p>;
  if (error)
    return (
      <PageMessage
        title="Board not available"
        message="We couldn't open this board. It may have been deleted, you may no longer have access, or the server may be waking up."
      />
    );
  if (!board) return null;

  const openCard =
    board.lists.flatMap((l) => l.cards).find((c) => c.id === openCardId) ??
    null;

  return (
    <div>
      <h2 className="text-lg font-medium text-slate-700 mb-2">{board.name}</h2>
      {!canEdit && (
        <p className="text-sm text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 mb-3">
          You're a viewer on this board, so you can read it but not change it.
          To make changes, ask the owner or a manager to give you editor access.
        </p>
      )}
      {notice && (
        <p className="text-slate-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm mb-3">
          {notice}{" "}
          <button className="underline" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </p>
      )}
      <MembersPanel
        boardId={board.id}
        myRole={board.my_role}
        memberCount={board.collaborators.length}
        refreshKey={membersVersion}
        onRemoved={(username) =>
          setBoard({
            ...board,
            collaborators: board.collaborators.filter((c) => c !== username),
          })
        }
      />
      <div className="flex items-start gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
        <DndContext
          sensors={canEdit ? sensors : noSensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            setActiveCard(null);
            setActiveColumn(null);
          }}
        >
          <SortableContext
            items={board.lists.map((l) => `col-${l.id}`)}
            strategy={horizontalListSortingStrategy}
          >
            {board.lists.map((list) => (
              <ListColumn
                key={list.id}
                id={list.id}
                name={list.name}
                cards={list.cards}
                newCardValue={newCardTitle[list.id] || ""}
                onNewCardChange={(value) =>
                  setNewCardTitle((prev) => ({ ...prev, [list.id]: value }))
                }
                onCreateCard={(e) => handleCreateCard(list.id, e)}
                isEditing={editingListId === list.id}
                editValue={editListName}
                onStartEdit={() => startEditingList(list)}
                onEditChange={setEditListName}
                onSaveEdit={() => saveEditList(list.id)}
                editingCardId={editingCardId}
                editCardTitle={editCardTitle}
                onStartEditCard={startEditingCard}
                onEditCardChange={setEditCardTitle}
                onSaveEditCard={saveEditCard}
                onDeleteList={() => handleDeleteList(list.id)}
                onDeleteCard={handleDeleteCard}
                canEdit={canEdit}
                onOpenCard={setOpenCardId}
              />
            ))}
          </SortableContext>
          <DragOverlay>
            {activeCard && (
              <div className="bg-white rounded-lg px-3 py-2 shadow-lg border border-blue-300 text-sm text-slate-700 rotate-2">
                {activeCard.title}
              </div>
            )}
            {activeColumn && (
              <div className="bg-slate-100 rounded-xl p-3 w-72 shadow-lg border border-blue-300 text-sm font-semibold text-slate-600">
                {activeColumn.name}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
      {canEdit && (
        <form onSubmit={handleCreateList} className="flex gap-2 mt-4">
          <input
            type="text"
            placeholder="New list name"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm max-w-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="bg-slate-200 text-slate-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-slate-300 transition-colors"
          >
            Add List
          </button>
        </form>
      )}
      {openCard && (
        <CardDetailDialog
          key={openCard.id}
          title={openCard.title}
          description={openCard.description ?? ""}
          canEdit={canEdit}
          onSave={(text) => saveCardDescription(openCard.id, text)}
          onClose={() => setOpenCardId(null)}
        />
      )}
    </div>
  );
}

export default BoardView;
