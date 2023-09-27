"use client";

import { useGlobalStore } from "@/stores/useGlobalStore";

const ProcessingError = () => {
  const { processingError } = useGlobalStore();

  if (!processingError) return null;

  return (
    <div role="alert">
      <p className="text-red-500">
        There was an error processing / retrieving the data. Please try again.
      </p>
      <pre>Error details: {processingError}</pre>
    </div>
  );
};

export default ProcessingError;
