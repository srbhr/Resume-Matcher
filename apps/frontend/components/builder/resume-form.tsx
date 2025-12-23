import React from 'react';
import { ResumeData, PersonalInfo, Experience, Education, Project, AdditionalInfo } from '@/components/dashboard/resume-component';
import { PersonalInfoForm } from './forms/personal-info-form';
import { SummaryForm } from './forms/summary-form';
import { ExperienceForm } from './forms/experience-form';
import { EducationForm } from './forms/education-form';
import { ProjectsForm } from './forms/projects-form';
import { AdditionalForm } from './forms/additional-form';

interface ResumeFormProps {
    resumeData: ResumeData;
    onUpdate: (data: ResumeData) => void;
}

export const ResumeForm: React.FC<ResumeFormProps> = ({ resumeData, onUpdate }) => {
    
    const handlePersonalInfoChange = (newPersonalInfo: PersonalInfo) => {
        onUpdate({
            ...resumeData,
            personalInfo: newPersonalInfo,
        });
    };

    const handleSummaryChange = (newSummary: string) => {
        onUpdate({
            ...resumeData,
            summary: newSummary,
        });
    };

    const handleExperienceChange = (newExperience: Experience[]) => {
        onUpdate({
            ...resumeData,
            workExperience: newExperience,
        });
    };

    const handleEducationChange = (newEducation: Education[]) => {
        onUpdate({
            ...resumeData,
            education: newEducation,
        });
    };

    const handleProjectsChange = (newProjects: Project[]) => {
        onUpdate({
            ...resumeData,
            personalProjects: newProjects,
        });
    };

    const handleAdditionalChange = (newAdditional: AdditionalInfo) => {
        onUpdate({
            ...resumeData,
            additional: newAdditional,
        });
    };

    return (
        <div className="space-y-6 pb-20">
            <PersonalInfoForm 
                data={resumeData.personalInfo || {}} 
                onChange={handlePersonalInfoChange} 
            />
            
            <SummaryForm 
                value={resumeData.summary || ''} 
                onChange={handleSummaryChange} 
            />

            <ExperienceForm 
                data={resumeData.workExperience || []} 
                onChange={handleExperienceChange} 
            />

            <EducationForm 
                data={resumeData.education || []} 
                onChange={handleEducationChange} 
            />

            <ProjectsForm 
                data={resumeData.personalProjects || []} 
                onChange={handleProjectsChange} 
            />

            <AdditionalForm 
                data={resumeData.additional || { 
                    technicalSkills: [], 
                    languages: [], 
                    certificationsTraining: [], 
                    awards: [] 
                }} 
                onChange={handleAdditionalChange} 
            />
        </div>
    );
};
