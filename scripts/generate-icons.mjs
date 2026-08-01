// Génère les icônes PWA (un schéma de ligne stylisé) avec le canvas de Chromium.
// Usage : node scripts/generate-icons.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

function drawing(size, maskableMargin) {
    return `
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const size = ${size};
    const margin = ${maskableMargin} * size;
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(0, 0, size, size);
    // La ligne (verticale, comme un schéma lu de bas en haut)
    const x = size / 2;
    ctx.strokeStyle = 'white';
    ctx.lineWidth = size * 0.07;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, size - margin - size * 0.12);
    ctx.bezierCurveTo(
      x - size * 0.16, size * 0.66,
      x + size * 0.16, size * 0.34,
      x, margin + size * 0.12,
    );
    ctx.stroke();
    // Les gares (traits horizontaux)
    ctx.lineWidth = size * 0.045;
    for (const y of [0.28, 0.5, 0.72]) {
      const shift = y === 0.5 ? 0 : (y < 0.5 ? size * 0.06 : -size * 0.06);
      ctx.beginPath();
      ctx.moveTo(x - size * 0.13 + shift, size * y);
      ctx.lineTo(x + size * 0.13 + shift, size * y);
      ctx.stroke();
    }
    // La position courante (point au trois-quarts bas)
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(x - size * 0.052, size * 0.72, size * 0.075, 0, Math.PI * 2);
    ctx.fill();
  `;
}

const browser = await chromium.launch();
const page = await browser.newPage();
await mkdir(new URL('../public/icons/', import.meta.url), { recursive: true });

const icons = [
    { file: 'icon-192.png', size: 192, margin: 0 },
    { file: 'icon-512.png', size: 512, margin: 0 },
    { file: 'icon-maskable-512.png', size: 512, margin: 0.12 },
];

for (const { file, size, margin } of icons) {
    await page.setContent(`<canvas width="${size}" height="${size}"></canvas>`);
    await page.evaluate(drawing(size, margin));
    const data = await page.evaluate(
        () => document.querySelector('canvas').toDataURL('image/png').split(',')[1],
    );
    await writeFile(
        new URL(`../public/icons/${file}`, import.meta.url),
        Buffer.from(data, 'base64'),
    );
    console.log(`✓ public/icons/${file}`);
}

await browser.close();
