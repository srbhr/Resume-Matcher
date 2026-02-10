'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ResumeListItem, KanbanColumn } from '@/lib/api/resume';
import GripVertical from 'lucide-react/dist/esm/icons/grip-vertical';
import Check from 'lucide-react/dist/esm/icons/check';
import X from 'lucide-react/dist/esm/icons/x';
import Tag from 'lucide-react/dist/esm/icons/tag';
import { useTranslations } from '@/lib/i18n';

interface KanbanBoardProps {
  columns: KanbanColumn[];
  resumes: ResumeListItem[];
  onMove: (moves: Array<{ resume_id: string; kanban_column_id: string; kanban_order: number }>) => void;
  onUpdateTags: (resumeId: string, tags: string[]) => Promise<string[]>;
}

interface KanbanCardProps {
  resume: ResumeListItem;
  allTags: string[];
  onUpdateTags: (resumeId: string, tags: string[]) => Promise<string[]>;
}

const buildTagSuggestions = (resumes: ResumeListItem[]): string[] => {
  const tags = new Set<string>();
  resumes.forEach((resume) => {
    resume.tags?.forEach((tag) => tags.add(tag));
  });
  return Array.from(tags.values()).sort();
};

const KanbanCard: React.FC<KanbanCardProps & { id: string }> = ({
  resume,
  allTags,
  onUpdateTags,
  id,
}) => {
  const { t } = useTranslations();
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    transition: {
      duration: 240,
      easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
    },
  });
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(resume.tags || []);
  const [isSavingTags, setIsSavingTags] = useState(false);

  useEffect(() => {
    setTags(resume.tags || []);
  }, [resume.tags]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const addTag = (raw: string) => {
    const next = raw.trim().toLowerCase();
    if (!next) return;
    if (tags.includes(next)) return;
    if (tags.length >= 10) return;
    setTags((prev) => [...prev, next]);
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const saveTags = async () => {
    setIsSavingTags(true);
    try {
      const saved = await onUpdateTags(resume.resume_id, tags);
      setTags(saved);
      setIsEditingTags(false);
      setTagInput('');
    } finally {
      setIsSavingTags(false);
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
      setTagInput('');
    }
    if (e.key === 'Backspace' && !tagInput) {
      setTags((prev) => prev.slice(0, -1));
    }
    if (e.key === 'Escape') {
      setIsEditingTags(false);
      setTagInput('');
      setTags(resume.tags || []);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'border-2 border-black bg-white p-3 shadow-[4px_4px_0px_0px_#000000] flex flex-col gap-2 will-change-transform transition-transform duration-200 ease-out',
        isDragging && 'opacity-70'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-xs uppercase text-gray-500">{t('dashboard.kanban.cardLabel')}</p>
          <button
            type="button"
            className="text-left font-serif text-base font-bold leading-tight break-words hover:underline"
            onClick={() => router.push(`/resumes/${resume.resume_id}`)}
          >
            {resume.title || resume.filename || t('dashboard.tailoredResume')}
          </button>
          {resume.filename && (
            <p className="text-xs text-gray-600 break-words">{resume.filename}</p>
          )}
        </div>
        <button
          className="h-7 px-2 border-2 border-black shadow-[2px_2px_0px_0px_#000000] flex items-center gap-1 bg-[#F0F0E8] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none font-mono text-[10px] uppercase"
          {...attributes}
          {...listeners}
          title={t('dashboard.kanban.dragHandle')}
        >
          <GripVertical className="w-4 h-4" />
          {t('dashboard.kanban.dragHandle')}
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {(tags || []).map((tag) => (
            <span
              key={tag}
              className="border border-black px-2 py-0.5 text-[10px] uppercase font-mono bg-[#E5E5E0]"
            >
              {tag}
            </span>
          ))}
          {!tags?.length && (
            <span className="text-[10px] text-gray-500 font-mono">
              {t('dashboard.kanban.noTags')}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => setIsEditingTags(true)}
          title={t('dashboard.kanban.editTags')}
        >
          <Tag className="w-4 h-4" />
        </Button>
      </div>

      {isEditingTags && (
        <div className="border-t-2 border-black pt-2">
          <div className="flex items-center gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder={t('dashboard.kanban.tagPlaceholder')}
              className="h-8 text-xs font-mono rounded-none border-2 border-black"
              list={`tags-${resume.resume_id}`}
              autoFocus
            />
            <datalist id={`tags-${resume.resume_id}`}>
              {allTags.map((tag) => (
                <option key={tag} value={tag} />
              ))}
            </datalist>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3"
              onClick={saveTags}
              disabled={isSavingTags}
            >
              <Check className="w-4 h-4 mr-1" />
              {t('common.save')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => {
                setIsEditingTags(false);
                setTagInput('');
                setTags(resume.tags || []);
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => removeTag(tag)}
                className="border-2 border-black px-2 py-0.5 text-[10px] uppercase font-mono bg-white shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none"
                title={t('dashboard.kanban.removeTag')}
              >
                {tag} ×
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  columns,
  resumes,
  onMove,
  onUpdateTags,
}) => {
  const { t } = useTranslations();
  const allTags = useMemo(() => buildTagSuggestions(resumes), [resumes]);
  const [columnOrder, setColumnOrder] = useState<KanbanColumn[]>(columns);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setColumnOrder(columns);
  }, [columns]);

  const kanbanSignature = useMemo(() => {
    return resumes
      .map((r) => `${r.resume_id}:${r.kanban_column_id || ''}:${r.kanban_order ?? ''}`)
      .join('|');
  }, [resumes]);

  const initialItems = useMemo(() => {
    const map: Record<string, string[]> = {};
    columns.forEach((col) => {
      map[col.id] = [];
    });
    resumes.forEach((resume) => {
      const columnId = resume.kanban_column_id || columns[0]?.id;
      if (!columnId) return;
      if (!map[columnId]) {
        map[columnId] = [];
      }
      map[columnId].push(resume.resume_id);
    });

    Object.keys(map).forEach((columnId) => {
      map[columnId].sort((a, b) => {
        const ra = resumes.find((r) => r.resume_id === a);
        const rb = resumes.find((r) => r.resume_id === b);
        const orderA = ra?.kanban_order ?? 0;
        const orderB = rb?.kanban_order ?? 0;
        return orderA - orderB;
      });
    });

    return map;
  }, [columns, kanbanSignature]);

  const [itemsByColumn, setItemsByColumn] = useState<Record<string, string[]>>(initialItems);

  useEffect(() => {
    setItemsByColumn(initialItems);
  }, [initialItems]);

  const findColumnId = (resumeId: string) => {
    for (const column of columnOrder) {
      if (itemsByColumn[column.id]?.includes(resumeId)) return column.id;
    }
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const sourceColumn = findColumnId(activeId);
    const targetColumn = overId.startsWith('drop:')
      ? overId.replace('drop:', '')
      : findColumnId(overId);
    if (!sourceColumn || !targetColumn) return;

    if (sourceColumn === targetColumn) {
      const items = itemsByColumn[sourceColumn];
      const oldIndex = items.indexOf(activeId);
      const newIndex = items.indexOf(overId);
      const nextItems = arrayMove(items, oldIndex, newIndex);
      const next = { ...itemsByColumn, [sourceColumn]: nextItems };
      setItemsByColumn(next);
      const moves = nextItems.map((id, idx) => ({
        resume_id: String(id).trim(),
        kanban_column_id: sourceColumn,
        kanban_order: idx + 1,
      }));
      onMove(moves);
      return;
    }

    const sourceItems = [...(itemsByColumn[sourceColumn] || [])];
    const targetItems = [...(itemsByColumn[targetColumn] || [])];
    const sourceIndex = sourceItems.indexOf(activeId);
    if (sourceIndex >= 0) {
      sourceItems.splice(sourceIndex, 1);
    }
    const targetIndex = targetItems.indexOf(overId);
    if (targetIndex >= 0) {
      targetItems.splice(targetIndex, 0, activeId);
    } else {
      targetItems.push(activeId);
    }

    const next = {
      ...itemsByColumn,
      [sourceColumn]: sourceItems,
      [targetColumn]: targetItems,
    };
    setItemsByColumn(next);

    const moves = [
      ...sourceItems.map((id, idx) => ({
        resume_id: String(id).trim(),
        kanban_column_id: sourceColumn,
        kanban_order: idx + 1,
      })),
      ...targetItems.map((id, idx) => ({
        resume_id: String(id).trim(),
        kanban_column_id: targetColumn,
        kanban_order: idx + 1,
      })),
    ];
    onMove(moves);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-3 items-stretch min-h-[560px]">
        {columnOrder.map((column) => (
          <KanbanColumnContainer key={column.id} columnId={column.id}>
            <div className="flex items-center justify-between border-b-2 border-black pb-2 mb-3">
              <div>
                <p className="text-xs font-mono uppercase text-gray-500">
                  {t('dashboard.kanban.columnLabel')}
                </p>
                <h3 className="font-serif text-lg font-bold uppercase tracking-wide">
                  {column.label}
                </h3>
              </div>
              <span className="text-xs font-mono text-gray-500">
                {(itemsByColumn[column.id] || []).length}
              </span>
            </div>
            <SortableContext items={itemsByColumn[column.id] || []}>
              <div className="flex flex-col gap-3 flex-1 min-h-[420px]">
                {(itemsByColumn[column.id] || []).map((resumeId) => {
                  const resume = resumes.find((r) => r.resume_id === resumeId);
                  if (!resume) return null;
                  return (
                    <KanbanCard
                      key={resume.resume_id}
                      id={resume.resume_id}
                      resume={resume}
                      allTags={allTags}
                      onUpdateTags={onUpdateTags}
                    />
                  );
                })}
                {!(itemsByColumn[column.id] || []).length && (
                  <div className="flex-1 border-2 border-dashed border-black bg-white p-4 text-xs font-mono uppercase text-gray-500 flex items-center justify-center">
                    {t('dashboard.kanban.dropHere')}
                  </div>
                )}
              </div>
            </SortableContext>
          </KanbanColumnContainer>
        ))}
      </div>
      <DragOverlay>
        {activeId && !activeId.startsWith('column:') ? (
          <div className="border-2 border-black bg-white p-3 shadow-sw-default text-xs font-mono uppercase">
            {t('dashboard.kanban.dragging')}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

const KanbanColumnContainer: React.FC<{
  columnId: string;
  children: React.ReactNode;
}> = ({ columnId, children }) => {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `drop:${columnId}` });

  return (
    <div
      ref={setDropRef}
      className={cn(
        'border-2 border-black bg-[#F0F0E8] p-3 min-w-[280px] max-w-[320px] flex-shrink-0 shadow-[4px_4px_0px_0px_#000000] flex flex-col h-full',
        isOver && 'bg-[#E5E5E0]'
      )}
    >
      {children}
    </div>
  );
};
