"use client";
import React from 'react';
import BackgroundContainer from '@/components/common/background-container';
import JobListings from '@/components/dashboard/job-listings';
import ResumeAnalysis from '@/components/dashboard/resume-analysis';
import Resume from '@/components/dashboard/resume-component';
import { useResumePreview } from '@/components/common/resume_previewer_context';
import { useTranslations } from 'next-intl';

interface AnalyzedJobData { title: string; company: string; location: string; }

const mockResumeData = { personalInfo: { name: 'Ada Lovelace', title: 'Software Engineer & Visionary', email: 'ada.lovelace@example.com', phone: '+1-234-567-8900', location: 'London, UK', website: 'analyticalengine.dev', linkedin: 'linkedin.com/in/adalovelace', github: 'github.com/adalovelace' }, summary: 'Pioneering computer programmer with a strong foundation in mathematics and analytical thinking.', experience: [{ id: 1, title: 'Collaborator & Algorithm Designer', company: "Charles Babbage's Analytical Engine Project", location: 'London, UK', years: '1842 - 1843', description: ['Developed the first published algorithm intended for a computer.', 'Translated Menabrea\'s memoir adding algorithmic notes.'] }], education: [{ id: 1, institution: 'Self-Taught', degree: 'Mathematics & Science', years: 'Early 19th Century', description: 'Extensive private tutoring.' }], skills: ['Algorithm Design','Analytical Thinking','Mathematical Modeling','Computational Theory','Technical Writing'] };

export default function DashboardPage() {
  const { improvedData } = useResumePreview();
  const t = useTranslations('DashboardPage');
  if (!improvedData) {
    return (
      <BackgroundContainer className="min-h-screen" innerClassName="bg-zinc-950">
        <div className="flex items-center justify-center h-full p-6 text-gray-400 text-sm">No improved resume found. Use Match first.</div>
      </BackgroundContainer>
    );
  }
  const { data } = improvedData; const { resume_preview, new_score } = data; const preview = resume_preview ?? mockResumeData; const newPct = Math.round(new_score * 100);
  const handleJobUpload = async (_text: string): Promise<AnalyzedJobData | null> => { alert('Job analysis not implemented yet.'); return null; };
  return (
    <BackgroundContainer className="min-h-screen" innerClassName="bg-zinc-950 backdrop-blur-sm overflow-auto">
      <div className="w-full h-full overflow-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto">
          <div className="mb-10">
            <h1 className="text-3xl font-semibold pb-2 text-white">{t('title')}</h1>
            <p className="text-gray-300 text-lg">{t('subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-8">
              <section><JobListings onUploadJob={handleJobUpload} /></section>
              <section><ResumeAnalysis score={newPct} details={improvedData.data.details ?? ''} commentary={improvedData.data.commentary ?? ''} improvements={improvedData.data.improvements ?? []} /></section>
            </div>
            <div className="md:col-span-2">
              <div className="bg-gray-900/70 backdrop-blur-sm p-6 rounded-lg shadow-xl h-full flex flex-col border border-gray-800/50">
                <div className="mb-6"><h2 className="text-2xl font-bold text-white">{t('yourResume')}</h2><p className="text-gray-400 text-sm">{t('resumeDescription')}</p></div>
                <div className="flex-grow overflow-auto"><Resume resumeData={preview} /></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </BackgroundContainer>
  );
}
