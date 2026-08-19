'use client';

import React from 'react';
import styles from './Footer.module.css';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.left}>
          <span className={styles.brand}>
            Slice<span className={styles.accent}>Free</span>
          </span>
          <span className={styles.tagline}>
            100% Free • No Account • No Upload • Browser-Only
          </span>
        </div>
        <div className={styles.right}>
          <span className={styles.love}>
            Built with ❤️ for the 3D printing community
          </span>
          <span className={styles.privacy}>
            Your files never leave your device
          </span>
        </div>
      </div>
    </footer>
  );
}
