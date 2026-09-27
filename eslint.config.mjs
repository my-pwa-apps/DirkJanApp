import globals from 'globals';

// Classic browser scripts share state through globals exposed by the IIFE modules.
const appModuleGlobals = {
  COMIC_ANIMATION: 'readonly',
  COMIC_LOADER: 'readonly',
  DATE_UTILS: 'readonly',
  STORAGE: 'readonly',
  TELEMETRY: 'readonly',
  TOOLBAR: 'readonly',
  createDateUtils: 'readonly',
  createStorageAdapter: 'readonly',
  createTelemetry: 'readonly'
};

export default [
  { ignores: ['node_modules/**', 'playwright-report*/**', 'test-results/**', 'proxy-worker/node_modules/**', 'proxy-worker/.wrangler/**'] },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.node }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }]
    }
  },
  {
    files: ['*.js'],
    languageOptions: { globals: appModuleGlobals }
  },
  {
    files: ['serviceworker.js'],
    languageOptions: { globals: globals.serviceworker }
  },
  {
    files: ['**/*.mjs', 'proxy-worker/src/**/*.js'],
    languageOptions: { sourceType: 'module' }
  }
];
