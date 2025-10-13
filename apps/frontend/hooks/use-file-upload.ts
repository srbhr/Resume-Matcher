"use client"

import { useCallback, useRef, useState } from "react"

export type FileMetadata = {
  name: string
  size: number
  type: string
  url: string
  id: string
  uploaded?: boolean
  uploadError?: string
}

export type FileWithPreview = {
  file: File | FileMetadata
  id: string
  preview?: string
}

export type FileUploadOptions = {
  maxFiles?: number
  maxSize?: number
  accept?: string
  multiple?: boolean
  initialFiles?: FileMetadata[]
  onFilesChange?: (files: FileWithPreview[]) => void
  onFilesAdded?: (addedFiles: FileWithPreview[]) => void
  onUploadSuccess?: (uploadedFile: FileWithPreview, response: Record<string, unknown>) => void
  onUploadError?: (file: FileWithPreview, error: string) => void
  uploadUrl?: string
}

export type FileUploadState = {
  files: FileWithPreview[]
  isDragging: boolean
  errors: string[]
  isUploadingGlobal: boolean
}

export const useFileUpload = (
  options: FileUploadOptions = {}
) => {
  const {
    maxFiles = Infinity,
    maxSize = Infinity,
    accept = "*/*",
    multiple = false,
    initialFiles = [],
    onFilesChange,
    onFilesAdded,
    onUploadSuccess,
    onUploadError,
    uploadUrl,
  } = options

  const [state, setState] = useState<FileUploadState>({
    files: initialFiles.map((fileMeta) => ({
      file: fileMeta,
      id: fileMeta.id,
      preview: fileMeta.url,
    })),
    isDragging: false,
    errors: [],
    isUploadingGlobal: false,
  })

  const inputRef = useRef<HTMLInputElement>(null)

  const _uploadFileInternal = useCallback(
    async (fileToUpload: FileWithPreview) => {
      if (!(fileToUpload.file instanceof File)) {
        const errorMsg = `Cannot upload "${(fileToUpload.file as FileMetadata).name}"; it's not a valid file object.`
        console.error(errorMsg, fileToUpload)
        const updatedFileWithMetaError: FileWithPreview = {
          ...fileToUpload,
          file: {
            ...(fileToUpload.file as FileMetadata),
            uploadError: errorMsg,
            uploaded: false,
          }
        }
        setState((prev: FileUploadState) => ({
          ...prev,
          files: prev.files.map((f: FileWithPreview) => f.id === updatedFileWithMetaError.id ? updatedFileWithMetaError : f),
          errors: [...prev.errors, errorMsg],
          isUploadingGlobal: false
        }))
        onUploadError?.(updatedFileWithMetaError, errorMsg)
        return
      }

      if (!uploadUrl) {
        const errorMsg = "Upload URL is not configured."
        console.warn(errorMsg)
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
        }
        setState((prev: FileUploadState) => ({
          ...prev,
          files: prev.files.map((f: FileWithPreview) => f.id === fileWithConfigError.id ? fileWithConfigError : f),
          errors: [...prev.errors, errorMsg],
          isUploadingGlobal: false
        }))
        onUploadError?.(fileWithConfigError, errorMsg)
        return
      }

      const formData = new FormData()
      formData.append("file", fileToUpload.file)

      setState((prev: FileUploadState) => ({ ...prev, isUploadingGlobal: true, errors: [] }))

      try {
        const response = await fetch(uploadUrl, {
          method: "POST",
          body: formData,
        })

        let responseData: Record<string, unknown> = {}
        const contentType = response.headers.get("content-type")

        if (!response.ok) {
          let errorDetail = `Upload failed for ${fileToUpload.file.name}. Status: ${response.status}`
          try {
            const errorText = await response.text()
            errorDetail += ` - ${errorText.substring(0, 200)}`
          } catch (textError: unknown) {
            console.warn("Could not read error response text:", textError)
          }
          throw new Error(errorDetail)
        }

        if (contentType && contentType.includes("application/json")) {
          responseData = await response.json() as Record<string, unknown>
        }

        const resumeId = responseData.resume_id || responseData.id || fileToUpload.id

        const successfullyUploadedFile: FileWithPreview = {
          ...fileToUpload,
          file: {
            name: fileToUpload.file.name,
            size: fileToUpload.file.size,
            type: fileToUpload.file.type,
            id: String(resumeId),
            url: fileToUpload.preview || '',
            uploaded: true,
          }
        }

        setState((prev: FileUploadState) => {
          const updatedFiles = prev.files.map((f: FileWithPreview) =>
            f.id === fileToUpload.id ? successfullyUploadedFile : f
          )
          onUploadSuccess?.(successfullyUploadedFile, responseData)
          return { ...prev, files: updatedFiles, isUploadingGlobal: false }
        })
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : `Error uploading ${(fileToUpload.file as File).name}.`
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
        setState((prev: FileUploadState) => {
          const updatedFiles = prev.files.map((f: FileWithPreview) =>
            f.id === fileToUpload.id ? fileWithError : f
          )
          const newErrors = prev.errors.filter((e: string) => !e.includes(fileWithError.file.name))
          newErrors.push(errorMessage)

          onUploadError?.(fileWithError, errorMessage)
          return { ...prev, files: updatedFiles, errors: newErrors, isUploadingGlobal: false }
        })
      }
    },
    [uploadUrl, onUploadSuccess, onUploadError]
  )

  const addFilesAndUpload = useCallback(
    (newFilesInput: FileList | File[]) => {
      if (state.isUploadingGlobal) return
      if (!newFilesInput || newFilesInput.length === 0) return

      const newFilesArray = Array.from(newFilesInput)
      const currentValidationErrors: string[] = []

      if (!multiple && state.files.length > 0) {
        setState((prev: FileUploadState) => ({ ...prev, files: [], errors: [] }))
      } else {
        setState((prev: FileUploadState) => ({ ...prev, errors: [] }))
      }

      if (!multiple && newFilesArray.length > 1) {
        currentValidationErrors.push("Please select only one file.")
        setState((prev: FileUploadState) => ({ ...prev, errors: currentValidationErrors }))
        if (inputRef.current) inputRef.current.value = ""
        return
      }

      const filesToProcess: FileWithPreview[] = []

      for (const file of newFilesArray) {
        if (!(file instanceof File)) continue

        const isDuplicate = state.files.some((existingFwp: FileWithPreview) =>
          existingFwp.file instanceof File &&
          existingFwp.file.name === file.name &&
          existingFwp.file.size === file.size
        )
        if (isDuplicate) continue

        filesToProcess.push({
          file,
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).substring(2, 9)}`,
          preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        })
      }

      if (currentValidationErrors.length > 0) {
        setState((prev: FileUploadState) => ({ ...prev, errors: [...prev.errors, ...currentValidationErrors] }))
        if (inputRef.current) inputRef.current.value = ""
        return
      }

      if (filesToProcess.length > 0) {
        const filesToAddUpdate = !multiple ? filesToProcess.slice(0, 1) : filesToProcess

        setState((prev: FileUploadState) => {
          const updatedFilesState = !multiple ? filesToAddUpdate : [...prev.files, ...filesToAddUpdate]
          onFilesChange?.(updatedFilesState)
          onFilesAdded?.(filesToAddUpdate)
          return { ...prev, files: updatedFilesState }
        })

        if (uploadUrl) {
          filesToAddUpdate.forEach(fileToUpload => _uploadFileInternal(fileToUpload))
        }
      }

      if (inputRef.current) {
        inputRef.current.value = ""
      }
    },
    [state.isUploadingGlobal, state.files, multiple, uploadUrl, _uploadFileInternal, onFilesChange, onFilesAdded]
  )

  const removeFile = useCallback(
    (id: string) => {
      setState((prev: FileUploadState) => {
        const fileToRemove = prev.files.find((file: FileWithPreview) => file.id === id)
        if (fileToRemove?.preview && fileToRemove.file instanceof File && fileToRemove.file.type.startsWith("image/")) {
          URL.revokeObjectURL(fileToRemove.preview)
        }
        const newFiles = prev.files.filter((file: FileWithPreview) => file.id !== id)
        onFilesChange?.(newFiles)

        let updatedErrors = prev.errors
        if (fileToRemove?.file && 'name' in fileToRemove.file) {
          updatedErrors = prev.errors.filter((err: string) => !err.includes(fileToRemove.file.name as string))
        }
        if (newFiles.length === 0) {
          updatedErrors = []
        }

        if (inputRef.current && newFiles.length === 0) {
          inputRef.current.value = ""
        }
        return { ...prev, files: newFiles, errors: updatedErrors, isUploadingGlobal: newFiles.length > 0 ? prev.isUploadingGlobal : false }
      })
    },
    [onFilesChange]
  )

  const clearFiles = useCallback(() => {
    setState((prev: FileUploadState) => {
      prev.files.forEach((fwp: FileWithPreview) => {
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
  }, [onFilesChange])

  const clearErrors = useCallback(() => {
    setState((prev: FileUploadState) => ({ ...prev, errors: [] }))
  }, [])

  const openFileDialog = useCallback(() => {
    if (state.isUploadingGlobal && !multiple) return
    if (!multiple && state.files.length > 0) return
    inputRef.current?.click()
  }, [state.isUploadingGlobal, state.files.length, multiple])

  return [
    state,
    {
      addFiles: addFilesAndUpload,
      removeFile,
      clearFiles,
      clearErrors,
      openFileDialog,
    },
  ] as const
}