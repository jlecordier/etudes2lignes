/**
 * Tests de mutation (Stryker) — voir ADR 0006.
 *
 * Stryker abîme le code un endroit à la fois et relance les tests : un mutant
 * qui survit désigne une ligne que rien n'éprouve. C'est le seul outil qui
 * réponde à « ce test protège-t-il vraiment cette règle ? », là où la couverture
 * ne dit que « cette ligne a été exécutée ».
 *
 * Ce n'est **pas** dans `pnpm quality` : une suite relancée par mutant se compte
 * en dizaines de minutes. On le lance sur un module qu'on vient de refondre.
 *
 * Pas d'annotation `@type` ici : ce fichier est hors du programme TypeScript,
 * comme `eslint.config.js`, donc rien ne la vérifierait — et elle tirerait
 * `@stryker-mutator/api`, une dépendance transitive que le projet ne déclare pas.
 */
export default {
    testRunner: 'vitest',
    plugins: ['@stryker-mutator/vitest-runner', '@stryker-mutator/typescript-checker'],
    coverageAnalysis: 'perTest',
    reporters: ['clear-text', 'progress', 'html'],
    htmlReporter: { fileName: 'reports/mutation/index.html' },

    /*
     * On ne mute que ce qui DOIT être couvert par des tests unitaires. Les écrans
     * DOM se testent en Playwright (ADR 0001) et `main.ts` n'est que du câblage :
     * les muter produirait un score faux, où des survivants attendus noieraient
     * les vrais. Les fichiers de test, la suite de contrat et les fakes partagés
     * ne sont pas du code de production.
     */
    mutate: [
        'src/*/domain/**/*.ts',
        'src/*/adapters/**/*.ts',
        'src/*/serialization/**/*.ts',
        'src/shared/**/*.ts',
        '!src/**/*.test.ts',
        '!src/suivi/adapters/positionSourceContract.ts',
        '!src/suivi/adapters/fakeForeground.ts',
    ],

    /*
     * Le score n'est pas une porte de CI : `break` reste bas pour que la commande
     * serve à lire les survivants un par un, pas à faire échouer un commit. La
     * porte, c'est `pnpm quality`.
     */
    thresholds: { high: 90, low: 75, break: 50 },

    /*
     * Le vérificateur de types écarte d'emblée les mutants qui ne compilent pas —
     * précieux ici, où le typage est sévère et où beaucoup de mutations sont
     * mort-nées. Il s'appuie sur le paquet `typescript` (TS 6, celui de
     * typescript-eslint), pas sur `@typescript/native` (ADR 0004).
     */
    checkers: ['typescript'],
    tsconfigFile: 'tsconfig.json',
    typescriptChecker: { prioritizePerformanceOverAccuracy: true },

    /*
     * `ignoreStatic` reste à faux, à dessein : les seuils métier sont des
     * constantes de module (`LONGUEUR_MINIMALE_DE_SEGMENT_METRES`,
     * `PRECISION_MAXIMALE_METRES`…), et ce sont justement les mutants qu'on veut
     * voir mourir. Les ignorer coûterait la seule chose que cet outil apporte
     * ici.
     */
    tempDirName: '.stryker-tmp',
};
