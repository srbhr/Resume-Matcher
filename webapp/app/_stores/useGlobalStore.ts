import { create } from "zustand";
import { JobDescription } from "@/types/job-descriptions";
import { ResumeProcessorResponse } from "@/types/resume-processor";
import { getErrorMessage } from "@/utils/errors";

type GlobalStoreState = {
  file: File | null;
  jobDescriptions: JobDescription[];
  resumeProcessorResponse: ResumeProcessorResponse | null;
  isBackendProcessing: boolean;
  processingError: string | null;
  setFile: (_file: File) => void;
  setJobDescriptions: (_jobDescriptions: JobDescription[]) => void;
  processData: () => void;
  clearResumeProcessorResponse: () => void;
};

export const useGlobalStore = create<GlobalStoreState>((set, get) => ({
  file: null,
  jobDescriptions: [],
  resumeProcessorResponse: null,
  isBackendProcessing: false,
  processingError: null,
  setFile: (file: File) => set({ file }),
  setJobDescriptions: (jobDescriptions) => {
    set({ jobDescriptions });
  },
  processData: async () => {
    const { file, jobDescriptions } = get();

    set({ isBackendProcessing: true });

    try {
      const formData = new FormData();
      formData.append("resume", file as Blob);
      formData.append("jobs", JSON.stringify(jobDescriptions));

      const response = await fetch("/api/resume-processor", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Something went wrong");
      }

      const result = (await response.json()) as ResumeProcessorResponse;

      set({ resumeProcessorResponse: result });
    } catch (error) {
      console.error(error);
      const message = getErrorMessage(error);
      set({ processingError: message });
    } finally {
      set({ isBackendProcessing: false });
    }
  },
  clearResumeProcessorResponse: () => {
    set({ resumeProcessorResponse: null });
  },
}));
