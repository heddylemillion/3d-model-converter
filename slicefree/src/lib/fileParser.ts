/**
 * fileParser.ts
 * Parse 3D model files (STL binary/ASCII, OBJ, 3MF) into a common mesh representation.
 */

import * as THREE from 'three';

export interface ParsedModel {
  geometry: THREE.BufferGeometry;
  triangles: number;
  dimensions: { x: number; y: number; z: number };
  vertices: Float32Array;
  faces: Uint32Array | number[];
}

/**
 * Detect file type from extension and content
 */
function getFileType(file: File): 'stl' | 'obj' | '3mf' {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'obj') return 'obj';
  if (ext === '3mf') return '3mf';
  return 'stl';
}

/**
 * Parse an STL file (binary or ASCII)
 */
function parseSTL(buffer: ArrayBuffer): THREE.BufferGeometry {
  const view = new DataView(buffer);
  const geometry = new THREE.BufferGeometry();

  // Check if binary or ASCII
  // Binary STL: 80 byte header + 4 byte triangle count + triangles
  // ASCII STL starts with "solid"
  const headerBytes = new Uint8Array(buffer, 0, Math.min(80, buffer.byteLength));
  const headerString = new TextDecoder().decode(headerBytes);
  const isAscii = headerString.startsWith('solid') && !isBinarySTL(buffer);

  if (isAscii) {
    return parseSTLAscii(buffer);
  }
  return parseSTLBinary(buffer, view);
}

function isBinarySTL(buffer: ArrayBuffer): boolean {
  // A binary STL has 80 bytes header + 4 bytes num triangles
  // Then each triangle is 50 bytes
  if (buffer.byteLength < 84) return false;
  const view = new DataView(buffer);
  const numTriangles = view.getUint32(80, true);
  const expectedSize = 84 + numTriangles * 50;
  return Math.abs(buffer.byteLength - expectedSize) < 100;
}

function parseSTLBinary(buffer: ArrayBuffer, view: DataView): THREE.BufferGeometry {
  const numTriangles = view.getUint32(80, true);
  const vertices = new Float32Array(numTriangles * 9);
  const normals = new Float32Array(numTriangles * 9);

  let offset = 84;
  for (let i = 0; i < numTriangles; i++) {
    // Normal
    const nx = view.getFloat32(offset, true);
    const ny = view.getFloat32(offset + 4, true);
    const nz = view.getFloat32(offset + 8, true);
    offset += 12;

    // Three vertices
    for (let j = 0; j < 3; j++) {
      const idx = i * 9 + j * 3;
      vertices[idx] = view.getFloat32(offset, true);
      vertices[idx + 1] = view.getFloat32(offset + 4, true);
      vertices[idx + 2] = view.getFloat32(offset + 8, true);
      normals[idx] = nx;
      normals[idx + 1] = ny;
      normals[idx + 2] = nz;
      offset += 12;
    }

    // Attribute byte count (skip)
    offset += 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geometry;
}

function parseSTLAscii(buffer: ArrayBuffer): THREE.BufferGeometry {
  const text = new TextDecoder().decode(buffer);
  const vertices: number[] = [];
  const normals: number[] = [];

  const facetPattern = /facet\s+normal\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)/g;
  const vertexPattern = /vertex\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)/g;

  let facetMatch;
  const normalList: number[][] = [];

  while ((facetMatch = facetPattern.exec(text)) !== null) {
    normalList.push([
      parseFloat(facetMatch[1]),
      parseFloat(facetMatch[2]),
      parseFloat(facetMatch[3]),
    ]);
  }

  let vertexMatch;
  let normalIdx = 0;
  let vertexCount = 0;

  while ((vertexMatch = vertexPattern.exec(text)) !== null) {
    vertices.push(
      parseFloat(vertexMatch[1]),
      parseFloat(vertexMatch[2]),
      parseFloat(vertexMatch[3])
    );

    const ni = Math.floor(vertexCount / 3);
    if (ni < normalList.length) {
      normals.push(normalList[ni][0], normalList[ni][1], normalList[ni][2]);
    }

    vertexCount++;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
  if (normals.length > 0) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  } else {
    geometry.computeVertexNormals();
  }
  return geometry;
}

/**
 * Parse OBJ file
 */
function parseOBJ(buffer: ArrayBuffer): THREE.BufferGeometry {
  const text = new TextDecoder().decode(buffer);
  const lines = text.split('\n');

  const positions: number[] = [];
  const indexedVertices: number[][] = [];
  const faces: number[][] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('v ')) {
      const parts = trimmed.split(/\s+/).slice(1).map(Number);
      indexedVertices.push(parts);
    } else if (trimmed.startsWith('f ')) {
      const parts = trimmed.split(/\s+/).slice(1);
      const faceIndices = parts.map((p) => {
        const idx = parseInt(p.split('/')[0]);
        return idx > 0 ? idx - 1 : indexedVertices.length + idx;
      });

      // Triangulate (fan triangulation for polygons)
      for (let i = 1; i < faceIndices.length - 1; i++) {
        faces.push([faceIndices[0], faceIndices[i], faceIndices[i + 1]]);
      }
    }
  }

  const vertices = new Float32Array(faces.length * 9);
  for (let i = 0; i < faces.length; i++) {
    for (let j = 0; j < 3; j++) {
      const vi = faces[i][j];
      const v = indexedVertices[vi] || [0, 0, 0];
      vertices[i * 9 + j * 3] = v[0];
      vertices[i * 9 + j * 3 + 1] = v[1];
      vertices[i * 9 + j * 3 + 2] = v[2];
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Parse 3MF file (ZIP-based XML format)
 */
async function parse3MF(buffer: ArrayBuffer): Promise<THREE.BufferGeometry> {
  // Dynamically import JSZip
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);

  // Find the model file inside the 3MF archive
  let modelXml = '';
  const modelFile = zip.file('3D/3dmodel.model') || zip.file(/\.model$/i)[0];

  if (modelFile) {
    modelXml = await modelFile.async('string');
  } else {
    throw new Error('No 3D model found inside the 3MF file');
  }

  // Parse XML
  const parser = new DOMParser();
  const doc = parser.parseFromString(modelXml, 'application/xml');

  const verticesEl = doc.querySelectorAll('vertex');
  const trianglesEl = doc.querySelectorAll('triangle');

  const indexedVertices: number[][] = [];
  verticesEl.forEach((v) => {
    indexedVertices.push([
      parseFloat(v.getAttribute('x') || '0'),
      parseFloat(v.getAttribute('y') || '0'),
      parseFloat(v.getAttribute('z') || '0'),
    ]);
  });

  const vertices = new Float32Array(trianglesEl.length * 9);
  trianglesEl.forEach((t, i) => {
    const v1 = parseInt(t.getAttribute('v1') || '0');
    const v2 = parseInt(t.getAttribute('v2') || '0');
    const v3 = parseInt(t.getAttribute('v3') || '0');

    const indices = [v1, v2, v3];
    for (let j = 0; j < 3; j++) {
      const v = indexedVertices[indices[j]] || [0, 0, 0];
      vertices[i * 9 + j * 3] = v[0];
      vertices[i * 9 + j * 3 + 1] = v[1];
      vertices[i * 9 + j * 3 + 2] = v[2];
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Main parse function
 */
export async function parseModelFile(file: File, buffer: ArrayBuffer): Promise<ParsedModel> {
  const type = getFileType(file);
  let geometry: THREE.BufferGeometry;

  switch (type) {
    case 'stl':
      geometry = parseSTL(buffer);
      break;
    case 'obj':
      geometry = parseOBJ(buffer);
      break;
    case '3mf':
      geometry = await parse3MF(buffer);
      break;
    default:
      throw new Error(`Unsupported file format: ${type}`);
  }

  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);

  const positionAttr = geometry.getAttribute('position');
  const triangles = positionAttr.count / 3;

  return {
    geometry,
    triangles,
    dimensions: { x: size.x, y: size.y, z: size.z },
    vertices: positionAttr.array as Float32Array,
    faces: [],
  };
}
