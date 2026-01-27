'use client';

import type React from 'react';
import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type InputHTMLAttributes,
} from 'react';

export type FileMetadata = {
  name: string;
  size: number;
  type: string;
  url: string; // Can be server URL post-upload or preview URL
  id: string; // Should be unique identifier for the file entry
  uploaded?: boolean; // To track successful upload
  uploadError?: string; // To store upload specific error
};

export type FileWithPreview = {
  file: File | FileMetadata; // Can be File initially, then FileMetadata post-upload
  id: string; // Unique ID for this FileWithPreview item
  preview?: string; // URL for preview, e.g., object URL for images
};

export type FileUploadOptions = {
  maxFiles?: number;
  maxSize?: number; // in bytes
  accept?: string; // Comma-separated string of accepted file types
  multiple?: boolean;
  initialFiles?: FileMetadata[]; // To initialize with already uploaded files
  onFilesChange?: (files: FileWithPreview[]) => void;
  onFilesAdded?: (addedFiles: FileWithPreview[]) => void; // Called with newly added valid files
  onUploadSuccess?: (uploadedFile: FileWithPreview, response: Record<string, unknown>) => void;
  onUploadError?: (file: FileWithPreview, error: string) => void;
  uploadUrl?: string; // API endpoint for uploading
};

export type FileUploadState = {
  files: FileWithPreview[];
  isDragging: boolean;
  errors: string[]; // For validation or general errors
  isUploadingGlobal: boolean; // Global flag for ongoing upload(s)
};

export type FileUploadActions = {
  addFiles: (files: FileList | File[]) => void; // Public API to add and initiate upload
  removeFile: (id: string) => void;
  clearFiles: () => void;
  clearErrors: () => void;
  handleDragEnter: (e: DragEvent<HTMLElement>) => void;
  handleDragLeave: (e: DragEvent<HTMLElement>) => void;
  handleDragOver: (e: DragEvent<HTMLElement>) => void;
  handleDrop: (e: DragEvent<HTMLElement>) => void;
  // handleFileChange is usually internal, triggered by getInputProps
  openFileDialog: () => void;
  getInputProps: (
    props?: InputHTMLAttributes<HTMLInputElement>
  ) => InputHTMLAttributes<HTMLInputElement> & {
    ref: React.Ref<HTMLInputElement>;
  };
};

export const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
};

export const useFileUpload = (
  options: FileUploadOptions = {}
): [FileUploadState, FileUploadActions] => {
  const {
    maxFiles = Infinity,
    maxSize = Infinity,
    accept = '*/*', // More common default
    multiple = false,
    initialFiles = [],
    onFilesChange,
    onFilesAdded,
    onUploadSuccess,
    onUploadError,
    uploadUrl,
  } = options;

  const [state, setState] = useState<FileUploadState>({
    files: initialFiles.map((fileMeta) => ({
      // initialFiles are FileMetadata
      file: fileMeta,
      id: fileMeta.id, // Ensure initialFiles have an id
      preview: fileMeta.url, // Use url from FileMetadata as preview
    })),
    isDragging: false,
    errors: [],
    isUploadingGlobal: false,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const inFlightUploadsRef = useRef(0);

  const markUploadStarted = useCallback(() => {
    const nextCount = inFlightUploadsRef.current + 1;
    inFlightUploadsRef.current = nextCount;

    if (nextCount === 1) {
      setState((prev) => (prev.isUploadingGlobal ? prev : { ...prev, isUploadingGlobal: true }));
    }
  }, []);

  const markUploadFinished = useCallback(() => {
    const nextCount = Math.max(0, inFlightUploadsRef.current - 1);
    inFlightUploadsRef.current = nextCount;

    if (nextCount === 0) {
      setState((prev) => (prev.isUploadingGlobal ? { ...prev, isUploadingGlobal: false } : prev));
    }
  }, []);

  const validateFile = useCallback(
    (file: File): string | null => {
      // Simplified: always validates a File object
      if (file.size > maxSize) {
        return `File "${file.name}" exceeds the maximum size of ${formatBytes(maxSize)}.`;
      }

      if (accept !== '*/*' && accept !== '*') {
        const acceptedTypes = accept.split(',').map((type) => type.trim().toLowerCase());
        const fileType = file.type.toLowerCase();
        const fileName = file.name.toLowerCase();
        const fileExtension = `.${fileName.split('.').pop()}`;

        const isAccepted = acceptedTypes.some((type) => {
          if (type.startsWith('.')) {
            // e.g., .pdf
            return fileExtension === type;
          }
          if (type.endsWith('/*')) {
            // e.g., image/*
            const baseType = type.slice(0, -2); // image
            return fileType.startsWith(`${baseType}/`);
          }
          return fileType === type; // e.g., application/pdf
        });

        if (!isAccepted) {
          return `File "${file.name}" type not accepted. Accepted types: ${accept}`;
        }
      }
      return null;
    },
    [accept, maxSize]
  );

  const createPreview = useCallback((file: File): string | undefined => {
    if (file.type.startsWith('image/')) {
      return URL.createObjectURL(file);
    }
    return undefined;
  }, []);

  const generateUniqueId = useCallback((file: File): string => {
    return `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).substring(2, 9)}`;
  }, []);

  const uploadFileInternal = useCallback(
    async (fileToUpload: FileWithPreview) => {
      // Ensure fileToUpload.file is a File instance for upload
      if (!(fileToUpload.file instanceof File)) {
        const errorMsg = `Cannot upload "${(fileToUpload.file as FileMetadata).name}"; it's not a valid file object for direct upload.`;
        console.error(errorMsg, fileToUpload);
        // Update this specific file's metadata with an error
        const updatedFileWithMetaError: FileWithPreview = {
          ...fileToUpload,
          file: {
            ...(fileToUpload.file as FileMetadata), // Keep existing metadata
            uploadError: errorMsg,
            uploaded: false,
          },
        };
        setState((prev) => ({
          ...prev,
          files: prev.files.map((f) =>
            f.id === updatedFileWithMetaError.id ? updatedFileWithMetaError : f
          ),
          errors: [...prev.errors, errorMsg], // Add to general errors too
        }));
        onUploadError?.(updatedFileWithMetaError, errorMsg);
        return;
      }

      if (!uploadUrl) {
        const errorMsg = 'Upload URL is not configured.';
        console.warn(errorMsg, 'File not uploaded:', fileToUpload.file.name);
        // Update file metadata to reflect it wasn't uploaded due to config
        const fileWithConfigError: FileWithPreview = {
          ...fileToUpload,
          file: {
            // Convert to FileMetadata with error
            name: fileToUpload.file.name,
            size: fileToUpload.file.size,
            type: fileToUpload.file.type,
            id: fileToUpload.id,
            url: fileToUpload.preview || '',
            uploaded: false,
            uploadError: errorMsg,
          },
        };
        setState((prev) => ({
          ...prev,
          files: prev.files.map((f) => (f.id === fileWithConfigError.id ? fileWithConfigError : f)),
          errors: [...prev.errors, errorMsg],
        }));
        onUploadError?.(fileWithConfigError, errorMsg);
        return;
      }

      const formData = new FormData();
      formData.append('file', fileToUpload.file); // FastAPI expects 'file' field

      markUploadStarted();

      try {
        const response = await fetch(uploadUrl, {
          method: 'POST',
          body: formData,
        });

        let responseData: Record<string, unknown> = {}; // Initialize for broader scope
        const contentType = response.headers.get('content-type');

        if (!response.ok) {
          let errorDetail = `Upload failed for ${fileToUpload.file.name}. Status: ${response.status} ${response.statusText}`;
          try {
            const errorText = await response.text();
            errorDetail += ` - Server response: ${errorText.substring(0, 200)}${errorText.length > 200 ? '...' : ''}`;
          } catch (textError: unknown) {
            console.warn('Could not read error response text:', textError);
          }
          throw new Error(errorDetail);
        }

        if (contentType && contentType.includes('application/json')) {
          responseData = (await response.json()) as Record<string, unknown>;
        } else {
          // Handle non-JSON or missing Content-Type response if necessary,
          // or assume success if response.ok and no JSON is expected for some cases.
          // For now, we'll assume JSON is expected on success.
          console.warn(
            `Response for ${fileToUpload.file.name} was not JSON. Content-Type: ${contentType}`
          );
          // If JSON is strictly required, this could be an error condition:
          // throw new Error(`Unexpected response type: ${contentType}. Expected JSON.`);
        }

        const successfullyUploadedFile: FileWithPreview = {
          ...fileToUpload,
          file: {
            // This is FileMetadata
            name: fileToUpload.file.name,
            size: fileToUpload.file.size,
            type: fileToUpload.file.type,
            id: fileToUpload.id, // Use existing FileWithPreview ID as FileMetadata ID
            url:
              typeof responseData.file_url === 'string'
                ? responseData.file_url // Assuming server returns 'file_url'
                : typeof responseData.url === 'string'
                  ? responseData.url
                  : fileToUpload.preview || '',
            uploaded: true,
          },
        };

        setState((prev) => {
          const updatedFiles = prev.files.map((f) =>
            f.id === successfullyUploadedFile.id ? successfullyUploadedFile : f
          );
          onUploadSuccess?.(successfullyUploadedFile, responseData);
          return { ...prev, files: updatedFiles };
        });
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : `Error uploading ${(fileToUpload.file as File).name}.`;
        const fileWithError: FileWithPreview = {
          ...fileToUpload,
          file: {
            // This is FileMetadata
            name: (fileToUpload.file as File).name,
            size: (fileToUpload.file as File).size,
            type: (fileToUpload.file as File).type,
            id: fileToUpload.id,
            url: fileToUpload.preview || '',
            uploaded: false,
            uploadError: errorMessage,
          },
        };
        setState((prev) => {
          const updatedFiles = prev.files.map((f) =>
            f.id === fileWithError.id ? fileWithError : f
          );
          // Add to general errors in addition to specific file error
          const newErrors = prev.errors.filter((e) => !e.includes(fileWithError.file.name)); // Avoid duplicate general messages for the same file
          newErrors.push(errorMessage);

          onUploadError?.(fileWithError, errorMessage);
          return { ...prev, files: updatedFiles, errors: newErrors };
        });
      } finally {
        markUploadFinished();
      }
    },
    [markUploadFinished, markUploadStarted, onUploadError, onUploadSuccess, uploadUrl]
  );

  const addFilesAndUpload = useCallback(
    (newFilesInput: FileList | File[]) => {
      if (state.isUploadingGlobal && !multiple) return; // Don't add if already uploading (single mode)
      if (!newFilesInput || newFilesInput.length === 0) return;

      const newFilesArray = Array.from(newFilesInput);
      const currentValidationErrors: string[] = []; // Local to this call

      // For single file mode, if a file already exists (even if being uploaded or failed), replace it.
      if (!multiple && state.files.length > 0) {
        state.files.forEach((fwp) => {
          // Revoke old preview
          if (fwp.preview && fwp.file instanceof File && fwp.file.type.startsWith('image/')) {
            URL.revokeObjectURL(fwp.preview);
          }
        });
        setState((prev) => ({ ...prev, files: [], errors: [] })); // Clear existing files and their errors
      } else {
        setState((prev) => ({ ...prev, errors: [] })); // Clear general errors for new batch
      }

      if (!multiple && newFilesArray.length > 1) {
        currentValidationErrors.push('Please select only one file.');
        setState((prev) => ({ ...prev, errors: currentValidationErrors }));
        if (inputRef.current) inputRef.current.value = '';
        return;
      }

      if (
        multiple &&
        maxFiles !== Infinity &&
        state.files.length + newFilesArray.length > maxFiles
      ) {
        currentValidationErrors.push(`You can only upload a maximum of ${maxFiles} files.`);
        setState((prev) => ({ ...prev, errors: [...prev.errors, ...currentValidationErrors] }));
        if (inputRef.current) inputRef.current.value = '';
        return;
      }

      const filesToProcess: FileWithPreview[] = [];

      for (const file of newFilesArray) {
        if (!(file instanceof File)) continue; // Skip if not a File object

        // Duplicate check (more robust for multiple additions)
        const isDuplicate =
          !multiple && state.files.length > 0
            ? false // In single mode, we already cleared
            : state.files.some(
                (existingFwp) =>
                  existingFwp.file.name === file.name &&
                  existingFwp.file.size === file.size &&
                  (existingFwp.file instanceof File
                    ? existingFwp.file.lastModified === file.lastModified
                    : true)
              );
        if (isDuplicate) continue;

        const validationError = validateFile(file);
        if (validationError) {
          currentValidationErrors.push(validationError);
        } else {
          filesToProcess.push({
            file, // Actual File object
            id: generateUniqueId(file),
            preview: createPreview(file),
          });
        }
      }

      if (currentValidationErrors.length > 0) {
        setState((prev) => ({ ...prev, errors: [...prev.errors, ...currentValidationErrors] }));
        if (inputRef.current) inputRef.current.value = '';
        return;
      }

      if (filesToProcess.length > 0) {
        const filesToAddUpdate = !multiple ? filesToProcess.slice(0, 1) : filesToProcess;

        setState((prev) => {
          const updatedFilesState = !multiple
            ? filesToAddUpdate
            : [...prev.files, ...filesToAddUpdate];
          onFilesChange?.(updatedFilesState); // Call with the full list
          onFilesAdded?.(filesToAddUpdate); // Call with only the newly added valid files
          return {
            ...prev,
            files: updatedFilesState,
          };
        });

        if (uploadUrl) {
          filesToAddUpdate.forEach((fileToUpload) => uploadFileInternal(fileToUpload));
        } else {
          console.warn('uploadUrl not provided. Files added locally but not uploaded.');
          // If no uploadUrl, mark files as 'pending' or similar if needed, or convert to FileMetadata locally
          const filesAsMetadataLocally = filesToAddUpdate.map((fwp) => ({
            ...fwp,
            file: {
              // Convert to FileMetadata to indicate they are processed by the hook
              name: (fwp.file as File).name,
              size: (fwp.file as File).size,
              type: (fwp.file as File).type,
              id: fwp.id,
              url: fwp.preview || '', // Use preview as URL if no upload
              uploaded: false, // Not uploaded
              uploadError: 'Upload URL not configured',
            } as FileMetadata,
          }));

          setState((prev) => {
            const updatedFiles = prev.files.map((existingFile) => {
              const found = filesAsMetadataLocally.find(
                (processedFile) => processedFile.id === existingFile.id
              );
              return found || existingFile;
            });
            return { ...prev, files: updatedFiles };
          });
        }
      }

      if (inputRef.current) {
        inputRef.current.value = '';
      }
    },
    [
      state.isUploadingGlobal,
      state.files, // Critical for logic within
      multiple,
      maxFiles,
      uploadUrl,
      validateFile,
      generateUniqueId,
      createPreview, // Other useCallback deps
      onFilesChange,
      onFilesAdded, // Callbacks
      uploadFileInternal,
      // setState itself is stable.
    ]
  );

  const removeFile = useCallback(
    (id: string) => {
      setState((prev) => {
        const fileToRemove = prev.files.find((file) => file.id === id);
        if (
          fileToRemove?.preview &&
          fileToRemove.file instanceof File &&
          fileToRemove.file.type.startsWith('image/')
        ) {
          URL.revokeObjectURL(fileToRemove.preview);
        }
        const newFiles = prev.files.filter((file) => file.id !== id);
        onFilesChange?.(newFiles);

        let updatedErrors = prev.errors;
        if (fileToRemove?.file?.name) {
          // Remove errors specifically mentioning this file by name
          updatedErrors = prev.errors.filter((err) => !err.includes(fileToRemove.file.name));
        }
        // If all files are removed, clear all errors
        if (newFiles.length === 0) {
          updatedErrors = [];
        }

        if (inputRef.current && newFiles.length === 0) {
          inputRef.current.value = '';
        }
        return {
          ...prev,
          files: newFiles,
          errors: updatedErrors,
        };
      });
    },
    [onFilesChange] // setState is stable
  );

  const clearFiles = useCallback(() => {
    inFlightUploadsRef.current = 0;
    setState((prev) => {
      prev.files.forEach((fwp) => {
        if (fwp.preview && fwp.file instanceof File && fwp.file.type.startsWith('image/')) {
          URL.revokeObjectURL(fwp.preview);
        }
      });
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      const newState = { ...prev, files: [], errors: [], isUploadingGlobal: false };
      onFilesChange?.(newState.files);
      return newState;
    });
  }, [onFilesChange]); // setState is stable

  const clearErrors = useCallback(() => {
    setState((prev) => ({ ...prev, errors: [] }));
  }, []); // setState is stable

  const handleDragEnter = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (state.isUploadingGlobal && !multiple) return;
      if (!multiple && state.files.length > 0) return; // Don't allow drag if single file already present
      setState((prev) => ({ ...prev, isDragging: true }));
    },
    [state.isUploadingGlobal, state.files.length, multiple]
  );

  const handleDragLeave = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (state.isUploadingGlobal && !multiple) return;
      if (e.currentTarget.contains(e.relatedTarget as Node)) {
        return;
      }
      setState((prev) => ({ ...prev, isDragging: false }));
    },
    [state.isUploadingGlobal, multiple]
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (state.isUploadingGlobal && !multiple) {
        e.dataTransfer.dropEffect = 'none';
        return;
      }
      if (!multiple && state.files.length > 0) {
        e.dataTransfer.dropEffect = 'none';
        return;
      }
      e.dataTransfer.dropEffect = 'copy'; // Explicitly show copy cursor
      setState((prev) => ({ ...prev, isDragging: true }));
    },
    [state.isUploadingGlobal, state.files.length, multiple]
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setState((prev) => ({ ...prev, isDragging: false }));
      if (state.isUploadingGlobal && !multiple) return;
      if (!multiple && state.files.length > 0) return;

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        addFilesAndUpload(e.dataTransfer.files); // This is addFilesAndUpload
        e.dataTransfer.clearData();
      }
    },
    [addFilesAndUpload, state.isUploadingGlobal, state.files.length, multiple] // addFilesAndUpload is from useCallback
  );

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      // isUploadingGlobal check is handled within addFilesAndUpload for single mode
      if (e.target.files && e.target.files.length > 0) {
        addFilesAndUpload(e.target.files); // This is addFilesAndUpload
      }
    },
    [addFilesAndUpload] // addFilesAndUpload is from useCallback
  );

  const openFileDialog = useCallback(() => {
    if (state.isUploadingGlobal && !multiple) return;
    if (!multiple && state.files.length > 0) return; // Prevent opening if single file already selected
    if (inputRef.current) {
      inputRef.current.click();
    }
  }, [state.isUploadingGlobal, state.files.length, multiple]);

  const getInputProps = useCallback(
    (props?: InputHTMLAttributes<HTMLInputElement>) => ({
      ...props,
      ref: inputRef,
      type: 'file',
      onChange: handleFileChange,
      accept: accept,
      multiple: multiple,
      // Disable if global upload is happening (especially for single mode)
      // or if it's single mode and a file is already present.
      disabled: (state.isUploadingGlobal && !multiple) || (!multiple && state.files.length > 0),
      style: { display: 'none', ...props?.style },
    }),
    [handleFileChange, accept, multiple, state.isUploadingGlobal, state.files.length]
  );

  return [
    state,
    {
      addFiles: addFilesAndUpload, // Expose internal addFilesAndUpload as addFiles
      removeFile,
      clearFiles,
      clearErrors,
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
      openFileDialog,
      getInputProps,
    },
  ];
};
