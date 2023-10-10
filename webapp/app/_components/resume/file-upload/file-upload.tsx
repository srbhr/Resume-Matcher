"use client";

import clsx from "clsx";
import { useState } from "react";
import { useGlobalStore } from "@/stores/useGlobalStore";

type FileUploadProps = {
  buttonLabel?: string;
  dropZoneLabel?: string;
};

const FILE_TYPES = ["application/pdf"];

const FileUpload = ({
  buttonLabel = "Select File",
  dropZoneLabel = "Or Drop File Here",
}: FileUploadProps) => {
  const { setFile, clearResumeProcessorResponse } = useGlobalStore();

  const [fileName, setFileName] = useState<string>();
  const [isDragging, setIsDragging] = useState(false);

  const acceptedFileTypes = FILE_TYPES.join(", ");

  function saveSelectedFileToState(file: File) {
    setFileName(file.name);
    setFile(file);

    clearResumeProcessorResponse();
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const uploadedFile = e.target.files?.[0] || null;

    if (uploadedFile && FILE_TYPES.includes(uploadedFile.type)) {
      saveSelectedFileToState(uploadedFile);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files?.[0] || null;

    if (droppedFile && FILE_TYPES.includes(droppedFile.type)) {
      saveSelectedFileToState(droppedFile);
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  return (
    <div
      className={clsx(
        "flex flex-col gap-4 mt-4 p-6 border-2 border-solid border-gray-700 rounded-lg",
        { "border-purple-100 opacity-50": isDragging }
      )}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input
        type="file"
        id="upload-btn"
        onChange={handleUpload}
        accept={acceptedFileTypes}
        hidden
        multiple={false}
      />
      <label
        htmlFor="upload-btn"
        className="block text-white text-3xl p-8 rounded-2xl text-center font-semibold cursor-pointer shadow-2xl bg-gradient-to-bl from-[#1B2450] to-[#232334] hover:bg-gradient-to-bl hover:from-[#151E4B] hover:to-[#242430]"
      >
        {buttonLabel}
      </label>
      <small className="text-center text-gray-300">
        Accepted file type(s): {acceptedFileTypes}
      </small>
      {fileName ? (
        <span className="block text-2xl text-center text-emerald-500">
          {fileName}
        </span>
      ) : (
        <p className="block text-2xl text-center">{dropZoneLabel}</p>
      )}
    </div>
  );
};

export default FileUpload;
