/**
 * Localizacion de un navegador Chromium ya instalado en la maquina.
 *
 * DocViz no descarga navegadores: usa el Chrome/Chromium del sistema o el que
 * ya tengan cacheado Playwright o Puppeteer. Es la unica dependencia pesada del
 * renderer Mermaid y conviene que sea explicita y diagnosticable.
 */

import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAC_APPS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome 2.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
];

const LINUX_BINS = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
  '/snap/bin/chromium',
];

const WINDOWS_BINS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

/** Navegadores descargados por Playwright (`~/Library/Caches/ms-playwright`, etc.). */
function playwrightCandidates(): string[] {
  const roots = [
    process.env['PLAYWRIGHT_BROWSERS_PATH'],
    os.platform() === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
      : os.platform() === 'win32'
        ? path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
        : path.join(os.homedir(), '.cache', 'ms-playwright'),
  ].filter((r): r is string => typeof r === 'string' && r !== '' && existsSync(r));

  const found: string[] = [];
  for (const root of roots) {
    let entries: string[];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries.filter((e) => e.startsWith('chromium')).sort().reverse()) {
      const base = path.join(root, entry);
      found.push(
        path.join(base, 'chrome-mac-arm64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        path.join(base, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        path.join(base, 'chrome-linux', 'chrome'),
        path.join(base, 'chrome-win', 'chrome.exe'),
        path.join(base, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
        path.join(base, 'chrome-headless-shell-linux', 'chrome-headless-shell'),
      );
    }
  }
  return found;
}

/** Navegadores descargados por Puppeteer (`~/.cache/puppeteer`). */
function puppeteerCandidates(): string[] {
  const root = process.env['PUPPETEER_CACHE_DIR'] ?? path.join(os.homedir(), '.cache', 'puppeteer');
  if (!existsSync(root)) return [];
  const found: string[] = [];
  for (const channel of ['chrome', 'chrome-headless-shell', 'chromium']) {
    const dir = path.join(root, channel);
    if (!existsSync(dir)) continue;
    for (const version of readdirSync(dir).sort().reverse()) {
      const base = path.join(dir, version);
      found.push(
        path.join(base, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        path.join(base, 'chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        path.join(base, 'chrome-linux64', 'chrome'),
        path.join(base, 'chrome-win64', 'chrome.exe'),
        path.join(base, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
        path.join(base, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
      );
    }
  }
  return found;
}

/** Orden de busqueda, de mas explicito a mas implicito. */
export function browserCandidates(explicit?: string): string[] {
  const list: (string | undefined)[] = [
    explicit,
    process.env['DOCVIZ_BROWSER_PATH'],
    process.env['PUPPETEER_EXECUTABLE_PATH'],
    process.env['CHROME_PATH'],
  ];
  const platform = os.platform();
  if (platform === 'darwin') list.push(...MAC_APPS);
  else if (platform === 'win32') list.push(...WINDOWS_BINS);
  else list.push(...LINUX_BINS);
  list.push(...playwrightCandidates(), ...puppeteerCandidates());
  return list.filter((p): p is string => typeof p === 'string' && p !== '');
}

export function findBrowser(explicit?: string): string | undefined {
  return browserCandidates(explicit).find((p) => existsSync(p));
}

export function browserNotFoundHelp(): string {
  return [
    'DocViz usa un Chromium ya instalado; no descarga navegadores.',
    'Opciones:',
    '  - instala Google Chrome, o',
    '  - exporta DOCVIZ_BROWSER_PATH=/ruta/al/chrome, o',
    '  - define renderers.mermaid.browserPath en docviz.config.yaml, o',
    '  - ejecuta `npx playwright install chromium`.',
  ].join('\n');
}

/**
 * Argumentos con los que se lanza Chromium.
 *
 * `--no-sandbox` **no** esta en la lista por defecto. El contenido que se
 * dibuja aqui puede venir del documento de otra persona —un pull request, por
 * ejemplo— y renderizarlo en un navegador sin sandbox convierte cualquier fallo
 * del motor de render en ejecucion con los permisos del usuario. Se activa a
 * proposito, no por descuido.
 */
export function chromiumLaunchArgs(noSandbox: boolean): string[] {
  const args = [
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    '--disable-background-networking',
    '--disable-sync',
    '--no-first-run',
    '--no-default-browser-check',
  ];
  if (noSandbox) args.unshift('--no-sandbox');
  return args;
}

/**
 * Si hay que desactivar el sandbox.
 *
 * Como root, Chromium **se niega a arrancar** con el sandbox activo, asi que en
 * ese caso se desactiva solo: es eso o no dibujar nada, y es la situacion
 * habitual dentro de un contenedor. En cualquier otro caso hay que pedirlo.
 */
export function shouldDisableSandbox(explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  if (process.env['DOCVIZ_NO_SANDBOX'] === '1') return true;
  return process.getuid?.() === 0;
}
