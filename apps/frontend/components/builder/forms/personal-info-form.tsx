import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PersonalInfo } from '@/components/dashboard/resume-component';

interface PersonalInfoFormProps {
    data: PersonalInfo;
    onChange: (data: PersonalInfo) => void;
}

export const PersonalInfoForm: React.FC<PersonalInfoFormProps> = ({ data, onChange }) => {
    const handleChange = (field: keyof PersonalInfo, value: string) => {
        onChange({
            ...data,
            [field]: value,
        });
    };

    return (
        <div className="space-y-4 border border-black p-6 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
            <h3 className="font-serif text-xl font-bold border-b border-black pb-2 mb-4">Personal Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="name" className="font-mono text-xs uppercase tracking-wider text-gray-500">Full Name</Label>
                    <Input
                        id="name"
                        value={data.name || ''}
                        onChange={(e) => handleChange('name', e.target.value)}
                        placeholder="John Doe"
                        className="rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="title" className="font-mono text-xs uppercase tracking-wider text-gray-500">Professional Title</Label>
                    <Input
                        id="title"
                        value={data.title || ''}
                        onChange={(e) => handleChange('title', e.target.value)}
                        placeholder="Software Engineer"
                         className="rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="email" className="font-mono text-xs uppercase tracking-wider text-gray-500">Email</Label>
                    <Input
                        id="email"
                        type="email"
                        value={data.email || ''}
                        onChange={(e) => handleChange('email', e.target.value)}
                        placeholder="john@example.com"
                         className="rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="phone" className="font-mono text-xs uppercase tracking-wider text-gray-500">Phone</Label>
                    <Input
                        id="phone"
                        type="tel"
                        value={data.phone || ''}
                        onChange={(e) => handleChange('phone', e.target.value)}
                        placeholder="+1 (555) 000-0000"
                         className="rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="location" className="font-mono text-xs uppercase tracking-wider text-gray-500">Location</Label>
                    <Input
                        id="location"
                        value={data.location || ''}
                        onChange={(e) => handleChange('location', e.target.value)}
                        placeholder="City, Country"
                         className="rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="website" className="font-mono text-xs uppercase tracking-wider text-gray-500">Website</Label>
                    <Input
                        id="website"
                        value={data.website || ''}
                        onChange={(e) => handleChange('website', e.target.value)}
                        placeholder="portfolio.com"
                         className="rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="linkedin" className="font-mono text-xs uppercase tracking-wider text-gray-500">LinkedIn</Label>
                    <Input
                        id="linkedin"
                        value={data.linkedin || ''}
                        onChange={(e) => handleChange('linkedin', e.target.value)}
                        placeholder="linkedin.com/in/john"
                         className="rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="github" className="font-mono text-xs uppercase tracking-wider text-gray-500">GitHub</Label>
                    <Input
                        id="github"
                        value={data.github || ''}
                        onChange={(e) => handleChange('github', e.target.value)}
                        placeholder="github.com/john"
                         className="rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
                    />
                </div>
            </div>
        </div>
    );
};
