import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const rootDir = __dirname;
const htmlInputs = Object.fromEntries(
  readdirSync(rootDir)
    .filter((file) => file.endsWith('.html'))
    .map((file) => [file.replace(/\.html$/, ''), resolve(rootDir, file)])
);

// In production Vite extracts module scripts to external bundles. Keep all
// required boot scripts external too, then strip 'unsafe-inline' from
// script-src at build time so the deployed CSP stays strict.
function strictCspPlugin() {
  return {
    name: 'strict-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(/ 'unsafe-inline'/g, '');
      }
    }
  };
}

export default defineConfig({
  base: '/Web-OS/',
  plugins: [strictCspPlugin()],
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  preview: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  build: {
    rollupOptions: {
      input: htmlInputs
    }
  }
});
