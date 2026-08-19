/**
 * slicer.ts
 * 
 * A client-side 3D model slicer engine that converts 3D mesh geometry (STL, OBJ, 3MF)
 * into valid, print-ready G-code instructions for FDM 3D printers.
 *
 * Slicing Pipeline:
 * 1. Normalize mesh geometry (center on print bed & align min Z to 0)
 * 2. Slice geometry with horizontal plane at each layer height
 * 3. Assemble intersection segments into closed contours (perimeters)
 * 4. Generate outer & inner wall perimeters
 * 5. Generate solid top/bottom infill & sparse internal infill
 * 6. Generate bed adhesion (skirt / brim)
 * 7. Convert geometric paths into standard FDM G-code commands (G0/G1 moves, E extrusion, temperatures, fan control)
 */

// ---- Types ----
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
export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Triangle {
  v0: Vec3;
  v1: Vec3;
  v2: Vec3;
}

export interface Segment {
  start: Vec2;
  end: Vec2;
}

export interface SliceResult {
  gcode: string;
  layerCount: number;
  estimatedTime: number; // seconds
  filamentLength: number; // mm
  filamentWeight: number; // grams
}

export type ProgressCallback = (progress: number, message: string) => void;

const EPSILON = 1e-6;

/**
 * Main slicing function
 */
export async function sliceModel(
  vertices: Float32Array,
  settings: SlicerSettings,
  onProgress?: ProgressCallback
): Promise<SliceResult> {
  onProgress?.(0, 'Preparing and normalizing mesh...');

  // Step 1: Build triangles and normalize geometry (center on bed, set Z min = 0)
  const rawTriangles = buildTriangles(vertices);
  if (rawTriangles.length === 0) {
    throw new Error('No valid triangles found in mesh.');
  }

  const { triangles, bounds } = normalizeMesh(rawTriangles);

  const modelWidth = bounds.maxX - bounds.minX;
  const modelDepth = bounds.maxY - bounds.minY;
  const modelHeight = bounds.maxZ - bounds.minZ;

  if (modelHeight <= EPSILON) {
    throw new Error('Model has zero height and cannot be sliced.');
  }

  // Step 2: Generate Z layer heights
  const layerHeight = settings.layerHeight;
  const layers: number[] = [];
  // First layer at layerHeight, subsequent layers at z + layerHeight
  for (let z = layerHeight; z <= modelHeight + EPSILON; z += layerHeight) {
    layers.push(z);
  }

  if (layers.length === 0) {
    // If model is thinner than layerHeight, make at least 1 layer
    layers.push(modelHeight);
  }

  onProgress?.(5, `Slicing ${layers.length} layers...`);

  // G-code accumulator
  const gcodeLines: string[] = [];
  let totalFilament = 0; // total extruded length in mm
  let totalTime = 0; // estimated print time in seconds
  let currentE = 0; // cumulative extruder E position in mm

  const printSpeedMin = settings.printSpeed * 60; // mm/min for G-code F parameter
  const travelSpeedMin = settings.printSpeed * 1.5 * 60; // faster travel speed
  const retractionSpeedMin = settings.retractionSpeed * 60;

  // Header & Initialization
  gcodeLines.push(...generateHeader(settings, layers.length, modelWidth, modelDepth, modelHeight));
  gcodeLines.push(...generateStartGcode(settings));

  // Layer 0 Adhesion (Skirt / Brim)
  const firstLayerContours = assembleContours(sliceAtZ(triangles, layerHeight / 2));
  if (firstLayerContours.length > 0 && settings.adhesionType !== 'none') {
    const adhesionLines = generateAdhesion(firstLayerContours, settings, bounds);
    if (adhesionLines.length > 0) {
      gcodeLines.push('; --- BED ADHESION (' + settings.adhesionType.toUpperCase() + ') ---');
      for (const line of adhesionLines) {
        // Move to start
        gcodeLines.push(`G0 X${line.start.x.toFixed(3)} Y${line.start.y.toFixed(3)} F${travelSpeedMin.toFixed(0)}`);
        const dist = distance(line.start, line.end);
        const ext = extrusionAmount(dist, settings.layerHeight, settings);
        currentE += ext;
        totalFilament += dist;
        totalTime += dist / settings.printSpeed;
        gcodeLines.push(
          `G1 X${line.end.x.toFixed(3)} Y${line.end.y.toFixed(3)} E${currentE.toFixed(5)} F${printSpeedMin.toFixed(0)}`
        );
      }
    }
  }

  // Slice each layer
  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const sliceZ = layers[layerIdx] - layerHeight / 2;
    const printZ = layers[layerIdx];

    const progress = 5 + Math.round((layerIdx / layers.length) * 90);
    if (layerIdx % 5 === 0) {
      onProgress?.(progress, `Slicing layer ${layerIdx + 1} / ${layers.length}...`);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const segments = sliceAtZ(triangles, sliceZ);
    const contours = assembleContours(segments);

    if (contours.length === 0) continue;

    const layerZStr = printZ.toFixed(3);
    gcodeLines.push(`; --- LAYER ${layerIdx + 1} / ${layers.length} (Z = ${layerZStr}mm) ---`);
    gcodeLines.push(`G0 Z${layerZStr} F3000`);

    // Fan Control (Turn on fan after layer 1 for proper bed adhesion)
    if (layerIdx === 1) {
      gcodeLines.push('M106 S255 ; Enable cooling fan at 100%');
    } else if (layerIdx === 0) {
      gcodeLines.push('M107 ; Fan off for first layer');
    }

    const isBottomLayer = layerIdx < settings.bottomLayers;
    const isTopLayer = layerIdx >= layers.length - settings.topLayers;

    // Generate Perimeters / Walls
    for (const contour of contours) {
      if (contour.length < 3) continue;

      for (let wall = 0; wall < settings.wallCount; wall++) {
        const offsetDist = -wall * settings.nozzleDiameter * 0.8;
        const wallContour = wall === 0 ? contour : offsetPath(contour, offsetDist);
        if (wallContour.length < 3) continue;

        // Move to start of perimeter
        const startPt = wallContour[0];
        gcodeLines.push(`G0 X${startPt.x.toFixed(3)} Y${startPt.y.toFixed(3)} F${travelSpeedMin.toFixed(0)}`);

        // Print perimeter segments
        for (let i = 1; i <= wallContour.length; i++) {
          const ptPrev = wallContour[i - 1];
          const ptCurr = wallContour[i % wallContour.length];
          const dist = distance(ptPrev, ptCurr);

          if (dist < 0.001) continue;

          const ext = extrusionAmount(dist, settings.layerHeight, settings);
          currentE += ext;
          totalFilament += dist;
          totalTime += dist / settings.printSpeed;

          gcodeLines.push(
            `G1 X${ptCurr.x.toFixed(3)} Y${ptCurr.y.toFixed(3)} E${currentE.toFixed(5)} F${printSpeedMin.toFixed(0)}`
          );
        }
      }
    }

    // Infill Generation
    const infillDensity = (isBottomLayer || isTopLayer) ? 100 : settings.infillDensity;
    if (infillDensity > 0) {
      const infillLines = generateInfill(contours, infillDensity, settings, layerIdx, isTopLayer || isBottomLayer);
      if (infillLines.length > 0) {
        gcodeLines.push(`; Infill (${isBottomLayer ? 'Bottom' : isTopLayer ? 'Top' : 'Sparse'})`);
        for (const line of infillLines) {
          // Travel to line start
          gcodeLines.push(`G0 X${line.start.x.toFixed(3)} Y${line.start.y.toFixed(3)} F${travelSpeedMin.toFixed(0)}`);

          const dist = distance(line.start, line.end);
          if (dist < 0.001) continue;

          const ext = extrusionAmount(dist, settings.layerHeight, settings);
          currentE += ext;
          totalFilament += dist;
          totalTime += dist / settings.printSpeed;

          gcodeLines.push(
            `G1 X${line.end.x.toFixed(3)} Y${line.end.y.toFixed(3)} E${currentE.toFixed(5)} F${printSpeedMin.toFixed(0)}`
          );
        }
      }
    }

    // Layer Retraction
    if (settings.retractionEnabled && layerIdx < layers.length - 1) {
      currentE -= settings.retractionDistance;
      gcodeLines.push(`G1 E${currentE.toFixed(5)} F${retractionSpeedMin.toFixed(0)} ; Retract`);
      currentE += settings.retractionDistance;
      gcodeLines.push(`G1 E${currentE.toFixed(5)} F${retractionSpeedMin.toFixed(0)} ; Unretract`);
    }
  }

  // End G-code
  gcodeLines.push(...generateEndGcode(settings));

  onProgress?.(98, 'Finalizing G-code file...');

  const gcode = gcodeLines.join('\n');
  const filamentVolume = Math.PI * Math.pow(settings.filamentDiameter / 2, 2) * totalFilament; // mm³
  const filamentWeightG = (filamentVolume / 1000) * 1.24; // PLA density ~ 1.24 g/cm³

  onProgress?.(100, 'Done!');

  return {
    gcode,
    layerCount: layers.length,
    estimatedTime: Math.ceil(totalTime),
    filamentLength: Math.round(totalFilament),
    filamentWeight: Number(filamentWeightG.toFixed(1)),
  };
}

// ---- Mesh Processing & Normalization ----

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

interface MeshBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/**
 * Center mesh on print bed (110, 110 for 220x220 bed) and set min Z = 0
 */
function normalizeMesh(triangles: Triangle[]): { triangles: Triangle[]; bounds: MeshBounds } {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const tri of triangles) {
    for (const v of [tri.v0, tri.v1, tri.v2]) {
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
      minZ = Math.min(minZ, v.z);
      maxZ = Math.max(maxZ, v.z);
    }
  }

  // Bed center targets: X = 110, Y = 110
  const currentCenterX = (minX + maxX) / 2;
  const currentCenterY = (minY + maxY) / 2;

  const targetCenterX = 110;
  const targetCenterY = 110;

  const offsetX = targetCenterX - currentCenterX;
  const offsetY = targetCenterY - currentCenterY;
  const offsetZ = -minZ; // place lowest point exactly at Z = 0

  const normalized: Triangle[] = triangles.map((tri) => ({
    v0: { x: tri.v0.x + offsetX, y: tri.v0.y + offsetY, z: tri.v0.z + offsetZ },
    v1: { x: tri.v1.x + offsetX, y: tri.v1.y + offsetY, z: tri.v1.z + offsetZ },
    v2: { x: tri.v2.x + offsetX, y: tri.v2.y + offsetY, z: tri.v2.z + offsetZ },
  }));

  return {
    triangles: normalized,
    bounds: {
      minX: minX + offsetX,
      maxX: maxX + offsetX,
      minY: minY + offsetY,
      maxY: maxY + offsetY,
      minZ: 0,
      maxZ: maxZ + offsetZ,
    },
  };
}

/**
 * Intersect all triangles with a horizontal plane at Z
 */
function sliceAtZ(triangles: Triangle[], z: number): Segment[] {
  const segments: Segment[] = [];

  for (const tri of triangles) {
    const verts = [tri.v0, tri.v1, tri.v2];

    const above = verts.filter((v) => v.z > z + EPSILON);
    const below = verts.filter((v) => v.z < z - EPSILON);
    const on = verts.filter((v) => Math.abs(v.z - z) <= EPSILON);

    if (on.length === 3) continue; // Coplanar triangle
    if (on.length === 2) {
      segments.push({
        start: { x: on[0].x, y: on[0].y },
        end: { x: on[1].x, y: on[1].y },
      });
      continue;
    }
    if (on.length === 1) {
      if (above.length === 1 && below.length === 1) {
        const p = intersectEdge(above[0], below[0], z);
        if (p) {
          segments.push({
            start: { x: on[0].x, y: on[0].y },
            end: p,
          });
        }
      }
      continue;
    }

    if (above.length === 0 || below.length === 0) continue;

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
 * Assemble loose line segments into ordered closed contours
 */
function assembleContours(segments: Segment[]): Vec2[][] {
  if (segments.length === 0) return [];

  const contours: Vec2[][] = [];
  const used = new Uint8Array(segments.length);

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;

    const contour: Vec2[] = [segments[i].start, segments[i].end];
    used[i] = 1;

    let expanded = true;
    while (expanded) {
      expanded = false;
      const last = contour[contour.length - 1];

      for (let j = 0; j < segments.length; j++) {
        if (used[j]) continue;

        if (pointsClose(last, segments[j].start)) {
          contour.push(segments[j].end);
          used[j] = 1;
          expanded = true;
          break;
        } else if (pointsClose(last, segments[j].end)) {
          contour.push(segments[j].start);
          used[j] = 1;
          expanded = true;
          break;
        }
      }
    }

    if (contour.length >= 3) {
      contours.push(contour);
    }
  }

  return contours;
}

function pointsClose(a: Vec2, b: Vec2, threshold = 0.05): boolean {
  return Math.abs(a.x - b.x) < threshold && Math.abs(a.y - b.y) < threshold;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Offset closed contour inward or outward
 */
function offsetPath(contour: Vec2[], offset: number): Vec2[] {
  if (contour.length < 3) return contour;

  const result: Vec2[] = [];
  const n = contour.length;

  for (let i = 0; i < n; i++) {
    const prev = contour[(i - 1 + n) % n];
    const curr = contour[i];
    const next = contour[(i + 1) % n];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    const len1 = Math.hypot(dx1, dy1) || 1;
    const len2 = Math.hypot(dx2, dy2) || 1;

    const nx = -(dy1 / len1 + dy2 / len2) / 2;
    const ny = (dx1 / len1 + dx2 / len2) / 2;
    const nl = Math.hypot(nx, ny) || 1;

    result.push({
      x: curr.x + (nx / nl) * offset,
      y: curr.y + (ny / nl) * offset,
    });
  }

  return result;
}

/**
 * Generate bed adhesion lines (Skirt / Brim)
 */
function generateAdhesion(contours: Vec2[][], settings: SlicerSettings, bounds: MeshBounds): Segment[] {
  const segments: Segment[] = [];
  const loops = settings.adhesionType === 'brim' ? 5 : 2;
  const startMargin = settings.adhesionType === 'brim' ? 0.5 : 4.0;

  for (let loop = 0; loop < loops; loop++) {
    const margin = startMargin + loop * (settings.nozzleDiameter * 0.9);
    const minX = bounds.minX - margin;
    const maxX = bounds.maxX + margin;
    const minY = bounds.minY - margin;
    const maxY = bounds.maxY + margin;

    segments.push(
      { start: { x: minX, y: minY }, end: { x: maxX, y: minY } },
      { start: { x: maxX, y: minY }, end: { x: maxX, y: maxY } },
      { start: { x: maxX, y: maxY }, end: { x: minX, y: maxY } },
      { start: { x: minX, y: maxY }, end: { x: minX, y: minY } }
    );
  }

  return segments;
}

/**
 * Infill line generator with support for solid top/bottom infill and sparse infill
 */
function generateInfill(
  contours: Vec2[][],
  density: number,
  settings: SlicerSettings,
  layerIdx: number,
  isSolid: boolean
): Segment[] {
  if (density <= 0) return [];

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const contour of contours) {
    for (const pt of contour) {
      minX = Math.min(minX, pt.x);
      maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y);
      maxY = Math.max(maxY, pt.y);
    }
  }

  const effectiveDensity = isSolid ? 100 : density;
  const spacing = isSolid
    ? settings.nozzleDiameter * 0.9
    : Math.max(settings.nozzleDiameter * 1.2, settings.nozzleDiameter / (effectiveDensity / 100));

  const segments: Segment[] = [];
  const useXDirection = layerIdx % 2 === 0;

  if (useXDirection) {
    for (let y = minY + spacing / 2; y < maxY; y += spacing) {
      const intersections: number[] = [];

      for (const contour of contours) {
        const n = contour.length;
        for (let i = 0; i < n; i++) {
          const a = contour[i];
          const b = contour[(i + 1) % n];

          if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
            const t = (y - a.y) / (b.y - a.y);
            intersections.push(a.x + t * (b.x - a.x));
          }
        }
      }

      intersections.sort((a, b) => a - b);

      const margin = settings.nozzleDiameter * Math.max(1, settings.wallCount - 0.5);
      for (let i = 0; i + 1 < intersections.length; i += 2) {
        const startX = intersections[i] + margin;
        const endX = intersections[i + 1] - margin;
        if (startX < endX) {
          segments.push({ start: { x: startX, y }, end: { x: endX, y } });
        }
      }
    }
  } else {
    for (let x = minX + spacing / 2; x < maxX; x += spacing) {
      const intersections: number[] = [];

      for (const contour of contours) {
        const n = contour.length;
        for (let i = 0; i < n; i++) {
          const a = contour[i];
          const b = contour[(i + 1) % n];

          if ((a.x <= x && b.x > x) || (b.x <= x && a.x > x)) {
            const t = (x - a.x) / (b.x - a.x);
            intersections.push(a.y + t * (b.y - a.y));
          }
        }
      }

      intersections.sort((a, b) => a - b);

      const margin = settings.nozzleDiameter * Math.max(1, settings.wallCount - 0.5);
      for (let i = 0; i + 1 < intersections.length; i += 2) {
        const startY = intersections[i] + margin;
        const endY = intersections[i + 1] - margin;
        if (startY < endY) {
          segments.push({ start: { x, y: startY }, end: { x, y: endY } });
        }
      }
    }
  }

  return segments;
}

/**
 * Calculate filament extrusion length (mm) for a movement line segment
 */
function extrusionAmount(moveDistance: number, currentLayerHeight: number, settings: SlicerSettings): number {
  const nozzleArea = settings.nozzleDiameter * currentLayerHeight;
  const filamentArea = Math.PI * Math.pow(settings.filamentDiameter / 2, 2);
  return (nozzleArea / filamentArea) * moveDistance;
}

// ---- Standard FDM G-code Templates ----

function generateHeader(
  settings: SlicerSettings,
  layerCount: number,
  width: number,
  depth: number,
  height: number
): string[] {
  return [
    '; =========================================================',
    '; FLAVOR: Marlin / Klipper FDM',
    '; Generated by SliceFree (3D Model to G-code Converter)',
    `; Date: ${new Date().toISOString()}`,
    `; Model Bounding Box: ${width.toFixed(1)} x ${depth.toFixed(1)} x ${height.toFixed(1)} mm`,
    `; Layer Count: ${layerCount}`,
    `; Layer Height: ${settings.layerHeight} mm`,
    `; Infill: ${settings.infillDensity}% ${settings.infillPattern}`,
    `; Print Speed: ${settings.printSpeed} mm/s`,
    `; Nozzle Temp: ${settings.nozzleTemp} °C`,
    `; Bed Temp: ${settings.bedTemp} °C`,
    `; Nozzle Diameter: ${settings.nozzleDiameter} mm`,
    `; Filament Diameter: ${settings.filamentDiameter} mm`,
    '; =========================================================',
    '',
  ];
}

function generateStartGcode(settings: SlicerSettings): string[] {
  return [
    '; --- PRINTER INITIALIZATION & HOMING ---',
    'G90 ; Set positioning to absolute',
    'M82 ; Set extruder to absolute mode',
    `M140 S${settings.bedTemp} ; Start heating bed`,
    `M104 S${settings.nozzleTemp} ; Start heating nozzle`,
    'G28 ; Home all axes (X, Y, Z)',
    `M190 S${settings.bedTemp} ; Wait for bed to reach temperature`,
    `M109 S${settings.nozzleTemp} ; Wait for nozzle to reach temperature`,
    'G92 E0 ; Reset extruder position',
    'G1 Z2.0 F3000 ; Lift nozzle to safe Z',
    'G1 X10 Y10 Z0.3 F5000.0 ; Move to prime line start point',
    'G1 X10 Y100 Z0.3 F1500.0 E10 ; Prime line 1',
    'G1 X10.4 Y100 Z0.3 F5000.0 ; Move side',
    'G1 X10.4 Y10 Z0.3 F1500.0 E20 ; Prime line 2',
    'G92 E0 ; Reset extruder position',
    'G1 Z1.0 F3000 ; Lift nozzle',
    'M107 ; Fan off initially',
    '',
  ];
}

function generateEndGcode(settings: SlicerSettings): string[] {
  return [
    '',
    '; --- END OF PRINT COMMANDS ---',
    'G91 ; Relative positioning for lift',
    'G1 E-2 F2700 ; Retract 2mm filament',
    'G1 Z10 F3000 ; Raise nozzle 10mm',
    'G90 ; Absolute positioning',
    'G1 X0 Y200 F3000 ; Present bed forward',
    'M106 S0 ; Turn off cooling fan',
    'M104 S0 ; Turn off nozzle heater',
    'M140 S0 ; Turn off bed heater',
    'M84 ; Disable stepper motors',
    '; End of G-code',
  ];
}
