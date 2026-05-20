import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const rootDir = __dirname;
const htmlInputs = Object.fromEntries(
  readdirSync(rootDir)
    .filter((file) => file.endsWith('.html'))
    .map((file) => [file.replace(/\.html$/, ''), resolve(rootDir, file)])
);

// In production Vite extracts every <script type="module"> to an external
// bundle, leaving no inline scripts in the output HTML. Strip 'unsafe-inline'
// from script-src at build time so the deployed CSP is strict. The source
// index.html keeps 'unsafe-inline' so the Vite dev server works unmodified.
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
