import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react(), { name: 'local-development-csp', apply: 'serve', transformIndexHtml(html) {
    return html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';").replace("connect-src 'self' https: comd-asset:;", "connect-src 'self' https: comd-asset: ws://127.0.0.1:* ws://localhost:*;");
  } }],
  base: './', build: { outDir: 'dist', chunkSizeWarningLimit: 1200 }
});
