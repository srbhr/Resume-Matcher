'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import Resume, { ResumeData } from '@/components/dashboard/resume-component';
import { fetchResume } from '@/lib/api/resume';
import { ArrowLeft, Edit, Plus, Loader2 } from 'lucide-react';

export default function ResumeViewerPage() {
    const params = useParams();
    const router = useRouter();
    const [resumeData, setResumeData] = useState<ResumeData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const resumeId = params?.id as string;

    useEffect(() => {
        if (!resumeId) return;

        const loadResume = async () => {
            try {
                setLoading(true);
                const data = await fetchResume(resumeId);
                
                // Parse the content if it's a string, otherwise use as is if it's already an object
                // The API type suggests content is string, but let's be safe
                let parsedContent: ResumeData;
                if (typeof data.raw_resume.content === 'string') {
                    parsedContent = JSON.parse(data.raw_resume.content);
                } else {
                    parsedContent = data.raw_resume.content;
                }
                
                setResumeData(parsedContent);
            } catch (err) {
                console.error('Failed to load resume:', err);
                setError('Failed to load resume data.');
            } finally {
                setLoading(false);
            }
        };

        loadResume();
    }, [resumeId]);

    const handleEdit = () => {
        router.push(`/builder?id=${resumeId}`);
    };

    const handleCreateResume = () => {
        router.push('/tailor');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#F0F0E8]">
                <Loader2 className="w-10 h-10 animate-spin text-blue-700 mb-4" />
                <p className="font-mono text-sm font-bold uppercase text-blue-700">Loading Resume...</p>
            </div>
        );
    }

    if (error || !resumeData) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#F0F0E8] p-4">
                <div className="bg-red-50 border border-red-200 p-6 text-center max-w-md shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
                    <p className="text-red-700 font-bold mb-4">{error || 'Resume not found'}</p>
                    <Button onClick={() => router.push('/dashboard')} variant="outline" className="border-red-200 hover:bg-red-100 text-red-700">
                        Return to Dashboard
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F0F0E8] py-12 px-4 md:px-8">
            <div className="max-w-7xl mx-auto">
                {/* Header Actions */}
                <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <Button 
                        variant="ghost" 
                        onClick={() => router.push('/dashboard')}
                        className="pl-0 hover:bg-transparent hover:text-blue-700 gap-2"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Dashboard
                    </Button>

                    <div className="flex gap-3">
                        <Button 
                            onClick={handleEdit}
                            variant="outline"
                            className="border-black rounded-none shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
                        >
                            <Edit className="w-4 h-4 mr-2" />
                            Edit Resume
                        </Button>
                        <Button 
                            onClick={handleCreateResume}
                            className="bg-blue-700 hover:bg-blue-800 text-white rounded-none border border-black shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Create Resume
                        </Button>
                    </div>
                </div>

                {/* Resume Viewer */}
                <div className="flex justify-center">
                    <div className="w-full max-w-[210mm] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)] border border-black bg-white">
                        <div className="p-8 md:p-12">
                             <Resume resumeData={resumeData} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

