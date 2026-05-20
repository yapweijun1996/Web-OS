import { createReadStream, readdirSync, statSync } from 'node:fs';
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

function rawApkMirrorPlugin() {
  const mirrorRoot = resolve(rootDir, 'public/v86/apk');

  function serveRawApk(req, res, next) {
    const rawUrl = req.url || '';
    const pathname = decodeURIComponent(rawUrl.split('?')[0]);
    const match = pathname.match(/^\/(?:Web-OS\/)?v86\/apk\/(.+)$/);
    if (!match) {
      next();
      return;
    }

    const filePath = resolve(mirrorRoot, match[1]);
    if (filePath !== mirrorRoot && !filePath.startsWith(`${mirrorRoot}/`)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    try {
      const stat = statSync(filePath);
      if (!stat.isFile()) {
        next();
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', String(stat.size));
      res.setHeader('Cache-Control', 'no-cache');
      createReadStream(filePath).pipe(res);
    } catch {
      next();
    }
  }

  return {
    name: 'raw-apk-mirror',
    configureServer(server) {
      server.middlewares.use(serveRawApk);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveRawApk);
    }
  };
}

export default defineConfig({
  base: '/Web-OS/',
  plugins: [rawApkMirrorPlugin(), strictCspPlugin()],
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
