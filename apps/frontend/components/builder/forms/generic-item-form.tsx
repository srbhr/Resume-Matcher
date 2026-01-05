import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2 } from 'lucide-react';
import type { CustomSectionItem } from '@/components/dashboard/resume-component';

interface GenericItemFormProps {
  items: CustomSectionItem[];
  onChange: (items: CustomSectionItem[]) => void;
  itemLabel?: string;
  addLabel?: string;
  showSubtitle?: boolean;
  showLocation?: boolean;
  showYears?: boolean;
  titlePlaceholder?: string;
  subtitlePlaceholder?: string;
  locationPlaceholder?: string;
  yearsPlaceholder?: string;
  descriptionPlaceholder?: string;
}

/**
 * Generic Item Form Component
 *
 * Used for ITEM_LIST type sections (like Experience, Education, Projects).
 * Renders a list of items with configurable fields.
 */
export const GenericItemForm: React.FC<GenericItemFormProps> = ({
  items,
  onChange,
  itemLabel = 'Item',
  addLabel = 'Add Item',
  showSubtitle = true,
  showLocation = true,
  showYears = true,
  titlePlaceholder = 'Title',
  subtitlePlaceholder = 'Organization',
  locationPlaceholder = 'Location',
  yearsPlaceholder = '2020 - Present',
  descriptionPlaceholder = 'Describe your contribution...',
}) => {
  const handleAdd = () => {
    const newId = Math.max(...items.map((d) => d.id), 0) + 1;
    onChange([
      ...items,
      {
        id: newId,
        title: '',
        subtitle: '',
        location: '',
        years: '',
        description: [''],
      },
    ]);
  };

  const handleRemove = (id: number) => {
    onChange(items.filter((item) => item.id !== id));
  };

  const handleChange = (id: number, field: keyof CustomSectionItem, value: string | string[]) => {
    onChange(
      items.map((item) => {
        if (item.id === id) {
          return { ...item, [field]: value };
        }
        return item;
      })
    );
  };

  const handleDescriptionChange = (id: number, index: number, value: string) => {
    onChange(
      items.map((item) => {
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
      items.map((item) => {
        if (item.id === id) {
          return { ...item, description: [...(item.description || []), ''] };
        }
        return item;
      })
    );
  };

  const handleRemoveDescription = (id: number, index: number) => {
    onChange(
      items.map((item) => {
        if (item.id === id) {
          const newDesc = [...(item.description || [])];
          newDesc.splice(index, 1);
          return { ...item, description: newDesc };
        }
        return item;
      })
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleAdd}
          className="rounded-none border-black hover:bg-black hover:text-white transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" /> {addLabel}
        </Button>
      </div>

      <div className="space-y-8">
        {items.map((item) => (
          <div key={item.id} className="p-6 border border-black bg-gray-50 relative group">
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
                  Title
                </Label>
                <Input
                  value={item.title || ''}
                  onChange={(e) => handleChange(item.id, 'title', e.target.value)}
                  placeholder={titlePlaceholder}
                  className="rounded-none border-black bg-white"
                />
              </div>
              {showSubtitle && (
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
                    Organization
                  </Label>
                  <Input
                    value={item.subtitle || ''}
                    onChange={(e) => handleChange(item.id, 'subtitle', e.target.value)}
                    placeholder={subtitlePlaceholder}
                    className="rounded-none border-black bg-white"
                  />
                </div>
              )}
              {showLocation && (
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
                    Location
                  </Label>
                  <Input
                    value={item.location || ''}
                    onChange={(e) => handleChange(item.id, 'location', e.target.value)}
                    placeholder={locationPlaceholder}
                    className="rounded-none border-black bg-white"
                  />
                </div>
              )}
              {showYears && (
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
                    Years
                  </Label>
                  <Input
                    value={item.years || ''}
                    onChange={(e) => handleChange(item.id, 'years', e.target.value)}
                    placeholder={yearsPlaceholder}
                    className="rounded-none border-black bg-white"
                  />
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
                  Description Points
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAddDescription(item.id)}
                  className="h-6 text-xs text-blue-700 hover:text-blue-800 hover:bg-blue-50"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add Point
                </Button>
              </div>
              {item.description?.map((desc, idx) => (
                <div key={idx} className="flex gap-2">
                  <Textarea
                    value={desc}
                    onChange={(e) => handleDescriptionChange(item.id, idx, e.target.value)}
                    className="min-h-[60px] text-black text-sm rounded-none border-black bg-white"
                    placeholder={descriptionPlaceholder}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveDescription(item.id, idx)}
                    className="h-[60px] w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div className="text-center py-12 bg-gray-50 border border-dashed border-black">
            <p className="font-mono text-sm text-gray-500 mb-4">{`// NO ${itemLabel.toUpperCase()} ENTRIES`}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAdd}
              className="rounded-none border-black"
            >
              <Plus className="w-4 h-4 mr-2" /> Add First {itemLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
