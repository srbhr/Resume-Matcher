'use client';

import React, { useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Experience } from '@/components/dashboard/resume-component';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';

interface ExperienceFormProps {
  data: Experience[];
  onChange: (data: Experience[]) => void;
}

export const ExperienceForm: React.FC<ExperienceFormProps> = ({ data, onChange }) => {
  const { t } = useTranslations();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleAdd = () => {
    const newId = Math.max(...data.map((d) => d.id), 0) + 1;
    onChange([
      ...data,
      {
        id: newId,
        title: '',
        company: '',
        location: '',
        years: '',
        description: [''],
      },
    ]);
  };

  const handleRemove = (id: number) => {
    onChange(data.filter((item) => item.id !== id));
  };

  const handleChange = (id: number, field: keyof Experience, value: string | string[]) => {
    onChange(
      data.map((item) => {
        if (item.id === id) {
          return { ...item, [field]: value };
        }
        return item;
      })
    );
  };

  const handleDescriptionChange = (id: number, index: number, value: string) => {
    onChange(
      data.map((item) => {
        if (item.id === id) {
          const newDesc = [...(item.description || [])];
          newDesc[index] = value;
          return { ...item, description: newDesc };
        }
        return item;
      })
    );
  };

  const handleAddDescription = (id: number) => {
    onChange(
      data.map((item) => {
        if (item.id === id) {
          return { ...item, description: ['', ...(item.description || [])] };
        }
        return item;
      })
    );
  };

  const handleRemoveDescription = (id: number, index: number) => {
    onChange(
      data.map((item) => {
        if (item.id === id) {
          const newDesc = [...(item.description || [])];
          newDesc.splice(index, 1);
          return { ...item, description: newDesc };
        }
        return item;
      })
    );
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = data.findIndex((item) => item.id === active.id);
    const newIndex = data.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    onChange(arrayMove(data, oldIndex, newIndex));
  };

  const ExperienceCard = ({
    item,
    children,
    draggable,
  }: {
    item: Experience;
    children: React.ReactNode;
    draggable: boolean;
  }) => {
    if (!draggable) {
      return <div className="p-6 border border-black bg-gray-50 relative group">{children}</div>;
    }

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: item.id,
    });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.6 : 1,
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className="p-6 pl-10 border border-black bg-gray-50 relative group"
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center cursor-grab active:cursor-grabbing"
          title={t('builder.forms.experience.dragHint')}
        >
          <GripVertical className="w-4 h-4 text-gray-400 hover:text-gray-700 transition-colors" />
        </button>
        {children}
      </div>
    );
  };

  const renderExperienceItem = (item: Experience, draggable: boolean) => (
    <ExperienceCard key={item.id} item={item} draggable={draggable}>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={() => handleRemove(item.id)}
      >
        <Trash2 className="w-4 h-4" />
      </Button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 pr-8">
        <div className="space-y-2">
          <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
            {t('builder.forms.experience.fields.jobTitle')}
          </Label>
          <Input
            value={item.title || ''}
            onChange={(e) => handleChange(item.id, 'title', e.target.value)}
            placeholder={t('builder.forms.experience.placeholders.jobTitle')}
            className="rounded-none border-black bg-white"
          />
        </div>
        <div className="space-y-2">
          <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
            {t('builder.forms.experience.fields.company')}
          </Label>
          <Input
            value={item.company || ''}
            onChange={(e) => handleChange(item.id, 'company', e.target.value)}
            placeholder={t('builder.forms.experience.placeholders.company')}
            className="rounded-none border-black bg-white"
          />
        </div>
        <div className="space-y-2">
          <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
            {t('builder.genericItemForm.fields.location')}
          </Label>
          <Input
            value={item.location || ''}
            onChange={(e) => handleChange(item.id, 'location', e.target.value)}
            placeholder={t('builder.forms.experience.placeholders.location')}
            className="rounded-none border-black bg-white"
          />
        </div>
        <div className="space-y-2">
          <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
            {t('builder.genericItemForm.fields.years')}
          </Label>
          <Input
            value={item.years || ''}
            onChange={(e) => handleChange(item.id, 'years', e.target.value)}
            placeholder={t('builder.forms.experience.placeholders.years')}
            className="rounded-none border-black bg-white"
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
            {t('builder.genericItemForm.fields.descriptionPoints')}
          </Label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleAddDescription(item.id)}
            className="h-6 text-xs text-blue-700 hover:text-blue-800 hover:bg-blue-50"
          >
            <Plus className="w-3 h-3 mr-1" /> {t('builder.genericItemForm.actions.addPoint')}
          </Button>
        </div>
        {item.description?.map((desc, idx) => (
          <div key={idx} className="flex gap-2">
            <div className="flex-1">
              <RichTextEditor
                value={desc}
                onChange={(html) => handleDescriptionChange(item.id, idx, html)}
                placeholder={t('builder.forms.experience.placeholders.description')}
                minHeight="60px"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleRemoveDescription(item.id, idx)}
              className="h-[60px] w-8 text-muted-foreground hover:text-destructive self-end"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        ))}
      </div>
    </ExperienceCard>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleAdd}
          className="rounded-none border-black hover:bg-black hover:text-white transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" /> {t('builder.forms.experience.addJob')}
        </Button>
      </div>

      <div className="space-y-8">
        {isMounted ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={data.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              {data.map((item) => renderExperienceItem(item, true))}
            </SortableContext>
          </DndContext>
        ) : (
          data.map((item) => renderExperienceItem(item, false))
        )}

        {data.length === 0 && (
          <div className="text-center py-12 bg-gray-50 border border-dashed border-black">
            <p className="font-mono text-sm text-gray-500 mb-4">
              {t('builder.genericItemForm.noEntries', { label: t('resume.sections.experience') })}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAdd}
              className="rounded-none border-black"
            >
              <Plus className="w-4 h-4 mr-2" /> {t('builder.forms.experience.addFirstJob')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
