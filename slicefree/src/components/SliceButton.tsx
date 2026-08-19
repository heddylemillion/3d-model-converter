'use client';

import React from 'react';
import styles from './SliceButton.module.css';

interface SliceButtonProps {
  onSlice: () => void;
  isSlicing: boolean;
  progress: number;
  progressMessage: string;
  hasFile: boolean;
  fileName?: string;
  sliceResult: {
    layerCount: number;
    estimatedTime: number;
    filamentLength: number;
    filamentWeight: number;
    gcode: string;
  } | null;
}

export default function SliceButton({
  onSlice,
  isSlicing,
  progress,
  progressMessage,
  hasFile,
  fileName,
  sliceResult,
}: SliceButtonProps) {
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const downloadGcode = () => {
    if (!sliceResult) return;
    const baseName = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'model';
    const blob = new Blob([sliceResult.gcode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}.gcode`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.bar}>
      <div className={styles.container}>
        {/* Slice Button */}
        <div className={styles.actions}>
          <button
            className={`btn btn-primary btn-lg ${styles.sliceBtn}`}
            onClick={onSlice}
            disabled={!hasFile || isSlicing}
            id="slice-button"
          >
            {isSlicing ? (
              <>
                <span className={styles.spinner}></span>
                Slicing...
              </>
            ) : sliceResult ? (
              <>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M4 10L8 14L16 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Re-Slice
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 2L18 7V13L10 18L2 13V7L10 2Z" stroke="currentColor" strokeWidth="2" fill="none" />
                  <path d="M2 7L10 12L18 7" stroke="currentColor" strokeWidth="2" />
                  <path d="M10 12V18" stroke="currentColor" strokeWidth="2" />
                </svg>
                Slice Model
              </>
            )}
          </button>

          {sliceResult && (
            <button
              className={`btn btn-secondary btn-lg ${styles.downloadBtn}`}
              onClick={downloadGcode}
              id="download-button"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 3V13M10 13L6 9M10 13L14 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 15V16C3 16.5523 3.44772 17 4 17H16C16.5523 17 17 16.5523 17 16V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Download G-code
            </button>
          )}
        </div>

        {/* Progress */}
        {isSlicing && (
          <div className={styles.progress}>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className={styles.progressText}>{progressMessage}</span>
          </div>
        )}

        {/* Results */}
        {sliceResult && !isSlicing && (
          <div className={styles.results}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Layers</span>
              <span className={styles.statValue}>{sliceResult.layerCount.toLocaleString()}</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <span className={styles.statLabel}>Est. Time</span>
              <span className={styles.statValue}>{formatTime(sliceResult.estimatedTime)}</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <span className={styles.statLabel}>Filament</span>
              <span className={styles.statValue}>{(sliceResult.filamentLength / 1000).toFixed(2)} m</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <span className={styles.statLabel}>Weight</span>
              <span className={styles.statValue}>{sliceResult.filamentWeight.toFixed(1)} g</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
