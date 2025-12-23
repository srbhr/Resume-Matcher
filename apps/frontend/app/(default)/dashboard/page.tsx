'use client';

import { SwissGrid } from '@/components/home/swiss-grid';
import { ResumeUploadDialog } from '@/components/dashboard/resume-upload-dialog';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

export default function DashboardPage() {
    const [masterResumeId, setMasterResumeId] = useState<string | null>(null);
    const router = useRouter();

    // The physics class from your Hero, adapted for cards
    const cardWrapperClass = "bg-[#F0F0E8] p-8 md:p-12 h-full transition-all duration-200 ease-in-out hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[6px_6px_0px_0px_#000000] cursor-pointer group relative flex flex-col";

    useEffect(() => {
        const storedId = localStorage.getItem('master_resume_id');
        if (storedId) setMasterResumeId(storedId);
    }, []);

    const handleUploadComplete = (resumeId: string) => {
        localStorage.setItem('master_resume_id', resumeId);
        setMasterResumeId(resumeId);
    };

    const handleClearMaster = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent navigation
        if (confirm('Are you sure you want to remove your master resume?')) {
            localStorage.removeItem('master_resume_id');
            setMasterResumeId(null);
        }
    };

    return (
        <SwissGrid>
            {/* 1. Master Resume Logic */}
            {!masterResumeId ? (
                // Upload State - Pass the card as the trigger
                <ResumeUploadDialog 
                    onUploadComplete={handleUploadComplete}
                    trigger={
                        <div className={`${cardWrapperClass} hover:bg-blue-700 hover:text-[#F0F0E8]`}>
                            <div className="flex-1 flex flex-col justify-between pointer-events-none">
                                <div className="w-12 h-12 border-2 border-current rounded-full flex items-center justify-center mb-4">
                                    <span className="text-2xl leading-none relative top-[-2px]">+</span>
                                </div>
                                <div>
                                    <h3 className="font-mono text-xl font-bold uppercase">Upload Master Resume</h3>
                                    <p className="font-mono text-xs mt-2 opacity-60 group-hover:opacity-100">// Initialize Sequence</p>
                                </div>
                            </div>
                        </div>
                    }
                />
            ) : (
                // Master Resume Exists - Click to Tailor
                <div 
                    onClick={() => router.push(`/tailor`)}
                    className={cardWrapperClass}
                >
                    <div className="flex-1 flex flex-col h-full">
                         <div className="flex justify-between items-start mb-6">
                            <div className="w-12 h-12 border-2 border-black bg-blue-700 text-white flex items-center justify-center">
                                <span className="font-mono font-bold">M</span>
                            </div>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 hover:bg-red-100 hover:text-red-600 z-10 rounded-none"
                                onClick={handleClearMaster}
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>

                        <h3 className="font-bold text-lg font-serif leading-tight group-hover:text-blue-700">
                            Master Resume
                        </h3>
                        <p className="text-xs font-mono text-gray-500 mt-auto pt-4 group-hover:text-black">
                            STATUS: READY TO TAILOR
                        </p>
                    </div>
                </div>
            )}

            {/* 2. Fillers (Static, no hover effect, just structure) */}
            {[1, 2, 3].map((i) => (
                <div key={i} className="hidden md:block bg-[#F0F0E8] h-full min-h-[300px] opacity-50 pointer-events-none"></div>
            ))}
        </SwissGrid>
    );
}