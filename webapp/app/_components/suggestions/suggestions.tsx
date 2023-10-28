"use client";

import { useGlobalStore } from "@/stores/useGlobalStore";
import ProcessingError from "@/components/processing-error/processing-error";

const Suggestions = () => {
  const { isBackendProcessing, resumeProcessorResponse } = useGlobalStore();

  if (!isBackendProcessing && !resumeProcessorResponse?.suggestionsSet)
    return null;

  function renderSuggestions() {
    const { suggestionsSet } = resumeProcessorResponse || {};

    if (!suggestionsSet) return null;

    return (
      <ul className="flex flex-col gap-6">
        {suggestionsSet.map((suggestions) => {
          return (
            <li
              key={suggestions.jobId}
              className="flex flex-col rounded-md gap-2 p-4 pl-8 border-2 border-dashed border-blue-400 bg-[#f9f2f2]"
            >
              <h3 className="text-lg text-center text-gray-500 pt-4">
                Suggestions for Job ID:{" "}
                <span className="px-2 bg-gray-500 text-white rounded-md">
                  {suggestions.jobId}
                </span>
              </h3>
              <ul className="flex flex-col gap-3 p-2 pt-6" role="list">
                {suggestions.changes.map((change, index) => {
                  return (
                    <li
                      key={index}
                      className="border-b-2 border-dotted border-gray-200 pl-4"
                    >
                      <ul
                        className="flex gap-8 justify-between list-disc list-outside-"
                        role="list"
                      >
                        <li className="w-1/2 list-['✗\002'] marker:text-red-500 line-through">
                          {change.changeFrom}
                        </li>
                        <li className="w-1/2 list-['✓\002'] marker:text-green-500">
                          {change.changeTo}
                        </li>
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section className="flex flex-col gap-12 px-32 py-12">
      <h2 className="text-4xl font-normal leading-normal">Suggestions</h2>
      {isBackendProcessing && <p>Processing suggestions...</p>}
      <ProcessingError />
      <div className="flex flex-col rounded-md gap-8 text-black p-8 bg-[#FFF5F5]">
        {renderSuggestions()}
      </div>
    </section>
  );
};

export default Suggestions;
