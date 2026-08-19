/**
 * slicer.ts
 * 
 * A JavaScript-based 3D model slicer that converts mesh geometry to G-code.
 * This is a client-side slicer that runs entirely in the browser.
 *
 * Algorithm:
 * 1. Collect all triangles from the mesh
 * 2. For each layer height, intersect all triangles with a horizontal plane
 * 3. Assemble intersection segments into closed contours (perimeters)
 * 4. Generate infill patterns inside the contours
 * 5. Convert paths to G-code move commands
 */

import type { SlicerSettings } from '@/components/SettingsPanel';

// ---- Types ----
interface Vec2 {
  x: number;
  y: number;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Triangle {
  v0: Vec3;
  v1: Vec3;
  v2: Vec3;
}

interface Segment {
  start: Vec2;
  end: Vec2;
}

interface SliceResult {
  gcode: string;
  layerCount: number;
  estimatedTime: number; // seconds
  filamentLength: number; // mm
  filamentWeight: number; // grams
}

type ProgressCallback = (progress: number, message: string) => void;

// ---- Epsilon for float comparison ----
const EPSILON = 1e-6;

/**
 * Main slicing function
 */
export async function sliceModel(
  vertices: Float32Array,
  settings: SlicerSettings,
  onProgress?: ProgressCallback
): Promise<SliceResult> {
  onProgress?.(0, 'Preparing mesh...');

  // Step 1: Build triangles
  const triangles = buildTriangles(vertices);

  // Step 2: Find Z bounds
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const tri of triangles) {
    for (const v of [tri.v0, tri.v1, tri.v2]) {
      minZ = Math.min(minZ, v.z);
      maxZ = Math.max(maxZ, v.z);
    }
  }

  // Step 3: Generate layers
  const layerHeight = settings.layerHeight;
  const layers: number[] = [];
  for (let z = minZ + layerHeight / 2; z < maxZ; z += layerHeight) {
    layers.push(z);
  }

  if (layers.length === 0) {
    throw new Error('Model is too small to slice with current layer height');
  }

  onProgress?.(5, `Slicing ${layers.length} layers...`);

  // Step 4: Slice each layer and generate G-code
  const gcodeLines: string[] = [];
  let totalFilament = 0;
  let totalTime = 0;
  let currentE = 0; // Extruder position

  // G-code header
  gcodeLines.push(...generateHeader(settings));

  // Start-up gcode
  gcodeLines.push(...generateStartGcode(settings));

  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const z = layers[layerIdx];
    const progress = 5 + (layerIdx / layers.length) * 90;
    if (layerIdx % 10 === 0) {
      onProgress?.(progress, `Slicing layer ${layerIdx + 1} / ${layers.length}...`);
      // Yield to main thread periodically
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // Get contours for this layer
    const segments = sliceAtZ(triangles, z);
    const contours = assembleContours(segments);

    if (contours.length === 0) continue;

    // Layer change gcode
    const layerZ = ((layerIdx + 1) * layerHeight).toFixed(3);
    gcodeLines.push(`; LAYER ${layerIdx}`);
    gcodeLines.push(`G0 Z${layerZ} F{${settings.printSpeed * 60}}`);

    // Determine if this is a top/bottom layer
    const isBottomLayer = layerIdx < settings.bottomLayers;
    const isTopLayer = layerIdx >= layers.length - settings.topLayers;

    // Generate perimeters (walls)
    for (const contour of contours) {
      if (contour.length < 2) continue;

      // Generate wall perimeters
      for (let wall = 0; wall < settings.wallCount; wall++) {
        const offsetContour = wall === 0 ? contour : offsetPath(contour, -wall * settings.nozzleDiameter);
        if (offsetContour.length < 2) continue;

        // Travel to start
        gcodeLines.push(`G0 X${offsetContour[0].x.toFixed(3)} Y${offsetContour[0].y.toFixed(3)} F${settings.printSpeed * 60}`);

        // Print perimeter
        for (let i = 1; i < offsetContour.length; i++) {
          const dist = distance(offsetContour[i - 1], offsetContour[i]);
          currentE += extrusionAmount(dist, settings);
          totalFilament += dist;
          totalTime += dist / settings.printSpeed;
          gcodeLines.push(
            `G1 X${offsetContour[i].x.toFixed(3)} Y${offsetContour[i].y.toFixed(3)} E${currentE.toFixed(5)} F${settings.printSpeed * 60}`
          );
        }

        // Close the loop
        if (offsetContour.length > 2) {
          const dist = distance(offsetContour[offsetContour.length - 1], offsetContour[0]);
          currentE += extrusionAmount(dist, settings);
          totalFilament += dist;
          gcodeLines.push(
            `G1 X${offsetContour[0].x.toFixed(3)} Y${offsetContour[0].y.toFixed(3)} E${currentE.toFixed(5)} F${settings.printSpeed * 60}`
          );
        }
      }
    }

    // Generate infill
    const infillDensity = (isBottomLayer || isTopLayer) ? 100 : settings.infillDensity;
    if (infillDensity > 0) {
      const infillLines = generateInfill(contours, infillDensity, settings, layerIdx);
      for (const line of infillLines) {
        // Travel to start
        gcodeLines.push(`G0 X${line.start.x.toFixed(3)} Y${line.start.y.toFixed(3)} F${settings.printSpeed * 60}`);
        const dist = distance(line.start, line.end);
        currentE += extrusionAmount(dist, settings);
        totalFilament += dist;
        totalTime += dist / settings.printSpeed;
        gcodeLines.push(
          `G1 X${line.end.x.toFixed(3)} Y${line.end.y.toFixed(3)} E${currentE.toFixed(5)} F${settings.printSpeed * 60}`
        );
      }
    }

    // Retraction between layers
    if (settings.retractionEnabled) {
      currentE -= settings.retractionDistance;
      gcodeLines.push(`G1 E${currentE.toFixed(5)} F${settings.retractionSpeed * 60}`);
    }
  }

  // End gcode
  gcodeLines.push(...generateEndGcode(settings));

  onProgress?.(98, 'Generating G-code file...');

  const gcode = gcodeLines.join('\n');
  const filamentLengthM = totalFilament / 1000;
  // PLA: ~1.24 g/cm³, 1.75mm diameter filament
  const filamentVolume = Math.PI * Math.pow(settings.filamentDiameter / 2, 2) * totalFilament; // mm³
  const filamentWeightG = (filamentVolume / 1000) * 1.24; // grams

  onProgress?.(100, 'Done!');

  return {
    gcode,
    layerCount: layers.length,
    estimatedTime: totalTime,
    filamentLength: totalFilament,
    filamentWeight: filamentWeightG,
  };
}

// ---- Helpers ----

function buildTriangles(vertices: Float32Array): Triangle[] {
  const triangles: Triangle[] = [];
  for (let i = 0; i < vertices.length; i += 9) {
    triangles.push({
      v0: { x: vertices[i], y: vertices[i + 1], z: vertices[i + 2] },
      v1: { x: vertices[i + 3], y: vertices[i + 4], z: vertices[i + 5] },
      v2: { x: vertices[i + 6], y: vertices[i + 7], z: vertices[i + 8] },
    });
  }
  return triangles;
}

/**
 * Intersect all triangles with a plane at height z.
 * Returns line segments where the plane crosses the mesh surface.
 */
function sliceAtZ(triangles: Triangle[], z: number): Segment[] {
  const segments: Segment[] = [];

  for (const tri of triangles) {
    // Convert 3D vertices to use Z as the vertical axis
    // STL/OBJ typically use Y-up, but we adapt to the geometry's orientation
    const verts = [
      { x: tri.v0.x, y: tri.v0.y, z: tri.v0.z },
      { x: tri.v1.x, y: tri.v1.y, z: tri.v1.z },
      { x: tri.v2.x, y: tri.v2.y, z: tri.v2.z },
    ];

    // Classify vertices relative to the plane
    const above = verts.filter((v) => v.z > z + EPSILON);
    const below = verts.filter((v) => v.z < z - EPSILON);
    const on = verts.filter((v) => Math.abs(v.z - z) <= EPSILON);

    if (on.length === 3) continue; // Coplanar, skip
    if (on.length === 2) {
      // Edge on plane
      segments.push({
        start: { x: on[0].x, y: on[0].y },
        end: { x: on[1].x, y: on[1].y },
      });
      continue;
    }
    if (on.length === 1) {
      if (above.length === 1 && below.length === 1) {
        // One vertex on plane, other two on different sides
        const intersection = intersectEdge(above[0], below[0], z);
        if (intersection) {
          segments.push({
            start: { x: on[0].x, y: on[0].y },
            end: intersection,
          });
        }
      }
      continue;
    }

    if (above.length === 0 || below.length === 0) continue; // Triangle fully above or below

    // Standard case: triangle crosses the plane
    const minority = above.length === 1 ? above : below;
    const majority = above.length === 1 ? below : above;

    const p0 = intersectEdge(minority[0], majority[0], z);
    const p1 = intersectEdge(minority[0], majority[1], z);

    if (p0 && p1) {
      segments.push({ start: p0, end: p1 });
    }
  }

  return segments;
}

function intersectEdge(v0: Vec3, v1: Vec3, z: number): Vec2 | null {
  const dz = v1.z - v0.z;
  if (Math.abs(dz) < EPSILON) return null;
  const t = (z - v0.z) / dz;
  if (t < -EPSILON || t > 1 + EPSILON) return null;
  return {
    x: v0.x + t * (v1.x - v0.x),
    y: v0.y + t * (v1.y - v0.y),
  };
}

/**
 * Assemble loose segments into closed contours
 */
function assembleContours(segments: Segment[]): Vec2[][] {
  if (segments.length === 0) return [];

  const contours: Vec2[][] = [];
  const used = new Array(segments.length).fill(false);

  for (let start = 0; start < segments.length; start++) {
    if (used[start]) continue;

    const contour: Vec2[] = [segments[start].start, segments[start].end];
    used[start] = true;

    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < segments.length; i++) {
        if (used[i]) continue;
        const last = contour[contour.length - 1];

        if (pointsClose(last, segments[i].start)) {
          contour.push(segments[i].end);
          used[i] = true;
          changed = true;
        } else if (pointsClose(last, segments[i].end)) {
          contour.push(segments[i].start);
          used[i] = true;
          changed = true;
        }
      }
    }

    if (contour.length >= 3) {
      contours.push(contour);
    }
  }

  return contours;
}

function pointsClose(a: Vec2, b: Vec2): boolean {
  return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Simple path offset (shrink contour inward)
 */
function offsetPath(contour: Vec2[], offset: number): Vec2[] {
  if (contour.length < 3) return contour;

  const result: Vec2[] = [];
  for (let i = 0; i < contour.length; i++) {
    const prev = contour[(i - 1 + contour.length) % contour.length];
    const curr = contour[i];
    const next = contour[(i + 1) % contour.length];

    // Calculate normal direction at this vertex
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1;
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;

    // Average normal
    const nx = -(dy1 / len1 + dy2 / len2) / 2;
    const ny = (dx1 / len1 + dx2 / len2) / 2;
    const nl = Math.sqrt(nx * nx + ny * ny) || 1;

    result.push({
      x: curr.x + (nx / nl) * offset,
      y: curr.y + (ny / nl) * offset,
    });
  }

  return result;
}

/**
 * Generate infill lines inside contours
 */
function generateInfill(
  contours: Vec2[][],
  density: number,
  settings: SlicerSettings,
  layerIdx: number
): Segment[] {
  if (density <= 0) return [];

  // Calculate bounding box of all contours
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const contour of contours) {
    for (const pt of contour) {
      minX = Math.min(minX, pt.x);
      maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y);
      maxY = Math.max(maxY, pt.y);
    }
  }

  const spacing = settings.nozzleDiameter / (density / 100);
  const segments: Segment[] = [];

  // Alternate infill direction each layer (for grid pattern)
  const useXDirection = settings.infillPattern === 'grid'
    ? layerIdx % 2 === 0
    : settings.infillPattern === 'lines'
    ? layerIdx % 2 === 0
    : true;

  if (useXDirection) {
    // Horizontal lines
    for (let y = minY + spacing; y < maxY; y += spacing) {
      const intersections: number[] = [];

      for (const contour of contours) {
        for (let i = 0; i < contour.length; i++) {
          const a = contour[i];
          const b = contour[(i + 1) % contour.length];

          if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
            const t = (y - a.y) / (b.y - a.y);
            intersections.push(a.x + t * (b.x - a.x));
          }
        }
      }

      intersections.sort((a, b) => a - b);

      for (let i = 0; i + 1 < intersections.length; i += 2) {
        // Offset inward
        const innerStart = intersections[i] + settings.nozzleDiameter * settings.wallCount;
        const innerEnd = intersections[i + 1] - settings.nozzleDiameter * settings.wallCount;
        if (innerStart < innerEnd) {
          segments.push({
            start: { x: innerStart, y },
            end: { x: innerEnd, y },
          });
        }
      }
    }
  } else {
    // Vertical lines
    for (let x = minX + spacing; x < maxX; x += spacing) {
      const intersections: number[] = [];

      for (const contour of contours) {
        for (let i = 0; i < contour.length; i++) {
          const a = contour[i];
          const b = contour[(i + 1) % contour.length];

          if ((a.x <= x && b.x > x) || (b.x <= x && a.x > x)) {
            const t = (x - a.x) / (b.x - a.x);
            intersections.push(a.y + t * (b.y - a.y));
          }
        }
      }

      intersections.sort((a, b) => a - b);

      for (let i = 0; i + 1 < intersections.length; i += 2) {
        const innerStart = intersections[i] + settings.nozzleDiameter * settings.wallCount;
        const innerEnd = intersections[i + 1] - settings.nozzleDiameter * settings.wallCount;
        if (innerStart < innerEnd) {
          segments.push({
            start: { x, y: innerStart },
            end: { x, y: innerEnd },
          });
        }
      }
    }
  }

  return segments;
}

/**
 * Calculate extrusion amount for a move distance
 */
function extrusionAmount(moveDistance: number, settings: SlicerSettings): number {
  const nozzleArea = settings.nozzleDiameter * settings.layerHeight;
  const filamentArea = Math.PI * Math.pow(settings.filamentDiameter / 2, 2);
  return (nozzleArea / filamentArea) * moveDistance;
}

// ---- G-code Generation ----

function generateHeader(settings: SlicerSettings): string[] {
  return [
    '; Generated by SliceFree — https://slicefree.app',
    `; Layer Height: ${settings.layerHeight} mm`,
    `; Infill: ${settings.infillDensity}% ${settings.infillPattern}`,
    `; Print Speed: ${settings.printSpeed} mm/s`,
    `; Nozzle Temp: ${settings.nozzleTemp}°C`,
    `; Bed Temp: ${settings.bedTemp}°C`,
    `; Walls: ${settings.wallCount}`,
    `; Support: ${settings.supportEnabled ? 'Yes' : 'No'}`,
    `; Adhesion: ${settings.adhesionType}`,
    `; Generated: ${new Date().toISOString()}`,
    '',
  ];
}

function generateStartGcode(settings: SlicerSettings): string[] {
  return [
    '; START GCODE',
    'G28 ; Home all axes',
    `M104 S${settings.nozzleTemp} ; Set nozzle temperature`,
    `M140 S${settings.bedTemp} ; Set bed temperature`,
    `M109 S${settings.nozzleTemp} ; Wait for nozzle temperature`,
    `M190 S${settings.bedTemp} ; Wait for bed temperature`,
    'G90 ; Absolute positioning',
    'M82 ; Absolute extrusion',
    'G92 E0 ; Reset extruder',
    'G1 Z5 F3000 ; Lift nozzle',
    'G1 X0.1 Y20 Z0.3 F5000.0 ; Move to start position',
    'G1 X0.1 Y200.0 Z0.3 F1500.0 E15 ; Draw purge line',
    'G1 X0.4 Y200.0 Z0.3 F5000.0 ; Move to side',
    'G1 X0.4 Y20 Z0.3 F1500.0 E30 ; Draw second purge line',
    'G92 E0 ; Reset extruder',
    'G1 Z2.0 F3000 ; Lift',
    '',
    '; LAYER START',
    '',
  ];
}

function generateEndGcode(settings: SlicerSettings): string[] {
  return [
    '',
    '; END GCODE',
    'G91 ; Relative positioning',
    'G1 E-2 F2700 ; Retract',
    'G1 Z10 F3000 ; Lift',
    'G90 ; Absolute positioning',
    'G1 X0 Y220 F3000 ; Present print',
    'M104 S0 ; Turn off nozzle',
    'M140 S0 ; Turn off bed',
    'M84 ; Disable motors',
    '; SliceFree — Free 3D slicer',
  ];
}
