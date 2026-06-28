module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: {
    react: { version: 'detect' },
  },
  extends: ['eslint:recommended', 'plugin:react/recommended'],
  plugins: ['react'],
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
  ignorePatterns: ['dist/', 'build/', 'node_modules/'],
  overrides: [
    {
      files: ['src/main/**/*.js', 'src/preload/**/*.js', '*.cjs'],
      env: { node: true, browser: false },
      parserOptions: { sourceType: 'script' },
    },
    {
      files: ['src/preload/profile-preload.js'],
      env: { node: true, browser: true },
    },
  ],
};
