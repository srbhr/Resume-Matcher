"use client"

import type React from "react"
import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type InputHTMLAttributes,
  useEffect,
  useMemo,
} from "react"

export type FileMetadata = {
  name: string
  size: number
  type: string
  url: string // Can be server URL post-upload or preview URL
  id: string // Should be unique identifier for the file entry
  uploaded?: boolean // To track successful upload
  uploadError?: string // To store upload specific error
}

export type FileWithPreview = {
  file: File | FileMetadata // Can be File initially, then FileMetadata post-upload
  id: string // Unique ID for this FileWithPreview item
  preview?: string // URL for preview, e.g., object URL for images
}

export type FileUploadOptions = {
  maxFiles?: number
  maxSize?: number // in bytes
  accept?: string // Comma-separated string of accepted file types
  multiple?: boolean
  initialFiles?: FileMetadata[] // To initialize with already uploaded files
  onFilesChange?: (files: FileWithPreview[]) => void
  onFilesAdded?: (addedFiles: FileWithPreview[]) => void // Called with newly added valid files
  onUploadSuccess?: (uploadedFile: FileWithPreview, response: Record<string, unknown>) => void
  onUploadError?: (file: FileWithPreview, error: string) => void
  uploadUrl?: string // API endpoint for uploading
}

export type FileUploadState = {
  files: FileWithPreview[]
  isDragging: boolean
  errors: string[] // For validation or general errors
  isUploadingGlobal: boolean // Global flag for ongoing upload(s)
}

export type FileUploadActions = {
  addFiles: (files: FileList | File[]) => void // Public API to add and initiate upload
  removeFile: (id: string) => void
  clearFiles: () => void
  clearErrors: () => void
  handleDragEnter: (e: DragEvent<HTMLElement>) => void
  handleDragLeave: (e: DragEvent<HTMLElement>) => void
  handleDragOver: (e: DragEvent<HTMLElement>) => void
  handleDrop: (e: DragEvent<HTMLElement>) => void
  // handleFileChange is usually internal, triggered by getInputProps
  openFileDialog: () => void
  getInputProps: (
    props?: InputHTMLAttributes<HTMLInputElement>
  ) => InputHTMLAttributes<HTMLInputElement> & {
    ref: React.Ref<HTMLInputElement>
  }
}

export const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`
}

export const useFileUpload = (
  options: FileUploadOptions = {}
): [FileUploadState, FileUploadActions] => {
  const {
    maxFiles = Infinity,
    maxSize = 10 * 1024 * 1024, // 10MB default
    accept = "*/*",
    multiple = true,
    initialFiles = [],
    onFilesChange,
    onFilesAdded,
    onUploadSuccess,
    onUploadError,
    uploadUrl,
  } = options

  const [state, setState] = useState<FileUploadState>({
    files: initialFiles.map(fileMetadata => ({
      file: fileMetadata,
      id: fileMetadata.id,
      preview: fileMetadata.url,
    })),
    isDragging: false,
    errors: [],
    isUploadingGlobal: false,
  })

  const inputRef = useRef<HTMLInputElement>(null)
  // Track active upload requests for cancellation
  const activeUploadsRef = useRef<Map<string, AbortController>>(new Map())
  // Track created object URLs for cleanup
  const objectUrlsRef = useRef<Set<string>>(new Set())

  // Cleanup function to prevent memory leaks
  const cleanup = useCallback(() => {
    // Cancel all active uploads
    activeUploadsRef.current.forEach((controller) => {
      controller.abort()
    })
    activeUploadsRef.current.clear()

    // Revoke all object URLs
    objectUrlsRef.current.forEach((url) => {
      URL.revokeObjectURL(url)
    })
    objectUrlsRef.current.clear()
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return cleanup
  }, [cleanup])

  // Optimized validation function with memoization
  const validateFile = useCallback((file: File): string | null => {
    if (file.size > maxSize) {
      return `File "${file.name}" is too large. Maximum size is ${formatBytes(maxSize)}.`
    }

    if (accept !== "*/*") {
      const acceptedTypes = accept.split(",").map((type) => type.trim())
      const isAccepted = acceptedTypes.some((type) => {
        if (type.startsWith(".")) {
          return file.name.toLowerCase().endsWith(type.toLowerCase())
        } else if (type.includes("*")) {
          const regex = new RegExp(type.replace("*", ".*"))
          return regex.test(file.type)
        } else {
          return file.type === type
        }
      })

      if (!isAccepted) {
        return `File "${file.name}" is not an accepted file type. Accepted types: ${accept}.`
      }
    }

    return null
  }, [maxSize, accept])

  // Optimized unique ID generation with better entropy
  const generateUniqueId = useCallback((file: File): string => {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2)
    const fileInfo = `${file.name}-${file.size}-${file.lastModified}`
    return `${timestamp}-${random}-${btoa(fileInfo).replace(/[^a-zA-Z0-9]/g, '').substring(0, 8)}`
  }, [])

  // Memory-efficient preview creation
  const createPreview = useCallback((file: File): string | undefined => {
    if (file.type.startsWith("image/") && file.size < 5 * 1024 * 1024) { // Only for images under 5MB
      const url = URL.createObjectURL(file)
      objectUrlsRef.current.add(url)
      return url
    }
    return undefined
  }, [])

  // Enhanced upload function with retry mechanism and better error handling
  const _uploadFileInternal = async (fileToUpload: FileWithPreview) => {
    // Ensure fileToUpload.file is a File instance for upload
    if (!(fileToUpload.file instanceof File)) {
      const errorMsg = `Cannot upload "${(fileToUpload.file as FileMetadata).name}"; it's not a valid file object for direct upload.`;
      console.error(errorMsg, fileToUpload);

      const updatedFileWithMetaError: FileWithPreview = {
        ...fileToUpload,
        file: {
          ...(fileToUpload.file as FileMetadata),
          uploadError: errorMsg,
          uploaded: false,
        }
      };

      setState(prev => ({
        ...prev,
        files: prev.files.map(f => f.id === updatedFileWithMetaError.id ? updatedFileWithMetaError : f),
        errors: [...prev.errors, errorMsg],
        isUploadingGlobal: false
      }));

      onUploadError?.(updatedFileWithMetaError, errorMsg);
      return;
    }

    if (!uploadUrl) {
      const errorMsg = "Upload URL is not configured."
      console.warn(errorMsg, "File not uploaded:", fileToUpload.file.name)

      const fileWithConfigError: FileWithPreview = {
        ...fileToUpload,
        file: {
          name: fileToUpload.file.name,
          size: fileToUpload.file.size,
          type: fileToUpload.file.type,
          id: fileToUpload.id,
          url: fileToUpload.preview || '',
          uploaded: false,
          uploadError: errorMsg,
        }
      };

      setState(prev => ({
        ...prev,
        files: prev.files.map(f => f.id === fileWithConfigError.id ? fileWithConfigError : f),
        errors: [...prev.errors, errorMsg],
        isUploadingGlobal: false
      }));

      onUploadError?.(fileWithConfigError, errorMsg);
      return;
    }

    // Create abort controller for this upload
    const abortController = new AbortController()
    activeUploadsRef.current.set(fileToUpload.id, abortController)

    const formData = new FormData()
    formData.append("file", fileToUpload.file)

    setState(prev => ({ ...prev, isUploadingGlobal: true, errors: [] }))

    const maxRetries = 2
    let attempt = 0

    while (attempt <= maxRetries) {
      try {
        const response = await fetch(uploadUrl, {
          method: "POST",
          body: formData,
          signal: abortController.signal,
          headers: {
            'Cache-Control': 'no-cache',
          },
        })

        let responseData: Record<string, unknown> = {}
        const contentType = response.headers.get("content-type")

        if (!response.ok) {
          let errorDetail = `Upload failed for ${fileToUpload.file.name}. Status: ${response.status} ${response.statusText}`

          try {
            const errorText = await response.text()
            // Check for specific host header error
            if (errorText.includes('Invalid host header') || errorText.includes('Host header')) {
              errorDetail = `Upload failed: Invalid host header. Please ensure the development server is configured correctly.`
            } else {
              errorDetail += ` - Server response: ${errorText.substring(0, 200)}${errorText.length > 200 ? '...' : ''}`
            }
          } catch (textError: unknown) {
            console.warn("Could not read error response text:", textError)
          }

          throw new Error(errorDetail)
        }

        if (contentType && contentType.includes("application/json")) {
          responseData = await response.json() as Record<string, unknown>
        } else {
          console.warn(`Response for ${fileToUpload.file.name} was not JSON. Content-Type: ${contentType}`)
        }

        const successfullyUploadedFile: FileWithPreview = {
          ...fileToUpload,
          file: {
            name: fileToUpload.file.name,
            size: fileToUpload.file.size,
            type: fileToUpload.file.type,
            id: fileToUpload.id,
            url: typeof responseData.file_url === 'string' ? responseData.file_url :
              (typeof responseData.url === 'string' ? responseData.url : fileToUpload.preview || ''),
            uploaded: true,
          }
        }

        setState(prev => {
          const updatedFiles = prev.files.map(f =>
            f.id === successfullyUploadedFile.id ? successfullyUploadedFile : f
          )
          onUploadSuccess?.(successfullyUploadedFile, responseData)
          return { ...prev, files: updatedFiles, isUploadingGlobal: false }
        })

        // Clean up on success
        activeUploadsRef.current.delete(fileToUpload.id)
        return

      } catch (error: unknown) {
        attempt++

        // If aborted, don't retry
        if (error instanceof DOMException && error.name === 'AbortError') {
          console.log(`Upload cancelled for ${fileToUpload.file.name}`)
          return
        }

        // If max retries reached, handle error
        if (attempt > maxRetries) {
          const errorMessage = error instanceof Error ? error.message : `Error uploading ${fileToUpload.file.name}.`

          const fileWithError: FileWithPreview = {
            ...fileToUpload,
            file: {
              name: (fileToUpload.file as File).name,
              size: (fileToUpload.file as File).size,
              type: (fileToUpload.file as File).type,
              id: fileToUpload.id,
              url: fileToUpload.preview || '',
              uploaded: false,
              uploadError: errorMessage,
            }
          }

          setState(prev => {
            const updatedFiles = prev.files.map(f =>
              f.id === fileWithError.id ? fileWithError : f
            )
            const newErrors = prev.errors.filter(e => !e.includes(fileWithError.file.name))
            newErrors.push(errorMessage)

            onUploadError?.(fileWithError, errorMessage)
            return { ...prev, files: updatedFiles, errors: newErrors, isUploadingGlobal: false }
          })

          // Clean up on final failure
          activeUploadsRef.current.delete(fileToUpload.id)
          return
        }

        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
      }
    }
  }

  const addFilesAndUpload = useCallback(
    (newFilesInput: FileList | File[]) => {
      if (state.isUploadingGlobal) return; // Don't add if already uploading (for single mode primarily)
      if (!newFilesInput || newFilesInput.length === 0) return

      const newFilesArray = Array.from(newFilesInput)
      const currentValidationErrors: string[] = [] // Local to this call

      // For single file mode, if a file already exists (even if being uploaded or failed), replace it.
      if (!multiple && state.files.length > 0) {
        state.files.forEach((fwp) => { // Revoke old preview
          if (fwp.preview && fwp.file instanceof File && fwp.file.type.startsWith("image/")) {
            URL.revokeObjectURL(fwp.preview)
          }
        })
        setState(prev => ({ ...prev, files: [], errors: [] })); // Clear existing files and their errors
      } else {
        setState(prev => ({ ...prev, errors: [] })); // Clear general errors for new batch
      }


      if (!multiple && newFilesArray.length > 1) {
        currentValidationErrors.push("Please select only one file.")
        setState(prev => ({ ...prev, errors: currentValidationErrors }))
        if (inputRef.current) inputRef.current.value = ""
        return
      }

      if (multiple && maxFiles !== Infinity && state.files.length + newFilesArray.length > maxFiles) {
        currentValidationErrors.push(`You can only upload a maximum of ${maxFiles} files.`)
        setState((prev) => ({ ...prev, errors: [...prev.errors, ...currentValidationErrors] }))
        if (inputRef.current) inputRef.current.value = ""
        return
      }

      const filesToProcess: FileWithPreview[] = []

      for (const file of newFilesArray) {
        if (!(file instanceof File)) continue; // Skip if not a File object

        // Duplicate check (more robust for multiple additions)
        const isDuplicate = (!multiple && state.files.length > 0) ? false : // In single mode, we already cleared
          state.files.some(existingFwp =>
            existingFwp.file.name === file.name &&
            existingFwp.file.size === file.size &&
            (existingFwp.file instanceof File ? existingFwp.file.lastModified === file.lastModified : true)
          );
        if (isDuplicate) continue;


        const validationError = validateFile(file)
        if (validationError) {
          currentValidationErrors.push(validationError)
        } else {
          filesToProcess.push({
            file, // Actual File object
            id: generateUniqueId(file),
            preview: createPreview(file),
          })
        }
      }

      if (currentValidationErrors.length > 0) {
        setState((prev) => ({ ...prev, errors: [...prev.errors, ...currentValidationErrors] }))
        if (inputRef.current) inputRef.current.value = ""
        return
      }

      if (filesToProcess.length > 0) {
        const filesToAddUpdate = !multiple ? filesToProcess.slice(0, 1) : filesToProcess;

        setState(prev => {
          const updatedFilesState = !multiple ? filesToAddUpdate : [...prev.files, ...filesToAddUpdate]
          onFilesChange?.(updatedFilesState) // Call with the full list
          onFilesAdded?.(filesToAddUpdate)   // Call with only the newly added valid files
          return {
            ...prev,
            files: updatedFilesState,
          }
        })

        if (uploadUrl) {
          filesToAddUpdate.forEach(fileToUpload => _uploadFileInternal(fileToUpload))
        } else {
          console.warn("uploadUrl not provided. Files added locally but not uploaded.")
          // If no uploadUrl, mark files as 'pending' or similar if needed, or convert to FileMetadata locally
          const filesAsMetadataLocally = filesToAddUpdate.map(fwp => ({
            ...fwp,
            file: { // Convert to FileMetadata to indicate they are processed by the hook
              name: (fwp.file as File).name,
              size: (fwp.file as File).size,
              type: (fwp.file as File).type,
              id: fwp.id,
              url: fwp.preview || '', // Use preview as URL if no upload
              uploaded: false, // Not uploaded
              uploadError: "Upload URL not configured",
            } as FileMetadata
          }));

          setState(prev => {
            const updatedFiles = prev.files.map(existingFile => {
              const found = filesAsMetadataLocally.find(processedFile => processedFile.id === existingFile.id);
              return found || existingFile;
            });
            return { ...prev, files: updatedFiles };
          });
        }
      }

      if (inputRef.current) {
        inputRef.current.value = ""
      }
    },
    [
      state.isUploadingGlobal, state.files, // Critical for logic within
      multiple, maxFiles, uploadUrl,
      validateFile, generateUniqueId, createPreview, // Other useCallback deps
      onFilesChange, onFilesAdded, // Callbacks
      // _uploadFileInternal is not directly a dep but its logic is tied to uploadUrl etc.
      // setState itself is stable.
    ]
  )

  // Cancel upload function
  const cancelUpload = useCallback((fileId: string) => {
    const controller = activeUploadsRef.current.get(fileId)
    if (controller) {
      controller.abort()
      activeUploadsRef.current.delete(fileId)
    }
  }, [])

  // Enhanced removeFile with proper cleanup
  const removeFile = useCallback(
    (id: string) => {
      // Cancel upload if in progress
      cancelUpload(id)

      setState((prev) => {
        const fileToRemove = prev.files.find((file) => file.id === id)

        // Clean up preview URL
        if (fileToRemove?.preview && fileToRemove.file instanceof File && fileToRemove.file.type.startsWith("image/")) {
          URL.revokeObjectURL(fileToRemove.preview)
          objectUrlsRef.current.delete(fileToRemove.preview)
        }

        const newFiles = prev.files.filter((file) => file.id !== id)
        onFilesChange?.(newFiles)

        let updatedErrors = prev.errors
        if (fileToRemove?.file?.name) {
          updatedErrors = prev.errors.filter(err => !err.includes(fileToRemove.file.name))
        }
        if (newFiles.length === 0) {
          updatedErrors = []
        }

        if (inputRef.current && newFiles.length === 0) {
          inputRef.current.value = ""
        }

        return {
          ...prev,
          files: newFiles,
          errors: updatedErrors,
          isUploadingGlobal: newFiles.length > 0 ? prev.isUploadingGlobal : false
        }
      })
    },
    [onFilesChange, cancelUpload]
  )

  // Enhanced clearFiles with proper cleanup
  const clearFiles = useCallback(() => {
    // Cancel all uploads
    cleanup()

    setState((prev) => {
      prev.files.forEach((fwp) => {
        if (fwp.preview && fwp.file instanceof File && fwp.file.type.startsWith("image/")) {
          URL.revokeObjectURL(fwp.preview)
        }
      })

      if (inputRef.current) {
        inputRef.current.value = ""
      }

      const newState = { ...prev, files: [], errors: [], isUploadingGlobal: false }
      onFilesChange?.(newState.files)
      return newState
    })
  }, [onFilesChange, cleanup])

  const clearErrors = useCallback(() => {
    setState((prev) => ({ ...prev, errors: [] }))
  }, []) // setState is stable

  const handleDragEnter = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (state.isUploadingGlobal && !multiple) return;
    if (!multiple && state.files.length > 0) return; // Don't allow drag if single file already present
    setState((prev) => ({ ...prev, isDragging: true }))
  }, [state.isUploadingGlobal, state.files.length, multiple])

  const handleDragLeave = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (state.isUploadingGlobal && !multiple) return;
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    setState((prev) => ({ ...prev, isDragging: false }))
  }, [state.isUploadingGlobal, multiple])

  const handleDragOver = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (state.isUploadingGlobal && !multiple) { e.dataTransfer.dropEffect = "none"; return; }
    if (!multiple && state.files.length > 0) { e.dataTransfer.dropEffect = "none"; return; }
    e.dataTransfer.dropEffect = "copy"; // Explicitly show copy cursor
    setState((prev) => ({ ...prev, isDragging: true }))
  }, [state.isUploadingGlobal, state.files.length, multiple])

  const handleDrop = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setState((prev) => ({ ...prev, isDragging: false }))
      if (state.isUploadingGlobal && !multiple) return;
      if (!multiple && state.files.length > 0) return;

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        addFilesAndUpload(e.dataTransfer.files) // This is addFilesAndUpload
        e.dataTransfer.clearData()
      }
    },
    [addFilesAndUpload, state.isUploadingGlobal, state.files.length, multiple] // addFilesAndUpload is from useCallback
  )

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      // isUploadingGlobal check is handled within addFilesAndUpload for single mode
      if (e.target.files && e.target.files.length > 0) {
        addFilesAndUpload(e.target.files) // This is addFilesAndUpload
      }
    },
    [addFilesAndUpload] // addFilesAndUpload is from useCallback
  )

  const openFileDialog = useCallback(() => {
    if (state.isUploadingGlobal && !multiple) return;
    if (!multiple && state.files.length > 0) return; // Prevent opening if single file already selected
    if (inputRef.current) {
      inputRef.current.click()
    }
  }, [state.isUploadingGlobal, state.files.length, multiple])

  const getInputProps = useCallback(
    (props?: InputHTMLAttributes<HTMLInputElement>) => ({
      ...props,
      ref: inputRef,
      type: "file",
      onChange: handleFileChange,
      accept: accept,
      multiple: multiple,
      // Disable if global upload is happening (especially for single mode)
      // or if it's single mode and a file is already present.
      disabled: (state.isUploadingGlobal && !multiple) || (!multiple && state.files.length > 0),
      style: { display: "none", ...props?.style },
    }),
    [handleFileChange, accept, multiple, state.isUploadingGlobal, state.files.length]
  )

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
  ]
}