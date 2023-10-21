"use client";

import { useGlobalStore } from "@/stores/useGlobalStore";
import AddJobs from "@/components/job-descriptions/add-jobs/add-jobs";

const JobDescriptions = () => {
  const { file } = useGlobalStore();

  if (!file) return null;

  return (
    <section className="flex flex-col gap-12 px-32 py-8">
      <h2 className="text-4xl font-normal leading-normal pt-8">
        Job Descriptions
      </h2>
      <div className="flex flex-col gap-4 text-black rounded-md p-8 bg-[#FFF5F5]">
        <AddJobs numMaxJobs={4} />
      </div>
    </section>
  );
};

export default JobDescriptions;
