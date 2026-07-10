// Génère les icônes PWA (un schéma de ligne stylisé) avec le canvas de Chromium.
// Usage : node scripts/generer-icones.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

function dessin(taille, margeMaskable) {
    return `
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const taille = ${taille};
    const marge = ${margeMaskable} * taille;
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(0, 0, taille, taille);
    // La ligne (verticale, comme un schéma lu de bas en haut)
    const x = taille / 2;
    ctx.strokeStyle = 'white';
    ctx.lineWidth = taille * 0.07;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, taille - marge - taille * 0.12);
    ctx.bezierCurveTo(
      x - taille * 0.16, taille * 0.66,
      x + taille * 0.16, taille * 0.34,
      x, marge + taille * 0.12,
    );
    ctx.stroke();
    // Les gares (traits horizontaux)
    ctx.lineWidth = taille * 0.045;
    for (const y of [0.28, 0.5, 0.72]) {
      const decalage = y === 0.5 ? 0 : (y < 0.5 ? taille * 0.06 : -taille * 0.06);
      ctx.beginPath();
      ctx.moveTo(x - taille * 0.13 + decalage, taille * y);
      ctx.lineTo(x + taille * 0.13 + decalage, taille * y);
      ctx.stroke();
    }
    // La position courante (point au trois-quarts bas)
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(x - taille * 0.052, taille * 0.72, taille * 0.075, 0, Math.PI * 2);
    ctx.fill();
  `;
}

const navigateur = await chromium.launch();
const page = await navigateur.newPage();
await mkdir(new URL('../public/icons/', import.meta.url), { recursive: true });

const icones = [
    { fichier: 'icone-192.png', taille: 192, marge: 0 },
    { fichier: 'icone-512.png', taille: 512, marge: 0 },
    { fichier: 'icone-maskable-512.png', taille: 512, marge: 0.12 },
];

for (const { fichier, taille, marge } of icones) {
    await page.setContent(`<canvas width="${taille}" height="${taille}"></canvas>`);
    await page.evaluate(dessin(taille, marge));
    const donnees = await page.evaluate(
        () => document.querySelector('canvas').toDataURL('image/png').split(',')[1],
    );
    await writeFile(
        new URL(`../public/icons/${fichier}`, import.meta.url),
        Buffer.from(donnees, 'base64'),
    );
    console.log(`✓ public/icons/${fichier}`);
}

await navigateur.close();
