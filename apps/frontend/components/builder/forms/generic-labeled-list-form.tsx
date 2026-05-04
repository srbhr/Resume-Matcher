'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import type { LabeledListItem } from '@/components/dashboard/resume-component';
import { useTranslations } from '@/lib/i18n';

interface GenericLabeledListFormProps {
    items: LabeledListItem[];
    onChange: (items: LabeledListItem[]) => void;
    addLabel?: string;
    labelPlaceholder?: string;
    itemsPlaceholder?: string;
}

/**
 * Generic Labeled List Form Component
 *
 * Used for LABELED_LISTS type sections.
 * Renders a list of labeled subsections, each containing newline-separated items.
 * Example: "Technical Skills: Python, React" + "Languages: English, Spanish"
 */
export const GenericLabeledListForm: React.FC<GenericLabeledListFormProps> = ({
    items,
    onChange,
    addLabel,
    labelPlaceholder,
    itemsPlaceholder,
}) => {
    const { t } = useTranslations();

    const finalAddLabel = addLabel ?? t('builder.genericLabeledListForm.addSubsectionLabel');
    const finalLabelPlaceholder =
        labelPlaceholder ?? t('builder.genericLabeledListForm.labelPlaceholder');
    const finalItemsPlaceholder =
        itemsPlaceholder ?? t('builder.genericLabeledListForm.itemsPlaceholder');

    const handleAdd = () => {
        const newId = Math.max(...items.map((d) => d.id), 0) + 1;
        onChange([
            ...items,
            {
                id: newId,
                label: '',
                items: [],
            },
        ]);
    };

    const handleRemove = (id: number) => {
        onChange(items.filter((item) => item.id !== id));
    };

    const handleLabelChange = (id: number, newLabel: string) => {
        onChange(
            items.map((item) => {
                if (item.id === id) {
                    return { ...item, label: newLabel };
                }
                return item;
            })
        );
    };

    const handleItemsChange = (id: number, value: string) => {
        // Split by newlines, filter empty lines
        const newItems = value.split('\n').filter((item) => item.trim() !== '');
        onChange(
            items.map((item) => {
                if (item.id === id) {
                    return { ...item, items: newItems };
                }
                return item;
            })
        );
    };

    const handleMoveUp = (id: number) => {
        const index = items.findIndex((item) => item.id === id);
        if (index <= 0) return;

        const newItems = [...items];
        [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
        onChange(newItems);
    };

    const handleMoveDown = (id: number) => {
        const index = items.findIndex((item) => item.id === id);
        if (index >= items.length - 1) return;

        const newItems = [...items];
        [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
        onChange(newItems);
    };

    const formatItems = (arr?: string[]) => {
        return arr?.join('\n') || '';
    };

    // Explicitly allow Enter key to create newlines
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter') {
            e.stopPropagation();
        }
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
                    <Plus className="w-4 h-4 mr-2" /> {finalAddLabel}
                </Button>
            </div>

            <div className="space-y-6">
                {items.map((item, index) => (
                    <div key={item.id} className="p-6 border border-black bg-gray-50 relative group">
                        {/* Delete Button */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleRemove(item.id)}
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>

                        {/* Reorder Buttons */}
                        <div className="absolute top-2 right-14 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                disabled={index === 0}
                                className="h-8 w-8"
                                onClick={() => handleMoveUp(item.id)}
                            >
                                <ArrowUp className="w-3 h-3" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                disabled={index === items.length - 1}
                                className="h-8 w-8"
                                onClick={() => handleMoveDown(item.id)}
                            >
                                <ArrowDown className="w-3 h-3" />
                            </Button>
                        </div>

                        <div className="space-y-4 pr-20">
                            {/* Label Input */}
                            <div className="space-y-2">
                                <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
                                    {t('builder.genericLabeledListForm.fields.label')}
                                </Label>
                                <Input
                                    value={item.label}
                                    onChange={(e) => handleLabelChange(item.id, e.target.value)}
                                    placeholder={finalLabelPlaceholder}
                                    className="rounded-none border-black bg-white"
                                />
                            </div>

                            {/* Items Textarea */}
                            <div className="space-y-2">
                                <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
                                    {t('builder.genericLabeledListForm.fields.items')}
                                </Label>
                                <p className="font-mono text-xs text-blue-700 border-l-2 border-blue-700 pl-3 mb-2">
                                    {t('builder.additionalForm.instructions')}
                                </p>
                                <Textarea
                                    value={formatItems(item.items)}
                                    onChange={(e) => handleItemsChange(item.id, e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={finalItemsPlaceholder}
                                    className="min-h-[100px] text-black rounded-none border-black bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700"
                                />
                            </div>
                        </div>
                    </div>
                ))}

                {items.length === 0 && (
                    <div className="text-center py-12 bg-gray-50 border border-dashed border-black">
                        <p className="font-mono text-sm text-gray-500 mb-4">
                            {t('builder.genericLabeledListForm.noSubsections')}
                        </p>
                        <Button
                            variant="outline"
                            onClick={handleAdd}
                            className="rounded-none border-black hover:bg-black hover:text-white transition-colors"
                        >
                            <Plus className="w-4 h-4 mr-2" /> {finalAddLabel}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};
