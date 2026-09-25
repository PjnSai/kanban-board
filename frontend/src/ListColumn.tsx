import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import CardItem from './CardItem';

interface CardType {
  id: number;
  title: string;
  position: number;
}

interface ListColumnProps {
  id: number;
  name: string;
  cards: CardType[];
  newCardValue: string;
  onNewCardChange: (value: string) => void;
  onCreateCard: (e: React.FormEvent) => void;
  isEditing: boolean;
  editValue: string;
  onStartEdit: () => void;
  onEditChange: (value: string) => void;
  onSaveEdit: () => void;
  editingCardId: number | null;
  editCardTitle: string;
  onStartEditCard: (card: CardType) => void;
  onEditCardChange: (value: string) => void;
  onSaveEditCard: (cardId: number) => void;
  onDeleteList: () => void;
  onDeleteCard: (cardId: number) => void;
}

function ListColumn({
  id, name, cards, newCardValue, onNewCardChange, onCreateCard,
  isEditing, editValue, onStartEdit, onEditChange, onSaveEdit,
  editingCardId, editCardTitle, onStartEditCard, onEditCardChange, onSaveEditCard,
  onDeleteList, onDeleteCard,
}: ListColumnProps) {
  const { setNodeRef } = useDroppable({ id: `list-${id}` });

  return (
    <div className="bg-slate-100 rounded-xl p-3 w-72 flex-shrink-0">
      <div className="flex items-center justify-between mb-3 px-1">
        {isEditing ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => onEditChange(e.target.value)}
            onBlur={onSaveEdit}
            onKeyDown={(e) => e.key === 'Enter' && onSaveEdit()}
            autoFocus
            className="text-sm font-semibold text-slate-600 border-b border-blue-400 focus:outline-none flex-1"
          />
        ) : (
          <h3
            onClick={onStartEdit}
            className="text-sm font-semibold text-slate-600 uppercase tracking-wide cursor-pointer hover:text-blue-600"
          >
            {name}
          </h3>
        )}
        <button
          onClick={onDeleteList}
          className="w-5 h-5 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-600 text-xs ml-2 flex-shrink-0"
          title="Delete list"
        >
          ✕
        </button>
      </div>
      <div ref={setNodeRef} className="flex flex-col gap-2 min-h-[40px]">
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <CardItem
              key={card.id}
              id={card.id}
              title={card.title}
              isEditing={editingCardId === card.id}
              editValue={editCardTitle}
              onStartEdit={() => onStartEditCard(card)}
              onEditChange={onEditCardChange}
              onSaveEdit={() => onSaveEditCard(card.id)}
              onDelete={() => onDeleteCard(card.id)}
            />
          ))}
        </SortableContext>
      </div>
      <form onSubmit={onCreateCard} className="mt-2 flex gap-1">
        <input
          type="text"
          placeholder="Add a card"
          value={newCardValue}
          onChange={(e) => onNewCardChange(e.target.value)}
          className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="bg-slate-200 text-slate-600 rounded-lg px-2.5 text-sm hover:bg-slate-300 transition-colors"
        >
          +
        </button>
      </form>
    </div>
  );
}

export default ListColumn;