"use client";

import DOMPurify from "dompurify";
import { useGlobalStore } from "@/stores/useGlobalStore";
import ProcessingError from "@/components/processing-error/processing-error";

const CommonWords = () => {
  const { isBackendProcessing, resumeProcessorResponse } = useGlobalStore();

  if (!isBackendProcessing && !resumeProcessorResponse?.commonWordsSet)
    return null;

  function renderCommonWords() {
    const { commonWordsSet } = resumeProcessorResponse || {};

    if (!commonWordsSet) return null;

    return (
      <ul className="flex flex-col gap-6">
        {commonWordsSet.map((commonWord) => {
          const sanitisedHtmlText = DOMPurify.sanitize(commonWord.text);

          return (
            <li key={commonWord.jobId}>
              <article className="flex flex-col rounded-md gap-2 p-4 border-2 border-dashed border-blue-400 bg-[#f9f2f2]">
                <h3 className="text-lg text-center text-gray-500">
                  Common Words for Job ID:{" "}
                  <span className="px-2 bg-gray-500 text-white rounded-md">
                    {commonWord.jobId}
                  </span>
                </h3>
                <div
                  className="pt-4"
                  dangerouslySetInnerHTML={{ __html: sanitisedHtmlText }}
                ></div>
              </article>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section className="flex flex-col  gap-12 px-32 py-12">
      <h2 className="text-4xl font-normal leading-normal">
        Common Words between Job Descriptions and Resumes Highlighted
      </h2>
      {isBackendProcessing && <p>Processing common words...</p>}
      <ProcessingError />
      <div className="flex flex-col rounded-md gap-8 text-black p-8 bg-[#FFF5F5]">
        {renderCommonWords()}
      </div>
    </section>
  );
};

export default CommonWords;
