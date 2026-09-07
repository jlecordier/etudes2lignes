// Génère les icônes PWA avec le canvas de Chromium.
// Usage : node scripts/generate-icons.mjs  (ou `pnpm icons`)
//
// Le dessin suit « Adopting Liquid Glass » : « Consider a simplified design
// comprised of solid, filled, **overlapping semi-transparent shapes**. » D'où
// des formes pleines translucides qui se recouvrent — là où elles se croisent,
// l'alpha s'accumule et la profondeur apparaît sans qu'on la dessine — et non le
// tracé au trait d'avant, qui ne pouvait rien laisser transparaître.
//
// Rien n'y est cuit de ce que le système ajoute : « Let the system handle
// applying masking, blurring, and other visual effects, rather than factoring
// them into your design. » Donc pas d'ombre, pas de flou, et pas de coin
// arrondi — le masque du système donne la forme, et une icône qui porterait
// déjà la sienne se retrouverait doublement arrondie.
//
// Tout est centré — « keep elements centered to avoid clipping » — et la
// variante maskable garde sa marge de sûreté.
//
// Les couleurs sont celles de `src/style.css`, apparence par apparence. Le web
// n'a pas les variantes d'apparence d'iOS, un manifeste ne déclarant qu'un seul
// jeu d'icônes ; mais il a la requête média sur le favicon, et c'est le seul
// endroit où la variante sombre sert réellement. `index.html` l'y branche.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

/**
 * Les deux apparences. En clair le fond porte la teinte et les formes sont
 * blanches ; en sombre le fond s'efface et c'est la teinte qui dessine — c'est
 * ainsi qu'iOS bascule ses propres icônes, plutôt qu'en assombrissant l'image.
 */
const apparences = {
    clair: { fond: ['#0088ff', '#0057d9'], forme: '255, 255, 255' },
    sombre: { fond: ['#1c1c1e', '#000000'], forme: '0, 145, 255' },
};

function drawing(size, maskableMargin, apparence) {
    const { fond, forme } = apparences[apparence];
    // Le cœur du repère n'est pas une troisième couleur : c'est un trou percé
    // jusqu'au fond. Une couleur propre s'était retrouvée identique à celle du
    // disque en apparence sombre, et l'anneau y disparaissait.
    const coeur = fond[1];
    return `
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const size = ${size};
    const marge = ${maskableMargin} * size;
    const x = size / 2;
    // La zone réellement dessinable : la marge maskable rétrécit tout, pour que
    // le masque du système ne rogne aucune forme.
    const haut = marge + size * 0.16;
    const bas = size - marge - size * 0.16;

    const fond = ctx.createLinearGradient(0, 0, 0, size);
    fond.addColorStop(0, '${fond[0]}');
    fond.addColorStop(1, '${fond[1]}');
    ctx.fillStyle = fond;
    ctx.fillRect(0, 0, size, size);

    /** Une barre pleine à bouts arrondis : la brique du dessin. */
    const barre = (cx, cy, largeur, epaisseur, alpha) => {
      ctx.fillStyle = 'rgba(${forme}, ' + alpha + ')';
      ctx.beginPath();
      ctx.roundRect(cx - largeur / 2, cy - epaisseur / 2, largeur, epaisseur, epaisseur / 2);
      ctx.fill();
    };

    // La ligne, lue de bas en haut : une bande verticale, et non un trait — une
    // forme pleine peut se faire recouvrir, un trait non.
    barre(x, (haut + bas) / 2, size * 0.14, bas - haut, 0.5);

    // Les points du trajet : trois barres horizontales qui la traversent. Aux
    // croisements les deux alphas s'additionnent, et c'est de là que vient le
    // relief.
    const ecart = (bas - haut) / 4;
    barre(x + size * 0.05, haut + ecart, size * 0.36, size * 0.09, 0.42);
    barre(x - size * 0.05, haut + ecart * 2, size * 0.36, size * 0.09, 0.42);
    barre(x + size * 0.05, haut + ecart * 3, size * 0.36, size * 0.09, 0.42);

    // « Ma position » : le seul élément entièrement opaque, donc le seul point de
    // fixation. Aux trois quarts bas, là où le suivi cale réellement la page.
    ctx.fillStyle = 'rgb(${forme})';
    ctx.beginPath();
    ctx.arc(x, haut + ecart * 3, size * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '${coeur}';
    ctx.beginPath();
    ctx.arc(x, haut + ecart * 3, size * 0.043, 0, Math.PI * 2);
    ctx.fill();
  `;
}

const browser = await chromium.launch();
const page = await browser.newPage();
await mkdir(new URL('../public/icons/', import.meta.url), { recursive: true });

const icons = [
    { file: 'icon-192.png', size: 192, margin: 0, apparence: 'clair' },
    { file: 'icon-512.png', size: 512, margin: 0, apparence: 'clair' },
    // « The system applies masking to produce your final icon shape » : cette
    // variante réserve 12 % de marge pour qu'il n'y rogne rien.
    { file: 'icon-maskable-512.png', size: 512, margin: 0.12, apparence: 'clair' },
    // Le favicon en apparence sombre : le seul endroit du web où la variante joue.
    { file: 'icon-192-sombre.png', size: 192, margin: 0, apparence: 'sombre' },
    { file: 'icon-512-sombre.png', size: 512, margin: 0, apparence: 'sombre' },
];

for (const { file, size, margin, apparence } of icons) {
    await page.setContent(`<canvas width="${size}" height="${size}"></canvas>`);
    await page.evaluate(drawing(size, margin, apparence));
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
