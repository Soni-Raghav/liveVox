#!/usr/bin/env node
/**
 * Generates the LiveVox PWA icon set (192/512, regular + maskable) as real
 * PNG files using only Node's zlib — no native image dependencies, fully
 * reproducible in CI.
 *
 * Art direction: dark slate tile with a violet voice-waveform mark. The
 * maskable variants are full-bleed with content inside the 80% safe zone
 * so Android adaptive icons do not crop the mark.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BG = [15, 23, 42]; // slate-950
const BAR = [139, 92, 246]; // violet-500
const BAR_HOT = [196, 181, 253]; // violet-300

// ---------------------------------------------------------------------------
// Minimal PNG encoder (8-bit RGBA, filter 0).
// ---------------------------------------------------------------------------

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

/**
 * @param {Buffer} buf - data to checksum
 * @returns {number} CRC-32 of buf
 */
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * @param {string} type - 4-char chunk type
 * @param {Buffer} data - chunk payload
 * @returns {Buffer} serialized chunk (length + type + data + crc)
 */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * Encode raw RGBA pixels as a PNG buffer.
 *
 * @param {number} width - pixel width
 * @param {number} height - pixel height (square icons here)
 * @param {Buffer} rgba - width*height*4 bytes, row-major
 * @returns {Buffer} PNG file bytes
 */
function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Raster drawing helpers.
// ---------------------------------------------------------------------------

/** @typedef {{x: number, y: number, w: number, h: number, r: number}} Rect */

/**
 * Signed distance to a rounded rectangle (used for crisp corners).
 *
 * @param {number} px - pixel x
 * @param {number} py - pixel y
 * @param {Rect} rect - rounded rectangle
 * @returns {number} distance (<0 inside)
 */
function roundedRectDistance(px, py, rect) {
  const cx = Math.max(rect.x, Math.min(px, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(py, rect.y + rect.h));
  const dx = px - cx;
  const dy = py - cy;
  // Distance to the inner box minus the corner radius.
  const bx = Math.abs(dx) - Math.max(0, rect.w / 2 - rect.r);
  const by = Math.abs(dy) - Math.max(0, rect.h / 2 - rect.r);
  return Math.hypot(Math.max(bx, 0), Math.max(by, 0)) + Math.min(Math.max(bx, by), 0);
}

/**
 * Fill a rounded rectangle on the raster with a solid colour.
 *
 * @param {Buffer} rgba - raster
 * @param {number} size - canvas size
 * @param {Rect} rect - rectangle to fill
 * @param {number[]} color - [r, g, b]
 */
function fillRoundedRect(rgba, size, rect, color) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (roundedRectDistance(x + 0.5, y + 0.5, rect) <= 0) {
        const i = (y * size + x) * 4;
        rgba[i] = color[0];
        rgba[i + 1] = color[1];
        rgba[i + 2] = color[2];
        rgba[i + 3] = 255;
      }
    }
  }
}

/**
 * Render one icon.
 *
 * @param {number} size - edge length in pixels
 * @param {boolean} maskable - full-bleed background + safe-zone content
 * @returns {Buffer} PNG bytes
 */
function renderIcon(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4);
  // Full-bleed tile (maskable) or rounded tile with transparency (any).
  fillRoundedRect(
    rgba,
    size,
    { x: 0.5, y: 0.5, w: size - 1, h: size - 1, r: maskable ? 0 : size * 0.185 },
    BG
  );
  // Content area: 72% of the canvas keeps the mark inside the maskable
  // safe zone (80%) with breathing room.
  const content = size * (maskable ? 0.72 : 0.78);
  const offset = (size - content) / 2;
  const barWidth = content * 0.13;
  const gap = (content - barWidth * 5) / 4;
  const heights = [0.34, 0.58, 0.86, 0.58, 0.34].map((f) => f * content);
  for (let i = 0; i < 5; i += 1) {
    const x = offset + i * (barWidth + gap);
    const h = heights[i];
    const y = offset + (content - h) / 2;
    fillRoundedRect(rgba, size, { x, y, w: barWidth, h, r: barWidth / 2 }, i === 2 ? BAR_HOT : BAR);
  }
  return encodePng(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });
const JOBS = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-maskable-192.png', size: 192, maskable: true },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
];
for (const job of JOBS) {
  writeFileSync(join(OUT_DIR, job.name), renderIcon(job.size, job.maskable));
  console.log(`[icons] wrote ${job.name} (${job.size}x${job.size})`);
}
