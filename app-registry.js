// app-registry.js — SSOT for the installed-plugin registry persisted in
// localStorage. Owns the storage key and the load / validate / add cycle, so
// the key string and the persisted shape live in exactly one place.

import { sanitizeManifest } from './plugin-installer.js';

const STORAGE_KEY = 'vortex_installed_apps';

class AppRegistry {
  constructor() {
    this.apps = this._load();
  }

  // Re-run the full sanitizeManifest pipeline on every stored entry so a
  // tampered permissions array or entrypoint cannot bypass the capability
  // model just by surviving in localStorage across a reload.
  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const apps = JSON.parse(raw);
      if (!Array.isArray(apps)) return [];
      return apps.filter(app => {
        try {
          if (!app || typeof app.manifestUrl !== 'string' || !app.manifestUrl) return false;
          sanitizeManifest(app.manifest, app.manifestUrl);
          return true;
        } catch {
          return false;
        }
      });
    } catch {
      return [];
    }
  }

  // The currently installed apps. Callers iterate this to render; they must
  // not mutate it — go through add() so the change is persisted.
  list() {
    return this.apps;
  }

  // Install or replace an app, keyed by manifest id, and persist immediately.
  add(manifest, manifestUrl) {
    this.apps = this.apps.filter(app => app.manifest.id !== manifest.id);
    this.apps.push({ manifest, manifestUrl });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.apps));
  }
}

export { AppRegistry };
