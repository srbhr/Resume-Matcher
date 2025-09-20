"use client";

import { create } from 'zustand';
import { WorkExperienceEntry, EducationEntry } from '@/types/resume-schema';

interface Personal {
  name: string;
  email: string;
  phone: string;
  title: string;
}

interface ResumeData {
  personal: Personal;
  experience: WorkExperienceEntry[];
  education: EducationEntry[];
  skills: string[];
}

interface ResumeStore {
  resumeData: ResumeData;
  updatePersonal: (field: keyof Personal, value: string) => void;
  updateExperience: (index: number, field: keyof WorkExperienceEntry, value: any) => void;
  updateExperienceResponsibilities: (index: number, responsibilities: string[]) => void;
  updateEducation: (index: number, field: keyof EducationEntry, value: any) => void;
  updateSkills: (skills: string[]) => void;
}

const useResumeStore = create<ResumeStore>((set) => ({
  resumeData: {
    personal: { name: '', email: '', phone: '', title: '' },
    experience: [],
    education: [],
    skills: []
  },
  updatePersonal: (field, value) => set((state) => ({
    resumeData: {
      ...state.resumeData,
      personal: { ...state.resumeData.personal, [field]: value }
    }
  })),
  updateExperience: (index, field, value) => set((state) => {
    const newExp = [...state.resumeData.experience];
    newExp[index] = { ...newExp[index], [field]: value };
    return { resumeData: { ...state.resumeData, experience: newExp }};
  }),
  updateExperienceResponsibilities: (index, responsibilities) => set((state) => {
    const newExp = [...state.resumeData.experience];
    newExp[index] = { ...newExp[index], responsibilities };
    return { resumeData: { ...state.resumeData, experience: newExp }};
  }),
  updateEducation: (index, field, value) => set((state) => {
    const newEdu = [...state.resumeData.education];
    newEdu[index] = { ...newEdu[index], [field]: value };
    return { resumeData: { ...state.resumeData, education: newEdu }};
  }),
  updateSkills: (skills) => set((state) => ({
    resumeData: {
      ...state.resumeData,
      skills
    }
  })),
}));

export default useResumeStore;
