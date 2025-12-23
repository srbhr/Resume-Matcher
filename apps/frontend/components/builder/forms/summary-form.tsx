import React from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface SummaryFormProps {
    value: string;
    onChange: (value: string) => void;
}

export const SummaryForm: React.FC<SummaryFormProps> = ({ value, onChange }) => {
    return (
        <div className="space-y-4 border border-black p-6 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
            <h3 className="font-serif text-xl font-bold border-b border-black pb-2 mb-4">Professional Summary</h3>
            <div className="space-y-2">
                <Label htmlFor="summary" className="font-mono text-xs uppercase tracking-wider text-gray-500">Summary</Label>
                <Textarea
                    id="summary"
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Briefly describe your professional background..."
                    className="min-h-[150px] text-black rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
                />
            </div>
        </div>
    );
};
