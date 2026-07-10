import { defineConfig } from 'vitest/config';

// base './' : l'appli est servie sous un sous-chemin sur GitHub Pages
// (https://<utilisateur>.github.io/<depot>/), les chemins relatifs marchent partout.
export default defineConfig({
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
  },
});
