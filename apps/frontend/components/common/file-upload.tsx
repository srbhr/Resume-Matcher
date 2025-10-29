"use client";

import React from "react";
import { useFileUpload } from "../../hooks/use-file-upload";

interface FileUploadProps {
  onUploadSuccess?: (fileUrl: string) => void;
  onUploadError?: (error: string) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({
  onUploadSuccess,
  onUploadError,
}) => {
  const [state, actions] = useFileUpload({
    uploadUrl: 'http://127.0.0.1:8000/api/v1/resumes/upload',
    onUploadSuccess: (file, response) => {
      console.log('Upload successful:', response);
      setFeedback(`${file.file.name} uploaded successfully!`);
      if (typeof response.url === 'string') {
        onUploadSuccess?.(response.url);
      }
    },
    onUploadError: (file, error) => {
      console.error('Upload error:', error);
      setFeedback(`Error uploading ${file.file.name}: ${error}`);
      onUploadError?.(error);
    }
  });
  const files = state.files;
  const currentFile = files[0];
  const isUploadingGlobal = state.isUploadingGlobal;
  const [feedback, setFeedback] = React.useState<string | null>(null);

  return (
    <div className="w-full max-w-sm mx-auto p-6 bg-white rounded-lg shadow">
      <label
        htmlFor="file-upload"
        className="block mb-2 font-medium text-gray-700"
      >
        Upload Resume (PDF, DOC, DOCX)
      </label>
      <input
        id="file-upload"
        type="file"
        accept=".pdf,.doc,.docx"
        disabled={isUploadingGlobal}
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        onChange={e => {
          if (e.target.files && e.target.files[0]) {
            actions.addFiles(e.target.files);
            setFeedback(null);
          }
        }}
      />
      {currentFile && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-gray-800 text-sm truncate max-w-[180px]">
            {currentFile.file.name}
          </span>
          <button
            type="button"
            onClick={() => actions.removeFile(currentFile.id)}
            className="ml-2 px-2 py-1 text-xs text-red-600 bg-red-50 rounded hover:bg-red-100"
          >
            Remove
          </button>
        </div>
      )}
      {state.errors.length > 0 && (
        <p className="mt-2 text-sm text-red-600">{state.errors[0]}</p>
      )}
      {feedback && <p className="mt-2 text-sm text-green-600">{feedback}</p>}
    </div>
  );
};

export default FileUpload;
