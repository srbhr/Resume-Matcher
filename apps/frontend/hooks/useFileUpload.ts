import { useState } from "react";

interface UseFileUploadProps {
  onUploadSuccess?: (response: any) => void;
  onUploadError?: (error: string) => void;
}

export const useFileUpload = ({
  onUploadSuccess,
  onUploadError,
}: UseFileUploadProps = {}) => {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResponse, setUploadResponse] = useState<any>(null);

  const handleFileChange = async (selectedFile: File | null) => {
    setError(null);
    setUploadResponse(null);

    if (!selectedFile) return;

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowedTypes.includes(selectedFile.type)) {
      setError("Invalid file type. Please upload a PDF or Word document.");
      console.log("Rejected file type:", selectedFile.type);
      return;
    }

    // Validate file size (2MB)
    const maxSize = 2 * 1024 * 1024;
    if (selectedFile.size > maxSize) {
      setError("File size exceeds 2MB limit.");
      console.log("Rejected file size:", selectedFile.size);
      return;
    }

    setFile(selectedFile);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

      console.log("Sending file upload request to:", `${apiUrl}/upload`);
      const response = await fetch(`${apiUrl}/upload`, {
        method: "POST",
        body: formData,
      });
      console.log("Received response status:", response.status);

      if (!response.ok) {
        const errData = await response.json();
        console.error("Upload failed:", errData);
        throw new Error(errData.detail || "Upload failed");
      }

      const data = await response.json();
      setUploadResponse(data);
      console.log("Upload successful, response:", data);
      if (onUploadSuccess) onUploadSuccess(data);
      // Show success message to user
      alert(`File uploaded successfully: ${selectedFile.name}`);
    } catch (err: any) {
      const message =
        err instanceof Error ? err.message : "Unexpected upload error";
      setError(message);
      console.error("Upload error:", message);
      if (onUploadError) onUploadError(message);
    } finally {
      setIsUploading(false);
    }
  };

  const resetFile = () => {
    setFile(null);
    setError(null);
    setUploadResponse(null);
  };

  return {
    file,
    error,
    isUploading,
    uploadResponse,
    handleFileChange,
    resetFile,
  };
};

export default useFileUpload;
