'use client';

import React, { useRef, useMemo, useEffect, Suspense } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import styles from './ModelViewer.module.css';

interface ModelViewerProps {
  geometry: THREE.BufferGeometry | null;
  modelInfo: {
    triangles: number;
    dimensions: { x: number; y: number; z: number };
  } | null;
}

function GridFloor() {
  return (
    <group>
      <gridHelper args={[200, 20, '#1e293b', '#1e293b']} position={[0, 0, 0]} />
      <gridHelper args={[200, 200, '#141c2b', '#141c2b']} position={[0, 0, 0]} />
    </group>
  );
}

function Model({ geometry }: { geometry: THREE.BufferGeometry }) {
  const meshRef = useRef<THREE.Mesh>(null);

  const centeredGeometry = useMemo(() => {
    const geo = geometry.clone();
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    const center = new THREE.Vector3();
    box.getCenter(center);
    geo.translate(-center.x, -box.min.y, -center.z);
    geo.computeVertexNormals();
    return geo;
  }, [geometry]);

  useFrame((state) => {
    if (meshRef.current) {
      const t = state.clock.getElapsedTime();
      meshRef.current.material = meshRef.current.material as THREE.MeshPhysicalMaterial;
    }
  });

  return (
    <mesh ref={meshRef} geometry={centeredGeometry} castShadow receiveShadow>
      <meshPhysicalMaterial
        color="#06d6a0"
        metalness={0.1}
        roughness={0.35}
        clearcoat={0.8}
        clearcoatRoughness={0.2}
        envMapIntensity={1}
        transparent
        opacity={0.9}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function CameraSetup({ geometry }: { geometry: THREE.BufferGeometry }) {
  const { camera } = useThree();

  useEffect(() => {
    const geo = geometry.clone();
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 2;

    camera.position.set(distance * 0.8, distance * 0.6, distance * 0.8);
    camera.lookAt(0, size.y / 2, 0);
    (camera as THREE.PerspectiveCamera).near = 0.1;
    (camera as THREE.PerspectiveCamera).far = maxDim * 10;
    camera.updateProjectionMatrix();
  }, [geometry, camera]);

  return null;
}

function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[10, 20, 10]}
        intensity={1}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-10, 10, -5]} intensity={0.3} color="#7c3aed" />
      <pointLight position={[0, 15, 0]} intensity={0.5} color="#06d6a0" />
    </>
  );
}

export default function ModelViewer({ geometry, modelInfo }: ModelViewerProps) {
  if (!geometry) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
            <path d="M40 8L72 24V56L40 72L8 56V24L40 8Z" stroke="url(#empty-grad)" strokeWidth="2" strokeDasharray="6 4" fillOpacity="0" />
            <path d="M40 24L56 32V48L40 56L24 48V32L40 24Z" stroke="url(#empty-grad)" strokeWidth="1.5" strokeDasharray="4 3" fillOpacity="0" />
            <defs>
              <linearGradient id="empty-grad" x1="8" y1="8" x2="72" y2="72">
                <stop stopColor="#334155" />
                <stop offset="1" stopColor="#1e293b" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <p className={styles.emptyText}>Your 3D model preview will appear here</p>
      </div>
    );
  }

  return (
    <div className={styles.viewer}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={null}>
          <SceneLights />
          <Model geometry={geometry} />
          <GridFloor />
          <CameraSetup geometry={geometry} />
          <OrbitControls
            enableDamping
            dampingFactor={0.05}
            minDistance={1}
            maxDistance={1000}
            enablePan
          />
          <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
            <GizmoViewport labelColor="white" axisHeadScale={0.8} />
          </GizmoHelper>
        </Suspense>
      </Canvas>

      {modelInfo && (
        <div className={styles.infoOverlay}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Triangles</span>
            <span className={styles.infoValue}>{modelInfo.triangles.toLocaleString()}</span>
          </div>
          <div className={styles.infoDivider} />
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Size (mm)</span>
            <span className={styles.infoValue}>
              {modelInfo.dimensions.x.toFixed(1)} × {modelInfo.dimensions.y.toFixed(1)} × {modelInfo.dimensions.z.toFixed(1)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
