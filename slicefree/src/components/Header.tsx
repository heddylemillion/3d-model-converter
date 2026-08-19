'use client';

import React from 'react';
import styles from './Header.module.css';

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 2L28 9V23L16 30L4 23V9L16 2Z" stroke="url(#logo-gradient)" strokeWidth="2" fill="none" />
              <path d="M16 6L24 11V21L16 26L8 21V11L16 6Z" fill="url(#logo-gradient)" fillOpacity="0.15" stroke="url(#logo-gradient)" strokeWidth="1.5" />
              <path d="M16 10L20 13V19L16 22L12 19V13L16 10Z" fill="url(#logo-gradient)" fillOpacity="0.4" />
              <defs>
                <linearGradient id="logo-gradient" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#06d6a0" />
                  <stop offset="0.5" stopColor="#3b82f6" />
                  <stop offset="1" stopColor="#7c3aed" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className={styles.logoText}>
            <span className={styles.logoName}>Slice<span className={styles.logoAccent}>Free</span></span>
          </div>
        </div>

        <div className={styles.badges}>
          <span className="badge badge-accent">
            <span className={styles.dot}></span>
            100% Free
          </span>
          <span className="badge badge-secondary">Browser-Based</span>
        </div>
      </div>
    </header>
  );
}
