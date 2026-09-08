import { fileURLToPath } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * VitePWA injecte `<link rel="manifest">` dans chaque entrée HTML compilée,
 * par défaut. La planche (`design/index.html`, task 7) n'a pas vocation à
 * s'installer : ce greffon retire ce lien de sa seule page, une fois VitePWA
 * passé, sans toucher à celle de l'application.
 */
function retirerManifesteDeLaPlanche(): Plugin {
    return {
        name: 'planche-sans-manifeste',
        // VitePWA place son greffon de construction en `enforce: 'post'` — pas
        // seulement `transformIndexHtml.order: 'post'` — ce qui le déplace
        // après les greffons « normaux » dans le pipeline global de Vite, et
        // c'est cet ordre-là, pas celui du tableau `plugins`, qui décide dans
        // quel groupe `resolveHtmlTransforms` range chaque crochet. Sans le
        // même `enforce` ici, ce greffon restait « normal » et s'exécutait
        // avant l'injection de VitePWA — retirant un lien qui n'existait pas
        // encore. Avec le même `enforce` et une déclaration après `VitePWA(…)`
        // dans `plugins`, celui-ci s'exécute après, comme voulu.
        enforce: 'post',
        transformIndexHtml: {
            order: 'post',
            handler(html, { filename }) {
                const estLaPlanche = filename.replace(/\\/g, '/').endsWith('/design/index.html');
                if (!estLaPlanche) {
                    return html;
                }
                return html.replace(/\s*<link rel="manifest"[^>]*\/?>/, '');
            },
        },
    };
}

// base './' : l'appli est servie sous un sous-chemin sur GitHub Pages
// (https://<utilisateur>.github.io/<depot>/), les chemins relatifs marchent partout.
export default defineConfig({
    base: './',
    build: {
        rollupOptions: {
            // Deux entrées : l'application, et la planche. Le workflow de
            // déploiement envoie `dist` en entier, donc la seconde paraît à
            // `/design/` sans qu'il ait à changer.
            input: {
                main: fileURLToPath(new URL('./index.html', import.meta.url)),
                design: fileURLToPath(new URL('./design/index.html', import.meta.url)),
            },
        },
    },
    plugins: [
        VitePWA({
            registerType: 'autoUpdate',
            manifest: {
                name: 'Etudes2Lignes — Suivi de schémas de ligne',
                short_name: 'Etudes2Lignes',
                description:
                    'Suivi géolocalisé de schémas de ligne ferroviaires, entièrement hors ligne.',
                lang: 'fr',
                display: 'standalone',
                // Les deux couleurs que le système applique **avant** que la
                // page existe : l'écran de lancement et la barre autour d'elle.
                // Elles reprennent le fond groupé de la feuille, et non une
                // teinte d'accent — un aplat bleu au lancement annoncerait une
                // couleur que l'interface ne porte plus nulle part.
                background_color: '#f2f2f7',
                theme_color: '#f2f2f7',
                icons: [
                    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                    {
                        src: 'icons/icon-maskable-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                ],
            },
            workbox: {
                // L'app shell entier est pré-caché : l'appli démarre hors ligne.
                globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
                // Sans cette ligne, le motif ci-dessus **pré-cacherait la
                // planche chez tous les utilisateurs** : c'est exactement ce
                // que « hors de la PWA » exclut. Deux motifs, parce que
                // Rollup ne range pas tout sous `design/` : la page y vit,
                // mais ses morceaux JS/CSS propres portent le nom de
                // l'entrée (`design`) sous `assets/`, aux côtés des chunks
                // partagés avec l'application principale — un second motif
                // les y rejoint plutôt que de déplacer la sortie de Rollup,
                // qui resterait alors la disposition `assets/` plate que le
                // reste du projet (et le déploiement en `base: './'`)
                // suppose déjà partout ailleurs.
                globIgnores: ['design/**', 'assets/design-*'],
                navigateFallback: 'index.html',
                // Et sans celle-ci, `navigateFallback` servirait l'application
                // sous `/design/` dès que le service worker prend la main.
                navigateFallbackDenylist: [/design\//],
                runtimeCaching: [
                    {
                        // Les tuiles OSM déjà vues restent disponibles hors ligne.
                        // Conformité à la politique OSMF : seules les tuiles réellement
                        // affichées sont mises en cache, jamais de pré-téléchargement.
                        urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'tuiles-osm',
                            expiration: {
                                maxEntries: 2000,
                                maxAgeSeconds: 60 * 60 * 24 * 180,
                                // Si le quota déborde quand même, on sacrifie les
                                // tuiles plutôt que de laisser échouer les écritures.
                                purgeOnQuotaError: true,
                            },
                            // Uniquement des réponses CORS complètes (200) : une réponse
                            // opaque (statut 0) est comptée ~7 Mo dans le quota Chromium
                            // et mettrait en péril l'IndexedDB des trajets.
                            cacheableResponse: { statuses: [200] },
                        },
                    },
                ],
            },
        }),
        retirerManifesteDeLaPlanche(),
    ],
    test: {
        include: ['src/**/*.test.ts'],
    },
});
