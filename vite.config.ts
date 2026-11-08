import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@data': fileURLToPath(new URL('./data', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: mode === 'single' ? 100000000 : 4096,
    chunkSizeWarningLimit: 4000,
    // poc3d.html: prueba 3D aislada de la playa, se publica al lado del juego
    // (no en el build de un solo archivo, que es solo el juego).
    rollupOptions:
      mode === 'single'
        ? undefined
        : {
            input: {
              main: fileURLToPath(new URL('./index.html', import.meta.url)),
              poc3d: fileURLToPath(new URL('./poc3d.html', import.meta.url)),
            },
          },
  },
}));
