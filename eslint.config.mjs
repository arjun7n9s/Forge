import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  {
    settings: {
      next: { rootDir: ['forge-personal/', 'forge-enrich/'] },
    },
  },
  globalIgnores([
    '**/.next*/**',
    '**/dist/**',
    '**/out/**',
    '**/coverage/**',
    '**/test-results/**',
    '**/playwright-report/**',
    '**/next-env.d.ts',
    'docs/generated/**',
  ]),
]);
