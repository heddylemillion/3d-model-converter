import fs from 'fs';
import path from 'path';
import * as THREE from 'three';

// Import sliceModel logic from compiled or ts module
import { sliceModel, DEFAULT_SETTINGS } from '../src/lib/slicer.ts';

function parseBinarySTL(buffer) {
  const view = new DataView(buffer);
  const numTriangles = view.getUint32(80, true);
  const vertices = new Float32Array(numTriangles * 9);
  let offset = 84;
  for (let i = 0; i < numTriangles; i++) {
    offset += 12; // skip normal
    for (let j = 0; j < 3; j++) {
      const idx = i * 9 + j * 3;
      vertices[idx] = view.getFloat32(offset, true);
      vertices[idx + 1] = view.getFloat32(offset + 4, true);
      vertices[idx + 2] = view.getFloat32(offset + 8, true);
      offset += 12;
    }
    offset += 2; // skip attr count
  }
  return vertices;
}

function parseAsciiSTL(text) {
  const vertices = [];
  const vertexPattern = /vertex\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)/g;
  let match;
  while ((match = vertexPattern.exec(text)) !== null) {
    vertices.push(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
  }
  return new Float32Array(vertices);
}

function loadSTL(filePath) {
  const buffer = fs.readFileSync(filePath);
  const arrayBuf = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const textHeader = buffer.slice(0, 80).toString('ascii');
  
  if (textHeader.startsWith('solid') && !isBinarySTL(buffer)) {
    return parseAsciiSTL(buffer.toString('utf8'));
  }
  return parseBinarySTL(arrayBuf);
}

function isBinarySTL(buffer) {
  if (buffer.length < 84) return false;
  const numTriangles = buffer.readUInt32LE(80);
  const expectedSize = 84 + numTriangles * 50;
  return Math.abs(buffer.length - expectedSize) < 100;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('Usage: node scripts/slice.mjs <input.stl> [output.gcode]');
    process.exit(1);
  }

  const inputFile = args[0];
  const outputFile = args[1] || inputFile.replace(/\.[^/.]+$/, '') + '.gcode';

  console.log(`Loading 3D model: ${inputFile}...`);
  const vertices = loadSTL(inputFile);
  console.log(`Loaded ${vertices.length / 9} triangles.`);

  console.log('Slicing model to G-code...');
  const result = await sliceModel(vertices, DEFAULT_SETTINGS, (prog, msg) => {
    console.log(`[${prog}%] ${msg}`);
  });

  fs.writeFileSync(outputFile, result.gcode, 'utf8');
  console.log(`\nSuccess! G-code saved to: ${outputFile}`);
  console.log(`- Layers: ${result.layerCount}`);
  console.log(`- Est. Print Time: ${Math.floor(result.estimatedTime / 60)}m ${result.estimatedTime % 60}s`);
  console.log(`- Filament Used: ${(result.filamentLength / 1000).toFixed(2)} meters (${result.filamentWeight} g)`);
}

main().catch((err) => {
  console.error('Error slicing model:', err);
  process.exit(1);
});
