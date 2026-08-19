'use client';

import React, { useState } from 'react';
import styles from './SettingsPanel.module.css';

export interface SlicerSettings {
  layerHeight: number;
  infillDensity: number;
  infillPattern: string;
  printSpeed: number;
  nozzleTemp: number;
  bedTemp: number;
  supportEnabled: boolean;
  adhesionType: string;
  wallCount: number;
  topLayers: number;
  bottomLayers: number;
  nozzleDiameter: number;
  filamentDiameter: number;
  retractionEnabled: boolean;
  retractionDistance: number;
  retractionSpeed: number;
}

interface SettingsPanelProps {
  settings: SlicerSettings;
  onSettingsChange: (settings: SlicerSettings) => void;
}

export const DEFAULT_SETTINGS: SlicerSettings = {
  layerHeight: 0.2,
  infillDensity: 20,
  infillPattern: 'grid',
  printSpeed: 50,
  nozzleTemp: 200,
  bedTemp: 60,
  supportEnabled: false,
  adhesionType: 'skirt',
  wallCount: 2,
  topLayers: 4,
  bottomLayers: 4,
  nozzleDiameter: 0.4,
  filamentDiameter: 1.75,
  retractionEnabled: true,
  retractionDistance: 5,
  retractionSpeed: 45,
};

const PRINTER_PRESETS: Record<string, Partial<SlicerSettings>> = {
  generic: {},
  ender3: {
    nozzleTemp: 200,
    bedTemp: 60,
    printSpeed: 50,
    nozzleDiameter: 0.4,
  },
  prusa_mk3s: {
    nozzleTemp: 215,
    bedTemp: 60,
    printSpeed: 60,
    nozzleDiameter: 0.4,
  },
  bambu_a1: {
    nozzleTemp: 220,
    bedTemp: 55,
    printSpeed: 100,
    nozzleDiameter: 0.4,
  },
};

export default function SettingsPanel({ settings, onSettingsChange }: SettingsPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    quality: true,
    infill: true,
    speed: false,
    temperature: false,
    support: false,
    retraction: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const updateSetting = <K extends keyof SlicerSettings>(key: K, value: SlicerSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const applyPreset = (presetKey: string) => {
    const preset = PRINTER_PRESETS[presetKey];
    if (preset) {
      onSettingsChange({ ...DEFAULT_SETTINGS, ...preset });
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h3 className={styles.panelTitle}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 1.5L16 5.5V12.5L9 16.5L2 12.5V5.5L9 1.5Z" stroke="var(--accent-primary)" strokeWidth="1.5" fill="none" />
            <circle cx="9" cy="9" r="2.5" stroke="var(--accent-primary)" strokeWidth="1.5" />
          </svg>
          Slicer Settings
        </h3>
      </div>

      {/* Printer Preset */}
      <div className={styles.presetSection}>
        <label className="input-label">Printer Preset</label>
        <select
          className="select-field"
          onChange={(e) => applyPreset(e.target.value)}
          defaultValue="generic"
          id="printer-preset-select"
        >
          <option value="generic">Generic FDM</option>
          <option value="ender3">Creality Ender 3</option>
          <option value="prusa_mk3s">Prusa MK3S+</option>
          <option value="bambu_a1">Bambu Lab A1</option>
        </select>
      </div>

      <div className={styles.sections}>
        {/* Quality Section */}
        <Section title="Quality" icon="◆" expanded={expandedSections.quality} onToggle={() => toggleSection('quality')}>
          <div className={styles.settingRow}>
            <div className={styles.settingHeader}>
              <label className={styles.settingLabel}>Layer Height</label>
              <span className={styles.settingValue}>{settings.layerHeight} mm</span>
            </div>
            <input
              type="range"
              className="range-slider"
              min={0.05}
              max={0.4}
              step={0.05}
              value={settings.layerHeight}
              onChange={(e) => updateSetting('layerHeight', parseFloat(e.target.value))}
              id="layer-height-slider"
            />
          </div>
          <div className={styles.settingRow}>
            <div className={styles.settingHeader}>
              <label className={styles.settingLabel}>Wall Count</label>
              <span className={styles.settingValue}>{settings.wallCount}</span>
            </div>
            <input
              type="range"
              className="range-slider"
              min={1}
              max={6}
              step={1}
              value={settings.wallCount}
              onChange={(e) => updateSetting('wallCount', parseInt(e.target.value))}
              id="wall-count-slider"
            />
          </div>
          <div className={styles.settingRow}>
            <div className={styles.settingHeader}>
              <label className={styles.settingLabel}>Top Layers</label>
              <span className={styles.settingValue}>{settings.topLayers}</span>
            </div>
            <input
              type="range"
              className="range-slider"
              min={0}
              max={10}
              step={1}
              value={settings.topLayers}
              onChange={(e) => updateSetting('topLayers', parseInt(e.target.value))}
              id="top-layers-slider"
            />
          </div>
          <div className={styles.settingRow}>
            <div className={styles.settingHeader}>
              <label className={styles.settingLabel}>Bottom Layers</label>
              <span className={styles.settingValue}>{settings.bottomLayers}</span>
            </div>
            <input
              type="range"
              className="range-slider"
              min={0}
              max={10}
              step={1}
              value={settings.bottomLayers}
              onChange={(e) => updateSetting('bottomLayers', parseInt(e.target.value))}
              id="bottom-layers-slider"
            />
          </div>
        </Section>

        {/* Infill Section */}
        <Section title="Infill" icon="▦" expanded={expandedSections.infill} onToggle={() => toggleSection('infill')}>
          <div className={styles.settingRow}>
            <div className={styles.settingHeader}>
              <label className={styles.settingLabel}>Infill Density</label>
              <span className={styles.settingValue}>{settings.infillDensity}%</span>
            </div>
            <input
              type="range"
              className="range-slider"
              min={0}
              max={100}
              step={5}
              value={settings.infillDensity}
              onChange={(e) => updateSetting('infillDensity', parseInt(e.target.value))}
              id="infill-density-slider"
            />
          </div>
          <div className={styles.settingRow}>
            <label className={styles.settingLabel}>Infill Pattern</label>
            <select
              className="select-field"
              value={settings.infillPattern}
              onChange={(e) => updateSetting('infillPattern', e.target.value)}
              id="infill-pattern-select"
            >
              <option value="grid">Grid</option>
              <option value="lines">Lines</option>
              <option value="triangles">Triangles</option>
              <option value="honeycomb">Honeycomb</option>
              <option value="concentric">Concentric</option>
            </select>
          </div>
        </Section>

        {/* Speed Section */}
        <Section title="Speed" icon="⚡" expanded={expandedSections.speed} onToggle={() => toggleSection('speed')}>
          <div className={styles.settingRow}>
            <div className={styles.settingHeader}>
              <label className={styles.settingLabel}>Print Speed</label>
              <span className={styles.settingValue}>{settings.printSpeed} mm/s</span>
            </div>
            <input
              type="range"
              className="range-slider"
              min={10}
              max={200}
              step={5}
              value={settings.printSpeed}
              onChange={(e) => updateSetting('printSpeed', parseInt(e.target.value))}
              id="print-speed-slider"
            />
          </div>
        </Section>

        {/* Temperature Section */}
        <Section title="Temperature" icon="🌡" expanded={expandedSections.temperature} onToggle={() => toggleSection('temperature')}>
          <div className={styles.settingRow}>
            <div className={styles.settingHeader}>
              <label className={styles.settingLabel}>Nozzle Temp</label>
              <span className={styles.settingValue}>{settings.nozzleTemp}°C</span>
            </div>
            <input
              type="range"
              className="range-slider"
              min={170}
              max={280}
              step={5}
              value={settings.nozzleTemp}
              onChange={(e) => updateSetting('nozzleTemp', parseInt(e.target.value))}
              id="nozzle-temp-slider"
            />
          </div>
          <div className={styles.settingRow}>
            <div className={styles.settingHeader}>
              <label className={styles.settingLabel}>Bed Temp</label>
              <span className={styles.settingValue}>{settings.bedTemp}°C</span>
            </div>
            <input
              type="range"
              className="range-slider"
              min={0}
              max={120}
              step={5}
              value={settings.bedTemp}
              onChange={(e) => updateSetting('bedTemp', parseInt(e.target.value))}
              id="bed-temp-slider"
            />
          </div>
        </Section>

        {/* Support Section */}
        <Section title="Support & Adhesion" icon="🏗" expanded={expandedSections.support} onToggle={() => toggleSection('support')}>
          <div className={styles.settingRow}>
            <div className="toggle-wrapper">
              <label className={styles.settingLabel}>Enable Support</label>
              <label className="toggle" id="support-toggle">
                <input
                  type="checkbox"
                  checked={settings.supportEnabled}
                  onChange={(e) => updateSetting('supportEnabled', e.target.checked)}
                />
                <span className="toggle-track"></span>
                <span className="toggle-thumb"></span>
              </label>
            </div>
          </div>
          <div className={styles.settingRow}>
            <label className={styles.settingLabel}>Bed Adhesion</label>
            <select
              className="select-field"
              value={settings.adhesionType}
              onChange={(e) => updateSetting('adhesionType', e.target.value)}
              id="adhesion-type-select"
            >
              <option value="none">None</option>
              <option value="skirt">Skirt</option>
              <option value="brim">Brim</option>
              <option value="raft">Raft</option>
            </select>
          </div>
        </Section>

        {/* Retraction Section */}
        <Section title="Retraction" icon="↩" expanded={expandedSections.retraction} onToggle={() => toggleSection('retraction')}>
          <div className={styles.settingRow}>
            <div className="toggle-wrapper">
              <label className={styles.settingLabel}>Enable Retraction</label>
              <label className="toggle" id="retraction-toggle">
                <input
                  type="checkbox"
                  checked={settings.retractionEnabled}
                  onChange={(e) => updateSetting('retractionEnabled', e.target.checked)}
                />
                <span className="toggle-track"></span>
                <span className="toggle-thumb"></span>
              </label>
            </div>
          </div>
          {settings.retractionEnabled && (
            <>
              <div className={styles.settingRow}>
                <div className={styles.settingHeader}>
                  <label className={styles.settingLabel}>Distance</label>
                  <span className={styles.settingValue}>{settings.retractionDistance} mm</span>
                </div>
                <input
                  type="range"
                  className="range-slider"
                  min={0}
                  max={10}
                  step={0.5}
                  value={settings.retractionDistance}
                  onChange={(e) => updateSetting('retractionDistance', parseFloat(e.target.value))}
                  id="retraction-distance-slider"
                />
              </div>
              <div className={styles.settingRow}>
                <div className={styles.settingHeader}>
                  <label className={styles.settingLabel}>Speed</label>
                  <span className={styles.settingValue}>{settings.retractionSpeed} mm/s</span>
                </div>
                <input
                  type="range"
                  className="range-slider"
                  min={10}
                  max={100}
                  step={5}
                  value={settings.retractionSpeed}
                  onChange={(e) => updateSetting('retractionSpeed', parseInt(e.target.value))}
                  id="retraction-speed-slider"
                />
              </div>
            </>
          )}
        </Section>
      </div>
    </div>
  );
}

/* Collapsible Section Component */
function Section({
  title,
  icon,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  icon: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`${styles.section} ${expanded ? styles.sectionExpanded : ''}`}>
      <button className={styles.sectionToggle} onClick={onToggle} type="button" id={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}>
        <span className={styles.sectionIcon}>{icon}</span>
        <span className={styles.sectionTitle}>{title}</span>
        <svg
          className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ''}`}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className={`${styles.sectionContent} ${expanded ? styles.sectionContentExpanded : ''}`}>
        <div className={styles.sectionInner}>{children}</div>
      </div>
    </div>
  );
}
