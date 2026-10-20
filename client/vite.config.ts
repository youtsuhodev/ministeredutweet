import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  /* `npm run dev` dans client/ (port 5173) : l'API et les uploads sont servis par le serveur Express. */
  server: {
    proxy: {
      '/api': 'http://localhost:7286',
      '/uploads': 'http://localhost:7286',
      '/ws': { target: 'http://localhost:7286', ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1300,
  },
});
