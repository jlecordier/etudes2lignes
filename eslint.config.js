import js from '@eslint/js';
import configPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        // `.stryker-tmp/` est une copie mutée du projet, que Stryker efface en
        // partant : sans cet ignore, un lint lancé pendant les tests de mutation
        // analyserait du code volontairement abîmé.
        ignores: [
            'dist/',
            'coverage/',
            'test-results/',
            'playwright-report/',
            '.stryker-tmp/',
            'reports/',
        ],
    },
    js.configs.recommended,
    // Analyse basée sur les types : le socle le plus exigeant.
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    // Neutralise les règles ESLint qui feraient doublon avec Prettier.
    configPrettier,
    {
        // Réglages maison, appliqués par-dessus les presets.
        rules: {
            // Toujours des gabarits de chaîne plutôt que des concaténations.
            'prefer-template': 'error',
            // Jamais de one-liner : accolades obligatoires partout.
            curly: ['error', 'all'],
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            // Compatible avec noPropertyAccessFromIndexSignature (accès crochet toléré
            // uniquement quand la propriété vient d'une signature d'index).
            '@typescript-eslint/dot-notation': [
                'error',
                { allowIndexSignaturePropertyAccess: true },
            ],
            // Interpoler un nombre dans un gabarit est sûr et lisible ; on garde
            // l'interdiction pour les objets, tableaux et valeurs nullish.
            '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
            // Ce que la règle protège vraiment, c'est le retour trompeur —
            // `return console.log(x)` dans une fonction censée rendre une valeur.
            // Une lambda courte qui passe un appel en rappel ne trompe personne :
            // `expect(() => creer(''))` .toThrow() est l'idiome de test, et
            // `surRetour: () => quitter()` celui du câblage. Sans cette option,
            // Prettier déplie chacun de ces cas en trois lignes sans rien gagner
            // en clarté — c'est la raison que donne la documentation de la règle.
            // Les autres tolérances (opérateur `void`, fonctions rendant `void`)
            // restent fermées.
            '@typescript-eslint/no-confusing-void-expression': [
                'error',
                { ignoreArrowShorthand: true },
            ],
        },
    },
    {
        // Fichiers de conf et scripts Node hors du programme TS : pas de type-checking.
        files: ['eslint.config.js', 'stryker.config.mjs', 'scripts/**/*.mjs'],
        extends: [tseslint.configs.disableTypeChecked],
        languageOptions: { globals: { ...globals.node, ...globals.browser } },
    },
);
