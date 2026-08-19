'use client';

import React, { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import * as THREE from 'three';
import Header from '@/components/Header';
import FileUpload from '@/components/FileUpload';
import SettingsPanel, { DEFAULT_SETTINGS, type SlicerSettings } from '@/components/SettingsPanel';
import SliceButton from '@/components/SliceButton';
import Footer from '@/components/Footer';
import { parseModelFile, type ParsedModel } from '@/lib/fileParser';
import { sliceModel } from '@/lib/slicer';
import styles from './page.module.css';

// Dynamically import ModelViewer (uses Three.js, no SSR)
const ModelViewer = dynamic(() => import('@/components/ModelViewer'), { ssr: false });

interface SliceResultState {
  gcode: string;
  layerCount: number;
  estimatedTime: number;
  filamentLength: number;
  filamentWeight: number;
}

export default function Home() {
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [modelInfo, setModelInfo] = useState<{
    triangles: number;
    dimensions: { x: number; y: number; z: number };
  } | null>(null);
  const [parsedModel, setParsedModel] = useState<ParsedModel | null>(null);
  const [settings, setSettings] = useState<SlicerSettings>(DEFAULT_SETTINGS);
  const [isSlicing, setIsSlicing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [sliceResult, setSliceResult] = useState<SliceResultState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileLoaded = useCallback(async (file: File, buffer: ArrayBuffer) => {
    setError(null);
    setSliceResult(null);
    setCurrentFile(file);

    try {
      const parsed = await parseModelFile(file, buffer);
      setGeometry(parsed.geometry);
      setModelInfo({
        triangles: parsed.triangles,
        dimensions: parsed.dimensions,
      });
      setParsedModel(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse model file');
      setGeometry(null);
      setModelInfo(null);
      setParsedModel(null);
    }
  }, []);

  const handleSlice = useCallback(async () => {
    if (!parsedModel) return;

    setIsSlicing(true);
    setProgress(0);
    setProgressMessage('Starting...');
    setSliceResult(null);
    setError(null);

    try {
      const result = await sliceModel(
        parsedModel.vertices,
        settings,
        (prog, msg) => {
          setProgress(prog);
          setProgressMessage(msg);
        }
      );

      setSliceResult({
        gcode: result.gcode,
        layerCount: result.layerCount,
        estimatedTime: result.estimatedTime,
        filamentLength: result.filamentLength,
        filamentWeight: result.filamentWeight,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Slicing failed');
    } finally {
      setIsSlicing(false);
    }
  }, [parsedModel, settings]);

  const hasFile = !!geometry;

  return (
    <div className={styles.app}>
      <Header />

      <main className={styles.main}>
        {/* Hero Section - shown when no file */}
        {!hasFile && (
          <section className={styles.hero}>
            <div className={styles.heroContent}>
              <div className={styles.heroBadge}>
                <span className="badge badge-accent">
                  <span style={{ fontSize: '0.6rem' }}>●</span>
                  Free & Open Source
                </span>
              </div>
              <h1 className={styles.heroTitle}>
                Convert 3D Models to{' '}
                <span className="text-gradient">G-code</span>
              </h1>
              <p className={styles.heroSubtitle}>
                Upload STL, OBJ, or 3MF files and generate print-ready G-code — 
                entirely in your browser. No uploads, no accounts, no limits.
              </p>

              <div className={styles.heroUpload}>
                <FileUpload onFileLoaded={handleFileLoaded} currentFile={currentFile} />
              </div>

              {/* Features */}
              <div className={styles.features}>
                <div className={styles.feature}>
                  <div className={styles.featureIcon}>🔒</div>
                  <div>
                    <h3 className={styles.featureTitle}>100% Private</h3>
                    <p className={styles.featureDesc}>Files never leave your device</p>
                  </div>
                </div>
                <div className={styles.feature}>
                  <div className={styles.featureIcon}>⚡</div>
                  <div>
                    <h3 className={styles.featureTitle}>Instant Slicing</h3>
                    <p className={styles.featureDesc}>WebAssembly-powered speed</p>
                  </div>
                </div>
                <div className={styles.feature}>
                  <div className={styles.featureIcon}>🎯</div>
                  <div>
                    <h3 className={styles.featureTitle}>All Formats</h3>
                    <p className={styles.featureDesc}>STL, OBJ, 3MF supported</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Workspace - shown after file upload */}
        {hasFile && (
          <section className={styles.workspace}>
            {/* Top bar with file info */}
            <div className={styles.workspaceHeader}>
              <FileUpload onFileLoaded={handleFileLoaded} currentFile={currentFile} />
            </div>

            {error && (
              <div className={styles.errorBanner}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="9" cy="9" r="8" stroke="#ef4444" strokeWidth="1.5" />
                  <path d="M9 5V10M9 13V12.5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Main workspace layout */}
            <div className={styles.workspaceLayout}>
              <div className={styles.viewerPanel}>
                <ModelViewer geometry={geometry} modelInfo={modelInfo} />
              </div>
              <div className={styles.settingsPanel}>
                <SettingsPanel settings={settings} onSettingsChange={setSettings} />
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Sticky bottom slice bar */}
      {hasFile && (
        <SliceButton
          onSlice={handleSlice}
          isSlicing={isSlicing}
          progress={progress}
          progressMessage={progressMessage}
          hasFile={hasFile}
          sliceResult={sliceResult}
        />
      )}

      <Footer />
    </div>
  );
}
