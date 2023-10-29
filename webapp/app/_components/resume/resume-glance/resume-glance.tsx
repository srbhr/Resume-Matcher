"use client";

import { useGlobalStore } from "@/stores/useGlobalStore";
import PDFViewer from "@/components/resume/pdf-viewer/pdf-viewer";

const ResumeGlance = () => {
  const { file } = useGlobalStore();

  if (!file) return null;

  return (
    <section className="flex flex-col gap-12 px-32 py-10">
      <h2 className="text-4xl font-normal leading-normal pt-16">
        Resume at a Glance
      </h2>
      <div className="flex flex-col gap-4 items-center rounded-md text-black p-8 bg-[#FFF5F5]">
        <PDFViewer />
      </div>
    </section>
  );
};

export default ResumeGlance;
