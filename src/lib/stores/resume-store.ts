"use client";

import React from 'react';
import { create } from 'zustand';
import { produce } from 'immer';
import { WorkExperienceEntry, EducationEntry, ProjectEntry } from '@/types/resume-schema';

// Local storage key
const RESUME_STORAGE_KEY = 'resume-matcher-data';

// Undo/Redo functionality
let history: ResumeData[] = [];
let historyIndex = -1;
const MAX_HISTORY = 10;

const saveToHistory = (data: ResumeData) => {
  // Remove any history after current index
  history = history.slice(0, historyIndex + 1);
  
  // Add new state
  history.push(JSON.parse(JSON.stringify(data)));
  historyIndex++;
  
  // Limit history size
  if (history.length > MAX_HISTORY) {
    history.shift();
    historyIndex--;
  }
};

// Helper functions for localStorage
const loadFromStorage = (): ResumeData | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(RESUME_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.warn('Failed to load resume data from localStorage:', error);
    return null;
  }
};

const saveToStorage = (data: ResumeData): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('Failed to save resume data to localStorage:', error);
  }
};

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
  projects: ProjectEntry[];
  skills: string[];
}

interface ResumeStore {
  resumeData: ResumeData;
  updatePersonal: (field: keyof Personal, value: string) => void;
  updateExperience: (index: number, field: keyof WorkExperienceEntry, value: any) => void;
  updateExperienceResponsibilities: (index: number, responsibilities: string[]) => void;
  updateEducation: (index: number, field: keyof EducationEntry, value: any) => void;
  updateProjects: (index: number, field: keyof ProjectEntry, value: any) => void;
  updateProjectTechnologies: (index: number, technologies: string[]) => void;
  updateProjectAchievements: (index: number, achievements: string[]) => void;
  updateSkills: (skills: string[]) => void;
  saveToStorage: () => void;
  manualSave: () => ResumeData;
  loadFromStorage: () => ResumeData | null;
  clearData: () => void;
}

const useResumeStore = create<ResumeStore>((set, get) => {
  // Load initial data from localStorage
  const initialData = loadFromStorage() || {
    personal: { name: '', email: '', phone: '', title: '' },
    experience: [],
    education: [],
    projects: [],
    skills: []
  };

  return {
    resumeData: initialData,

    updatePersonal: (field, value) => set(
      produce((state) => {
        state.resumeData.personal[field] = value;
      })
    ),
    updateExperience: (index, field, value) => set(
      produce((state) => {
        if (state.resumeData.experience[index]) {
          state.resumeData.experience[index][field] = value;
        }
      })
    ),
    updateExperienceResponsibilities: (index, responsibilities) => set(
      produce((state) => {
        if (state.resumeData.experience[index]) {
          state.resumeData.experience[index].responsibilities = responsibilities;
        }
      })
    ),
    updateEducation: (index, field, value) => set(
      produce((state) => {
        if (state.resumeData.education[index]) {
          state.resumeData.education[index][field] = value;
        }
      })
    ),
    updateProjects: (index, field, value) => set(
      produce((state) => {
        if (state.resumeData.projects[index]) {
          state.resumeData.projects[index][field] = value;
        }
      })
    ),
    updateProjectTechnologies: (index, technologies) => set(
      produce((state) => {
        if (state.resumeData.projects[index]) {
          state.resumeData.projects[index].technologies = technologies;
        }
      })
    ),
    updateProjectAchievements: (index, achievements) => set(
      produce((state) => {
        if (state.resumeData.projects[index]) {
          state.resumeData.projects[index].achievements = achievements;
        }
      })
    ),
    updateSkills: (skills) => set(
      produce((state) => {
        state.resumeData.skills = skills;
      })
    ),

    // Auto-save to localStorage after any update
    saveToStorage: () => {
      const currentData = get().resumeData;
      saveToStorage(currentData);
    },

    // Manual save method
    manualSave: () => {
      const currentData = get().resumeData;
      saveToStorage(currentData);
      return currentData;
    },

    // Load from storage (useful for manual refresh)
    loadFromStorage: () => {
      const storedData = loadFromStorage();
      if (storedData) {
        set({ resumeData: storedData });
        return storedData;
      }
      return null;
    },

    // Clear all data
    clearData: () => {
      const emptyData: ResumeData = {
        personal: { name: '', email: '', phone: '', title: '' },
        experience: [],
        education: [],
        projects: [],
        skills: []
      };
      set({ resumeData: emptyData });
      saveToStorage(emptyData);
    }
  };
});

export default useResumeStore;

// Auto-save hook for components that want automatic persistence
export const useAutoSave = () => {
  const { resumeData, saveToStorage } = useResumeStore();

  React.useEffect(() => {
    // Debounce auto-save to avoid excessive localStorage writes
    const timeoutId = setTimeout(() => {
      saveToStorage();
    }, 1000); // Save after 1 second of inactivity

    return () => clearTimeout(timeoutId);
  }, [resumeData, saveToStorage]);
};
