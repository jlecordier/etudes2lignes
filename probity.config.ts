import { defineConfig, enforceTdd } from '@nizos/probity';

export default defineConfig({
    rules: [
        {
            files: ['src/**'],
            rules: [enforceTdd()],
        },
    ],
});
