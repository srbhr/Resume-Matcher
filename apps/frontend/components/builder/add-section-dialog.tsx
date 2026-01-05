'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, FileText, List, ListOrdered } from 'lucide-react';
import type { SectionType, SectionMeta } from '@/components/dashboard/resume-component';
import { getSectionTypeLabel } from '@/lib/utils/section-helpers';

interface AddSectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (displayName: string, sectionType: SectionType) => void;
}

type SelectableSectionType = Exclude<SectionType, 'personalInfo'>;

/**
 * AddSectionDialog Component
 *
 * Dialog for creating new custom sections.
 * Allows user to enter a name and select a section type.
 */
export const AddSectionDialog: React.FC<AddSectionDialogProps> = ({
  open,
  onOpenChange,
  onAdd,
}) => {
  const [displayName, setDisplayName] = useState('');
  const [sectionType, setSectionType] = useState<SelectableSectionType>('text');

  const handleSubmit = () => {
    if (displayName.trim()) {
      onAdd(displayName.trim(), sectionType);
      setDisplayName('');
      setSectionType('text');
      onOpenChange(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && displayName.trim()) {
      handleSubmit();
    }
  };

  const sectionTypes: {
    type: SelectableSectionType;
    label: string;
    icon: React.ReactNode;
    description: string;
  }[] = [
    {
      type: 'text',
      label: 'Text Block',
      icon: <FileText className="w-5 h-5" />,
      description: 'Single text area (like Summary)',
    },
    {
      type: 'itemList',
      label: 'Item List',
      icon: <ListOrdered className="w-5 h-5" />,
      description: 'Multiple entries with details (like Experience)',
    },
    {
      type: 'stringList',
      label: 'Skill List',
      icon: <List className="w-5 h-5" />,
      description: 'Simple list of items (like Skills)',
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] p-0 gap-0 rounded-none">
        <DialogHeader className="p-6 pb-4 border-b border-black">
          <DialogTitle className="font-serif text-xl font-bold uppercase tracking-tight">
            Add Custom Section
          </DialogTitle>
          <DialogDescription className="font-mono text-xs text-gray-600 mt-2">
            Create a new section for your resume with a custom name and type.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-6">
          {/* Section Name */}
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
              Section Name
            </Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g., Publications, Volunteer Work, Certifications"
              className="rounded-none border-black"
              autoFocus
            />
          </div>

          {/* Section Type */}
          <div className="space-y-3">
            <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
              Section Type
            </Label>
            <div className="space-y-2">
              {sectionTypes.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setSectionType(item.type)}
                  className={`w-full p-4 border text-left transition-colors ${
                    sectionType === item.type
                      ? 'border-black bg-gray-50 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 border ${
                        sectionType === item.type
                          ? 'border-black bg-white'
                          : 'border-gray-300 bg-gray-50'
                      }`}
                    >
                      {item.icon}
                    </div>
                    <div className="flex-1">
                      <div className="font-sans font-medium text-sm">{item.label}</div>
                      <div className="font-mono text-xs text-gray-500 mt-0.5">
                        {item.description}
                      </div>
                    </div>
                    {sectionType === item.type && (
                      <div className="w-4 h-4 border-2 border-black bg-black" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 bg-[#F0F0E8] border-t border-black flex-row justify-end gap-3">
          <DialogClose asChild>
            <Button variant="outline" className="rounded-none border-black">
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={!displayName.trim()} className="rounded-none">
            <Plus className="w-4 h-4 mr-2" />
            Add Section
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * AddSectionButton Component
 *
 * Button that triggers the AddSectionDialog.
 */
interface AddSectionButtonProps {
  onAdd: (displayName: string, sectionType: SectionType) => void;
}

export const AddSectionButton: React.FC<AddSectionButtonProps> = ({ onAdd }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="w-full rounded-none border-dashed border-2 border-black py-6 hover:bg-gray-50 hover:border-solid transition-all"
      >
        <Plus className="w-5 h-5 mr-2" />
        Add Custom Section
      </Button>
      <AddSectionDialog open={open} onOpenChange={setOpen} onAdd={onAdd} />
    </>
  );
};
