"use client";

import { useState } from "react";
import Image from "next/image";
import { JobDescription } from "@/types/job-descriptions";
import Button from "@/components/button/button";
import { useGlobalStore } from "@/stores/useGlobalStore";

type AddJobsProps = {
  numMaxJobs?: number;
};

const JOB_DETAIL_TYPE = {
  LINK: "link",
  DESCRIPTION: "description",
};

const AddJobs = ({ numMaxJobs = 1 }: AddJobsProps) => {
  const {
    setJobDescriptions,
    processData,
    resumeProcessorResponse,
    clearResumeProcessorResponse,
  } = useGlobalStore();
  const [jobs, setJobs] = useState<JobDescription[]>([]);

  const handleAddJobDetail = (e: React.MouseEvent<HTMLButtonElement>) => {
    const jobDetailType = e.currentTarget.dataset.jobDetailType;

    const randomId = crypto.randomUUID();

    handleClearOutdatedResults();

    if (jobDetailType === JOB_DETAIL_TYPE.LINK) {
      return addEmptyJobDetailLink(randomId);
    }

    return addEmptyJobDetailDescription(randomId);
  };

  function addEmptyJobDetailLink(id: string) {
    setJobs((jobs) => [...jobs, { id, link: "" }]);
  }

  function addEmptyJobDetailDescription(id: string) {
    setJobs((jobs) => [...jobs, { id, description: "" }]);
  }

  function removeJobDetail(id: string) {
    setJobs((jobs) => jobs.filter((job) => job.id !== id));
    handleClearOutdatedResults();
  }

  function handleClearOutdatedResults() {
    if (resumeProcessorResponse) {
      clearResumeProcessorResponse();
    }
  }

  function renderJobs() {
    return jobs.map((job, index) => {
      const jobNumber = index + 1;
      const inputName = `job_${jobNumber.toString()}`;
      const jobDetailType =
        "link" in job ? JOB_DETAIL_TYPE.LINK : JOB_DETAIL_TYPE.DESCRIPTION;

      return (
        <div
          key={job.id}
          className="flex flex-col rounded-md gap-2 p-4 bg-[#ededed]"
        >
          <div className="flex justify-between">
            <label htmlFor={job.id}>
              Job {`#${jobNumber}`} - [{jobDetailType}]
            </label>
            <Button
              className="inline-block bg-red-500 px-3 py-2 text-white text-xs hover:bg-red-700 shadow-lg"
              aria-label={`Remove job ${jobNumber}`}
              onClick={() => removeJobDetail(job.id)}
            >
              Remove
            </Button>
          </div>
          <small className="text-gray-500">
            (id:{" "}
            <span className="px-2 bg-gray-500 text-white rounded-md">
              {job.id}
            </span>
            )
          </small>
          {"link" in job && (
            <input
              required
              type="url"
              name={inputName}
              onChange={handleClearOutdatedResults}
              placeholder="Add URL link to job"
            />
          )}
          {"description" in job && (
            <textarea
              className="px-3 py-4 rounded-md mt-6"
              required
              name={inputName}
              onChange={handleClearOutdatedResults}
              placeholder="Add job description"
              rows={10}
            />
          )}
          <input name={`${inputName}_id`} readOnly value={job.id} hidden />
        </div>
      );
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);

    const urlRegex = /^https?:\/\/\S+$/;
    let jobs: JobDescription[] = [];

    for (let i = 1; i <= numMaxJobs; i++) {
      const jobInput = formData.get(`job_${i}`) as string;
      const jobInoutId = formData.get(`job_${i}_id`) as string;

      if (!jobInput) continue; // skip empty job input

      const job = { id: jobInoutId } as JobDescription;

      if (urlRegex.test(jobInput.toString())) {
        job.link = jobInput;
      } else {
        job.description = jobInput;
      }

      jobs.push(job);
    }

    setJobDescriptions(jobs);
    processData(); // 🤯 from this point, the frontend will submit a request to the backend to proces all user submitted data
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {renderJobs()}
      <div className="flex gap-4">
        {/** TODO - Uncomment button to provide "links" to job descriptions when backend is implemented to handle dynamic parsing of job descriptions via provided links. The backend will need to scrape the web page links of job descriptions, and save to PDF (Data/JobDescription/XXXX-XXXX.local.pdf) */}
        {/* <Button
          className="text-white bg-[#302442] disabled:opacity-50"
          data-job-detail-type={JOB_DETAIL_TYPE.LINK}
          disabled={jobs.length >= numMaxJobs}
          onClick={handleAddJobDetail}
        >
          Add Job Link
          <Image
            className="invert"
            src="/icons/link.svg"
            width={24}
            height={24}
            alt="Link Icon"
          />
        </Button> */}
        <Button
          className="text-white bg-[#302442]  disabled:opacity-50 mt-6 hover:shadow-lg bg-[#2D213F]"
          data-job-detail-type={JOB_DETAIL_TYPE.DESCRIPTION}
          disabled={jobs.length >= numMaxJobs}
          onClick={handleAddJobDetail}
        >
          Add Job Description
          <Image
            className="invert"
            src="/icons/file-description.svg"
            width={24}
            height={24}
            alt="Description Icon"
          />
        </Button>
      </div>
      <p className="text-slate-500">
        ** Maximum of {numMaxJobs} job(s) allowed
      </p>
      {jobs.length ? (
        <Button
          type="submit"
          className="text-white mt-8 bg-[#4c72f9] hover:bg-[#476AE9] shadow-xl"
        >
          Continue
        </Button>
      ) : null}
    </form>
  );
};

export default AddJobs;
