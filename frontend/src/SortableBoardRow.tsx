import { Link } from 'react-router-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Board {
  id: number;
  name: string;
  position: number;
}

interface SortableBoardRowProps {
  board: Board;
  isEditing: boolean;
  editValue: string;
  onStartEdit: () => void;
  onEditChange: (value: string) => void;
  onSaveEdit: () => void;
  onDelete: () => void;
}

function SortableBoardRow({
  board, isEditing, editValue, onStartEdit, onEditChange, onSaveEdit, onDelete,
}: SortableBoardRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: board.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-3 hover:border-blue-300 transition-colors"
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 px-1">
          ⠿
        </span>
        {isEditing ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => onEditChange(e.target.value)}
            onBlur={onSaveEdit}
            onKeyDown={(e) => e.key === 'Enter' && onSaveEdit()}
            autoFocus
            className="text-slate-700 border-b border-blue-400 focus:outline-none"
          />
        ) : (
          <Link to={`/boards/${board.id}`} className="text-slate-700 hover:text-blue-600 truncate">
            {board.name}
          </Link>
        )}
      </div>
      <div className="flex items-center gap-2 ml-3">
        <button onClick={onStartEdit} className="text-xs text-slate-400 hover:text-blue-600">
          Rename
        </button>
        <button
          onClick={onDelete}
          className="w-5 h-5 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-600 text-xs"
          title="Delete board"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default SortableBoardRow;