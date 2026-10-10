/**
 * Generates the PWA icon set.
 *
 * The icons are deliberately simple: a flat panel with three fibre strokes. No
 * anatomy is depicted, because an icon is not a reviewed medical illustration
 * and must never be mistaken for one.
 *
 * PNG encoding is done here directly (IHDR + IDAT with zlib + IEND) so the
 * repository needs no image toolchain to produce a valid, installable icon set.
 *
 * Run with: npm run validate:icons
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'public', 'icons');

/** CRC-32 table for PNG chunk checksums. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

const INK = [15, 17, 21, 255];
const PANEL = [31, 95, 139, 255];
const FIBRE = [255, 255, 255, 255];

/**
 * Signed distance from a point to a thick line segment, used for anti-aliased
 * strokes without a rasteriser.
 */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const lengthSquared = vx * vx + vy * vy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / lengthSquared));
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}

function blend(base, over, alpha) {
  return [
    Math.round(base[0] * (1 - alpha) + over[0] * alpha),
    Math.round(base[1] * (1 - alpha) + over[1] * alpha),
    Math.round(base[2] * (1 - alpha) + over[2] * alpha),
    255,
  ];
}

function roundedRectDistance(px, py, size, radius) {
  const inset = size * 0.06;
  const left = inset;
  const right = size - inset;
  const top = inset;
  const bottom = size - inset;

  const cx = Math.min(Math.max(px, left + radius), right - radius);
  const cy = Math.min(Math.max(py, top + radius), bottom - radius);
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) - radius;
}

/**
 * @param {number} size square edge in pixels
 * @param {boolean} maskable full-bleed background for maskable icons
 */
function renderIcon(size, maskable) {
  const pixels = Buffer.alloc(size * (size * 4 + 1));

  const inset = maskable ? 0 : size * 0.06;
  const cornerRadius = maskable ? 0 : size * 0.22;
  const inner = size - inset * 2;

  // Three fibre strokes running diagonally across the panel.
  const strokes = [0.3, 0.5, 0.7].map((t, index) => {
    const y = inset + inner * t;
    const thickness = inner * (0.075 - index * 0.008);
    return {
      ax: inset + inner * 0.2,
      ay: y + inner * 0.06,
      bx: inset + inner * 0.8,
      by: y - inner * 0.06,
      thickness: thickness / 2,
    };
  });

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    pixels[rowStart] = 0; // PNG filter type 0 (None)

    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;

      let colour = INK;

      const panelDistance = roundedRectDistance(px, py, size, cornerRadius);
      if (maskable) {
        colour = PANEL;
      } else if (panelDistance < 0) {
        colour = PANEL;
        const edge = Math.min(1, -panelDistance);
        if (edge < 1) colour = blend(PANEL, INK, 1 - edge);
      }

      for (const stroke of strokes) {
        const distance = distanceToSegment(px, py, stroke.ax, stroke.ay, stroke.bx, stroke.by);
        const alpha = Math.max(0, Math.min(1, stroke.thickness - distance + 0.5));
        if (alpha > 0) {
          colour = blend(colour, FIBRE, alpha);
        }
      }

      const offset = rowStart + 1 + x * 4;
      pixels[offset] = colour[0];
      pixels[offset + 1] = colour[1];
      pixels[offset + 2] = colour[2];
      pixels[offset + 3] = colour[3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(pixels, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Muscle Atlas">
  <rect width="64" height="64" rx="14" fill="#1f5f8b"/>
  <g stroke="#ffffff" stroke-linecap="round" fill="none">
    <path d="M13 21 L51 16" stroke-width="5"/>
    <path d="M13 32 L51 32" stroke-width="4.4"/>
    <path d="M13 43 L51 48" stroke-width="4"/>
  </g>
</svg>
`;

const MASK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Muscle Atlas">
  <rect width="64" height="64" fill="#1f5f8b"/>
  <g stroke="#ffffff" stroke-linecap="round" fill="none">
    <path d="M19 25 L45 21" stroke-width="4"/>
    <path d="M19 34 L45 34" stroke-width="3.6"/>
    <path d="M19 43 L45 47" stroke-width="3.2"/>
  </g>
</svg>
`;

mkdirSync(outDir, { recursive: true });

const outputs = [
  ['icon-180.png', renderIcon(180, false)],
  ['icon-192.png', renderIcon(192, false)],
  ['icon-512.png', renderIcon(512, false)],
  ['icon-1024.png', renderIcon(1024, false)],
  ['maskable-512.png', renderIcon(512, true)],
];

for (const [name, buffer] of outputs) {
  writeFileSync(resolve(outDir, name), buffer);
  process.stdout.write(`wrote public/icons/${name} (${(buffer.length / 1024).toFixed(1)} KB)\n`);
}

writeFileSync(resolve(outDir, 'icon.svg'), ICON_SVG, 'utf8');
writeFileSync(resolve(outDir, 'mask.svg'), MASK_SVG, 'utf8');
process.stdout.write('wrote public/icons/icon.svg\n');
process.stdout.write('wrote public/icons/mask.svg\n');
