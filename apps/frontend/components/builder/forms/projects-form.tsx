import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Project } from '@/components/dashboard/resume-component';
import { Plus, Trash2 } from 'lucide-react';

interface ProjectsFormProps {
    data: Project[];
    onChange: (data: Project[]) => void;
}

export const ProjectsForm: React.FC<ProjectsFormProps> = ({ data, onChange }) => {
    const handleAdd = () => {
        const newId = Math.max(...data.map(d => d.id), 0) + 1;
        onChange([
            ...data,
            {
                id: newId,
                name: '',
                role: '',
                years: '',
                description: [''],
            }
        ]);
    };

    const handleRemove = (id: number) => {
        onChange(data.filter(item => item.id !== id));
    };

    const handleChange = (id: number, field: keyof Project, value: any) => {
        onChange(data.map(item => {
            if (item.id === id) {
                return { ...item, [field]: value };
            }
            return item;
        }));
    };

    const handleDescriptionChange = (id: number, index: number, value: string) => {
        onChange(data.map(item => {
            if (item.id === id) {
                const newDesc = [...(item.description || [])];
                newDesc[index] = value;
                return { ...item, description: newDesc };
            }
            return item;
        }));
    };

    const handleAddDescription = (id: number) => {
        onChange(data.map(item => {
            if (item.id === id) {
                return { ...item, description: [...(item.description || []), ''] };
            }
            return item;
        }));
    };

    const handleRemoveDescription = (id: number, index: number) => {
        onChange(data.map(item => {
            if (item.id === id) {
                const newDesc = [...(item.description || [])];
                newDesc.splice(index, 1);
                return { ...item, description: newDesc };
            }
            return item;
        }));
    };

    return (
        <div className="space-y-6 border border-black p-6 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
            <div className="flex justify-between items-center border-b border-black pb-2 mb-4">
                <h3 className="font-serif text-xl font-bold">Personal Projects</h3>
                <Button variant="outline" size="sm" onClick={handleAdd} className="rounded-none border-black hover:bg-black hover:text-white transition-colors">
                    <Plus className="w-4 h-4 mr-2" /> Add Project
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
                                <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">Project Name</Label>
                                <Input
                                    value={item.name || ''}
                                    onChange={(e) => handleChange(item.id, 'name', e.target.value)}
                                    placeholder="Resume Matcher"
                                    className="rounded-none border-black bg-white"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">Role</Label>
                                <Input
                                    value={item.role || ''}
                                    onChange={(e) => handleChange(item.id, 'role', e.target.value)}
                                    placeholder="Creator"
                                    className="rounded-none border-black bg-white"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">Years</Label>
                                <Input
                                    value={item.years || ''}
                                    onChange={(e) => handleChange(item.id, 'years', e.target.value)}
                                    placeholder="2023"
                                    className="rounded-none border-black bg-white"
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">Description Points</Label>
                                <Button variant="ghost" size="sm" onClick={() => handleAddDescription(item.id)} className="h-6 text-xs text-blue-700 hover:text-blue-800 hover:bg-blue-50">
                                    <Plus className="w-3 h-3 mr-1" /> Add Point
                                </Button>
                            </div>
                            {item.description?.map((desc, idx) => (
                                <div key={idx} className="flex gap-2">
                                    <Textarea
                                        value={desc}
                                        onChange={(e) => handleDescriptionChange(item.id, idx, e.target.value)}
                                        className="min-h-[60px] text-black text-sm rounded-none border-black bg-white"
                                        placeholder="Project detail..."
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
                
                {data.length === 0 && (
                    <div className="text-center py-12 bg-gray-50 border border-dashed border-black">
                        <p className="font-mono text-sm text-gray-500 mb-4">// NO PROJECTS ENTRIES</p>
                        <Button variant="outline" size="sm" onClick={handleAdd} className="rounded-none border-black">
                            <Plus className="w-4 h-4 mr-2" /> Add First Project
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};
