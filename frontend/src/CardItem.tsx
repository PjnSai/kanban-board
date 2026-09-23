import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface CardItemProps {
  id: number;
  title: string;
  isEditing: boolean;
  editValue: string;
  onStartEdit: () => void;
  onEditChange: (value: string) => void;
  onSaveEdit: () => void;
  onDelete: () => void;
}

function CardItem({
  id, title, isEditing, editValue, onStartEdit, onEditChange, onSaveEdit, onDelete,
}: CardItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  if (isEditing) {
    return (
      <div ref={setNodeRef} style={style} className="bg-white rounded-lg px-3 py-2 shadow-sm border border-blue-400">
        <input
          type="text"
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={onSaveEdit}
          onKeyDown={(e) => e.key === 'Enter' && onSaveEdit()}
          autoFocus
          className="w-full text-sm text-slate-700 focus:outline-none"
        />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onStartEdit}
      className="group relative bg-white rounded-lg px-3 py-2 pr-7 shadow-sm border border-slate-200 text-sm text-slate-700 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
    >
      {title}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-600 opacity-70 group-hover:opacity-100 transition-opacity text-xs"
        title="Delete card"
      >
        ✕
      </button>
    </div>
  );
}

export default CardItem;