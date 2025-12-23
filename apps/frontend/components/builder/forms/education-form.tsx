import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Education } from '@/components/dashboard/resume-component';
import { Plus, Trash2 } from 'lucide-react';

interface EducationFormProps {
    data: Education[];
    onChange: (data: Education[]) => void;
}

export const EducationForm: React.FC<EducationFormProps> = ({ data, onChange }) => {
    const handleAdd = () => {
        const newId = Math.max(...data.map(d => d.id), 0) + 1;
        onChange([
            ...data,
            {
                id: newId,
                institution: '',
                degree: '',
                years: '',
                description: '',
            }
        ]);
    };

    const handleRemove = (id: number) => {
        onChange(data.filter(item => item.id !== id));
    };

    const handleChange = (id: number, field: keyof Education, value: any) => {
        onChange(data.map(item => {
            if (item.id === id) {
                return { ...item, [field]: value };
            }
            return item;
        }));
    };

    return (
        <div className="space-y-6 border border-black p-6 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
            <div className="flex justify-between items-center border-b border-black pb-2 mb-4">
                <h3 className="font-serif text-xl font-bold">Education</h3>
                <Button variant="outline" size="sm" onClick={handleAdd} className="rounded-none border-black hover:bg-black hover:text-white transition-colors">
                    <Plus className="w-4 h-4 mr-2" /> Add School
                </Button>
            </div>
            
            <div className="space-y-8">
                {data.map((item) => (
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
                                <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">Institution</Label>
                                <Input
                                    value={item.institution || ''}
                                    onChange={(e) => handleChange(item.id, 'institution', e.target.value)}
                                    placeholder="University Name"
                                    className="rounded-none border-black bg-white"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">Degree</Label>
                                <Input
                                    value={item.degree || ''}
                                    onChange={(e) => handleChange(item.id, 'degree', e.target.value)}
                                    placeholder="Bachelor of Science"
                                    className="rounded-none border-black bg-white"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">Years</Label>
                                <Input
                                    value={item.years || ''}
                                    onChange={(e) => handleChange(item.id, 'years', e.target.value)}
                                    placeholder="2016 - 2020"
                                    className="rounded-none border-black bg-white"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">Description (Optional)</Label>
                            <Textarea
                                value={item.description || ''}
                                onChange={(e) => handleChange(item.id, 'description', e.target.value)}
                                className="min-h-[60px] text-black text-sm rounded-none border-black bg-white"
                                placeholder="Additional details..."
                            />
                        </div>
                    </div>
                ))}
                
                {data.length === 0 && (
                    <div className="text-center py-12 bg-gray-50 border border-dashed border-black">
                        <p className="font-mono text-sm text-gray-500 mb-4">// NO EDUCATION ENTRIES</p>
                        <Button variant="outline" size="sm" onClick={handleAdd} className="rounded-none border-black">
                            <Plus className="w-4 h-4 mr-2" /> Add First School
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};
