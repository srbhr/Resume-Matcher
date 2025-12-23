'use client';

import React, { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Resume, { ResumeData } from '@/components/dashboard/resume-component';
import { ResumeForm } from './resume-form';
import { Button } from '@/components/ui/button';
import { Download, Save, Upload } from 'lucide-react';
import { useResumePreview } from '@/components/common/resume_previewer_context';
import { fetchResume } from '@/lib/api/resume';

const INITIAL_DATA: ResumeData = {
    personalInfo: {
        name: 'Your Name',
        title: 'Professional Title',
        email: 'email@example.com',
        phone: '+1 234 567 890',
        location: 'City, Country',
        website: 'portfolio.com',
        linkedin: 'linkedin.com/in/you',
        github: 'github.com/you',
    },
    summary: 'A brief summary of your professional background and key achievements.',
    workExperience: [],
    education: [],
    personalProjects: [],
    additional: {
        technicalSkills: [],
        languages: [],
        certificationsTraining: [],
        awards: [],
    },
};

const ResumeBuilderContent = () => {
    const [resumeData, setResumeData] = useState<ResumeData>(INITIAL_DATA);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { improvedData } = useResumePreview();
    const searchParams = useSearchParams();
    const resumeId = searchParams.get('id');

    useEffect(() => {
        // Priority 1: Improved Data from Context (Tailor Flow)
        if (improvedData?.data?.resume_preview) {
            console.log('Applying improved resume data:', improvedData.data.resume_preview);
            setResumeData(improvedData.data.resume_preview);
            return;
        }

        // Priority 2: Fetch from API if ID is in URL (Edit Mode)
        if (resumeId) {
            const loadResume = async () => {
                try {
                    const data = await fetchResume(resumeId);
                    let parsedContent: ResumeData;
                    if (typeof data.raw_resume.content === 'string') {
                        parsedContent = JSON.parse(data.raw_resume.content);
                    } else {
                        parsedContent = data.raw_resume.content;
                    }
                    setResumeData(parsedContent);
                } catch (err) {
                    console.error('Failed to load resume:', err);
                }
            };
            loadResume();
        }
    }, [improvedData, resumeId]);

    const handleUpdate = (newData: ResumeData) => {
        setResumeData(newData);
    };

    const handleSave = () => {
        console.log('Saving resume data:', resumeData);
        alert('Save functionality coming soon!');
    };

    const handleExport = () => {
        const dataStr = JSON.stringify(resumeData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const exportFileDefaultName = 'resume-data.json';
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const fileObj = event.target.files && event.target.files[0];
        if (!fileObj) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result;
            if (typeof text === 'string') {
                try {
                    const parsedData = JSON.parse(text);
                    setResumeData(parsedData);
                } catch (error) {
                    console.error('Error parsing JSON:', error);
                    alert('Invalid JSON file');
                }
            }
        };
        reader.readAsText(fileObj);
        event.target.value = '';
    };

    return (
        <div 
            className="min-h-screen w-full bg-[#F0F0E8] flex justify-center items-start py-12 px-4 md:px-8"
            style={{
                backgroundImage: 'linear-gradient(rgba(29, 78, 216, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.1) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
            }}
        >
            {/* Main Container */}
            <div className="w-full max-w-[90%] md:max-w-[95%] xl:max-w-[1800px] border border-black bg-[#F0F0E8] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)] flex flex-col">
                
                {/* Header Section */}
                <div className="border-b border-black p-8 md:p-12 flex flex-col md:flex-row justify-between items-start md:items-center bg-[#F0F0E8]">
                    <div>
                        <h1 className="font-serif text-4xl md:text-6xl text-black tracking-tight leading-[0.95] uppercase">
                            Resume Builder
                        </h1>
                        <p className="mt-4 text-sm font-mono text-blue-700 uppercase tracking-wide font-bold">
                            // {resumeId ? 'EDIT MODE' : 'CREATE & PREVIEW'}
                        </p>
                    </div>
                    
                    <div className="flex gap-3 mt-6 md:mt-0">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            className="hidden"
                            accept=".json"
                        />
                        <Button variant="outline" size="sm" onClick={handleImportClick} className="border-black rounded-none shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all">
                            <Upload className="w-4 h-4 mr-2" />
                            Import JSON
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleExport} className="border-black rounded-none shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all">
                            <Download className="w-4 h-4 mr-2" />
                            Export JSON
                        </Button>
                        <Button size="sm" onClick={handleSave} className="bg-blue-700 hover:bg-blue-800 text-white rounded-none border border-black shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all">
                            <Save className="w-4 h-4 mr-2" />
                            Save
                        </Button>
                    </div>
                </div>

                {/* Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 bg-black gap-[1px]">
                    
                    {/* Left Panel: Editor */}
                    <div className="bg-[#F0F0E8] p-6 md:p-8 h-[calc(100vh-250px)] overflow-y-auto">
                        <div className="max-w-3xl mx-auto space-y-8">
                             <div className="flex items-center gap-2 border-b-2 border-black pb-2 mb-6">
                                <div className="w-3 h-3 bg-blue-700"></div>
                                <h2 className="font-mono text-lg font-bold uppercase tracking-wider">Editor Panel</h2>
                            </div>
                            <ResumeForm resumeData={resumeData} onUpdate={handleUpdate} />
                        </div>
                    </div>

                    {/* Right Panel: Preview */}
                    <div className="bg-[#E5E5E0] p-6 md:p-8 h-[calc(100vh-250px)] overflow-y-auto relative flex flex-col items-center">
                         <div className="w-full max-w-3xl mb-6 flex items-center gap-2 border-b-2 border-gray-400 pb-2">
                             <div className="w-3 h-3 bg-gray-600"></div>
                            <h2 className="font-mono text-lg font-bold text-gray-600 uppercase tracking-wider">Live Preview</h2>
                        </div>
                        <div className="w-full max-w-[210mm] shadow-2xl">
                             {/* Resume component scale wrapper */}
                             <div className="origin-top scale-[0.8] md:scale-100">
                                <Resume resumeData={resumeData} />
                             </div>
                        </div>
                    </div>

                </div>

                 {/* Footer */}
                <div className="p-4 bg-[#F0F0E8] flex justify-between items-center font-mono text-xs text-blue-700 border-t border-black">
                    <span className="uppercase font-bold">Resume Builder Module</span>
                    <span>Ready to Process</span>
                </div>
            </div>
        </div>
    );
};

export const ResumeBuilder = () => {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <ResumeBuilderContent />
        </Suspense>
    );
};
