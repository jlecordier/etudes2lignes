import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// base './' : l'appli est servie sous un sous-chemin sur GitHub Pages
// (https://<utilisateur>.github.io/<depot>/), les chemins relatifs marchent partout.
export default defineConfig({
    base: './',
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
                background_color: '#f9fafb',
                theme_color: '#1d4ed8',
                icons: [
                    { src: 'icons/icone-192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'icons/icone-512.png', sizes: '512x512', type: 'image/png' },
                    {
                        src: 'icons/icone-maskable-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                ],
            },
            workbox: {
                // L'app shell entier est pré-caché : l'appli démarre hors ligne.
                globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
                navigateFallback: 'index.html',
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
    ],
    test: {
        include: ['src/**/*.test.ts'],
    },
});
