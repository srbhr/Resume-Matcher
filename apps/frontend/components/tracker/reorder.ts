import { arrayMove } from '@dnd-kit/sortable';
import {
  APPLICATION_STATUS_ORDER,
  type ApplicationColumns,
  type ApplicationStatus,
} from '@/lib/api/tracker';

const COLUMN_PREFIX = 'column:';

export interface MovePlan {
  /** The reordered columns with positions renumbered 0..n-1. */
  next: ApplicationColumns;
  /** The target column the card now belongs to. */
  status: ApplicationStatus;
  /** The card's index within the target column (the server-side `position`). */
  position: number;
}

function locate(
  columns: ApplicationColumns,
  cardId: string
): { status: ApplicationStatus; index: number } | null {
  for (const status of APPLICATION_STATUS_ORDER) {
    const index = columns[status].findIndex((a) => a.application_id === cardId);
    if (index >= 0) return { status, index };
  }
  return null;
}

/**
 * Pure drag-end resolution shared by the board and its tests.
 *
 * ``overId`` is either a card id or a column droppable id (``column:<status>``,
 * so empty columns are valid drop targets). Returns ``null`` for a no-op move.
 * Positions in every touched column are renumbered to a contiguous sequence so
 * the optimistic state matches what the server will persist.
 */
export function planMove(
  columns: ApplicationColumns,
  activeId: string,
  overId: string
): MovePlan | null {
  if (activeId === overId) return null;

  const source = locate(columns, activeId);
  if (!source) return null;

  const overIsColumn = overId.startsWith(COLUMN_PREFIX);
  const targetStatus: ApplicationStatus = overIsColumn
    ? (overId.slice(COLUMN_PREFIX.length) as ApplicationStatus)
    : (locate(columns, overId)?.status ?? source.status);

  if (source.status === targetStatus) {
    const overIndex = overIsColumn
      ? columns[targetStatus].length - 1
      : locate(columns, overId)!.index;
    if (overIndex === source.index) return null;
    const reordered = arrayMove(columns[targetStatus], source.index, overIndex).map((a, i) => ({
      ...a,
      position: i,
    }));
    return {
      next: { ...columns, [targetStatus]: reordered },
      status: targetStatus,
      position: reordered.findIndex((a) => a.application_id === activeId),
    };
  }

  const sourceList = [...columns[source.status]];
  const [moved] = sourceList.splice(source.index, 1);
  const targetList = [...columns[targetStatus]];
  const insertAt = overIsColumn ? targetList.length : locate(columns, overId)!.index;
  targetList.splice(insertAt, 0, { ...moved, status: targetStatus });

  return {
    next: {
      ...columns,
      [source.status]: sourceList.map((a, i) => ({ ...a, position: i })),
      [targetStatus]: targetList.map((a, i) => ({ ...a, position: i })),
    },
    status: targetStatus,
    position: insertAt,
  };
}
