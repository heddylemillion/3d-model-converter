'use client';

import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import styles from './FileUpload.module.css';

interface FileUploadProps {
  onFileLoaded: (file: File, arrayBuffer: ArrayBuffer) => void;
  currentFile: File | null;
}

const ACCEPTED_EXTENSIONS: Record<string, string[]> = {
  'model/stl': ['.stl'],
  'model/obj': ['.obj'],
  'model/3mf': ['.3mf'],
  'application/octet-stream': ['.stl', '.obj', '.3mf'],
};

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

export default function FileUpload({ onFileLoaded, currentFile }: FileUploadProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          onFileLoaded(file, reader.result);
        }
      };
      reader.readAsArrayBuffer(file);
    },
    [onFileLoaded]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: ACCEPTED_EXTENSIONS,
    maxSize: MAX_FILE_SIZE,
    multiple: false,
  });

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={styles.wrapper}>
      <div
        {...getRootProps()}
        className={`${styles.dropzone} ${isDragActive ? styles.active : ''} ${currentFile ? styles.hasFile : ''}`}
        id="file-upload-dropzone"
      >
        <input {...getInputProps()} id="file-upload-input" />

        {currentFile ? (
          <div className={styles.fileInfo}>
            <div className={styles.fileIcon}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <path d="M24 4L40 14V34L24 44L8 34V14L24 4Z" fill="url(#file-grad)" fillOpacity="0.2" stroke="url(#file-grad)" strokeWidth="2" />
                <path d="M24 14L32 19V29L24 34L16 29V19L24 14Z" fill="url(#file-grad)" fillOpacity="0.5" />
                <defs>
                  <linearGradient id="file-grad" x1="8" y1="4" x2="40" y2="44">
                    <stop stopColor="#06d6a0" />
                    <stop offset="1" stopColor="#3b82f6" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className={styles.fileDetails}>
              <span className={styles.fileName}>{currentFile.name}</span>
              <span className={styles.fileSize}>{formatSize(currentFile.size)}</span>
            </div>
            <span className={styles.changeFile}>Click or drop to change file</span>
          </div>
        ) : (
          <div className={styles.placeholder}>
            <div className={styles.uploadIcon}>
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                <circle cx="28" cy="28" r="27" stroke="url(#upload-grad)" strokeWidth="2" strokeDasharray="6 4" />
                <path d="M28 18V38M18 28L28 18L38 28" stroke="url(#upload-grad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <defs>
                  <linearGradient id="upload-grad" x1="0" y1="0" x2="56" y2="56">
                    <stop stopColor="#06d6a0" />
                    <stop offset="1" stopColor="#7c3aed" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <h3 className={styles.title}>
              {isDragActive ? 'Drop your model here!' : 'Upload Your 3D Model'}
            </h3>
            <p className={styles.subtitle}>
              Drag & drop or click to browse
            </p>
            <div className={styles.formats}>
              <span className={styles.formatBadge}>.STL</span>
              <span className={styles.formatBadge}>.OBJ</span>
              <span className={styles.formatBadge}>.3MF</span>
            </div>
            <p className={styles.limit}>Max 100 MB</p>
          </div>
        )}
      </div>

      {fileRejections.length > 0 && (
        <div className={styles.error}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="#ef4444" strokeWidth="1.5" />
            <path d="M8 4.5V9M8 11.5V11" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>
            {fileRejections[0]?.errors[0]?.message || 'Invalid file. Please upload an STL, OBJ, or 3MF file.'}
          </span>
        </div>
      )}
    </div>
  );
}
