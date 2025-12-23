import React from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AdditionalInfo } from '@/components/dashboard/resume-component';

interface AdditionalFormProps {
    data: AdditionalInfo;
    onChange: (data: AdditionalInfo) => void;
}

export const AdditionalForm: React.FC<AdditionalFormProps> = ({ data, onChange }) => {
    // Helper to handle array conversions (text -> string[])
    const handleArrayChange = (field: keyof AdditionalInfo, value: string) => {
        // Split by newlines or commas
        const items = value.split('\n').filter(item => item.trim() !== '');
        onChange({
            ...data,
            [field]: items,
        });
    };

    const formatArray = (arr?: string[]) => {
        return arr?.join('\n') || '';
    };

    return (
        <div className="space-y-6 border border-black p-6 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
            <h3 className="font-serif text-xl font-bold border-b border-black pb-2 mb-4">Additional Information</h3>
            <p className="font-mono text-xs text-blue-700 mb-6 border-l-2 border-blue-700 pl-3">
                Enter items separated by new lines.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label htmlFor="technicalSkills" className="font-mono text-xs uppercase tracking-wider text-gray-500">Technical Skills</Label>
                    <Textarea
                        id="technicalSkills"
                        value={formatArray(data.technicalSkills)}
                        onChange={(e) => handleArrayChange('technicalSkills', e.target.value)}
                        placeholder="React&#10;TypeScript&#10;Node.js"
                        className="min-h-[120px] text-black rounded-none border-black bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="languages" className="font-mono text-xs uppercase tracking-wider text-gray-500">Languages</Label>
                    <Textarea
                        id="languages"
                        value={formatArray(data.languages)}
                        onChange={(e) => handleArrayChange('languages', e.target.value)}
                        placeholder="English&#10;Spanish"
                        className="min-h-[120px] text-black rounded-none border-black bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="certifications" className="font-mono text-xs uppercase tracking-wider text-gray-500">Certifications</Label>
                    <Textarea
                        id="certifications"
                        value={formatArray(data.certificationsTraining)}
                        onChange={(e) => handleArrayChange('certificationsTraining', e.target.value)}
                        placeholder="AWS Solution Architect&#10;Google Analytics"
                        className="min-h-[120px] text-black rounded-none border-black bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="awards" className="font-mono text-xs uppercase tracking-wider text-gray-500">Awards</Label>
                    <Textarea
                        id="awards"
                        value={formatArray(data.awards)}
                        onChange={(e) => handleArrayChange('awards', e.target.value)}
                        placeholder="Employee of the Month&#10;Hackathon Winner"
                        className="min-h-[120px] text-black rounded-none border-black bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700"
                    />
                </div>
            </div>
        </div>
    );
};
