'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface PersonalInfo {
    name: string;
    title?: string;
    email: string;
    phone: string;
    location: string;
    website?: string;
    linkedin?: string;
    github?: string;
}

export interface ExperienceEntry {
    id: number;
    title: string;
    company: string;
    location?: string;
    years?: string;
    description: string[];
}

export interface EducationEntry {
    id: number;
    institution: string;
    degree: string;
    years?: string;
    description?: string;
}

export interface ProjectEntry {
    id: number;
    name: string;
    role?: string;
    years?: string;
    description: string[];
}

export interface AdditionalInfo {
    technicalSkills: string[];
    languages: string[];
    certificationsTraining: string[];
    awards: string[];
}

export interface SkillComparisonEntry {
    skill: string;
    resume_mentions: number;
    job_mentions: number;
}

export interface ResumePreview {
    personalInfo: PersonalInfo;
    summary?: string;
    workExperience: ExperienceEntry[];
    education: EducationEntry[];
    personalProjects: ProjectEntry[];
    additional: AdditionalInfo;
}

export interface Data {
    request_id: string;
    resume_id: string;
    job_id: string;
    original_score: number;
    new_score: number;
    resume_preview: ResumePreview;
    details?: string;
    commentary?: string;
    improvements?: {
        suggestion: string;
        lineNumber?: string | number;
    }[];
    original_resume_markdown?: string;
    updated_resume_markdown?: string;
    job_description?: string;
    job_keywords?: string;
    skill_comparison?: SkillComparisonEntry[];
}

export interface ImprovedResult {
    data: Data;
}

interface ContextValue {
    improvedData: ImprovedResult | null;
    setImprovedData: (data: ImprovedResult) => void;
}

const ResumePreviewContext = createContext<ContextValue | undefined>(undefined);

export function ResumePreviewProvider({ children }: { children: ReactNode }) {
    const [improvedData, setImprovedData] = useState<ImprovedResult | null>(null);
    return (
        <ResumePreviewContext.Provider value={{ improvedData, setImprovedData }}>
            {children}
        </ResumePreviewContext.Provider>
    );
}

export function useResumePreview(): ContextValue {
    const ctx = useContext(ResumePreviewContext);
    if (!ctx) throw new Error('useResumePreview must be used within ResumePreviewProvider');
    return ctx;
}
