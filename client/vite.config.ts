import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  envDir: '..', // the repo-root .env; only VITE_-prefixed values reach the browser
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
});
