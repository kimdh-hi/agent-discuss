import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
  const beEnv = loadEnv(mode, resolve(__dirname, '../be'), '');
  const bePort = process.env.PORT || beEnv.PORT || '4070';

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 3001,
      proxy: {
        '/api': {
          target: `http://localhost:${bePort}`,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  };
});
