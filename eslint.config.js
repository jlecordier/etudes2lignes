import js from '@eslint/js';
import configPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist/', 'coverage/', 'test-results/', 'playwright-report/'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    configPrettier,
    {
        rules: {
            // Toujours des gabarits de chaîne plutôt que des concaténations.
            'prefer-template': 'error',
            // Jamais de one-liner : accolades obligatoires partout.
            curly: ['error', 'all'],
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        },
    },
    {
        // Scripts Node (le dessin des icônes s'exécute aussi dans le navigateur).
        files: ['scripts/**/*.mjs'],
        languageOptions: { globals: { ...globals.node, ...globals.browser } },
    },
);
