/**
 * Localizacion del navegador usado por el renderer Mermaid.
 *
 * Se simulan los directorios de cache de Playwright y Puppeteer para verificar
 * el descubrimiento sin depender de lo que haya instalado la maquina.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { browserCandidates, browserNotFoundHelp, findBrowser } from '../../src/renderers/browser.js';

const temps: string[] = [];
async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'docviz-browser-'));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});

describe('orden de busqueda', () => {
  it('la ruta explicita gana a todo lo demas', () => {
    vi.stubEnv('DOCVIZ_BROWSER_PATH', '/env/a');
    expect(browserCandidates('/explicito')[0]).toBe('/explicito');
  });

  it('respeta el orden de las variables de entorno', () => {
    vi.stubEnv('DOCVIZ_BROWSER_PATH', '/env/docviz');
    vi.stubEnv('PUPPETEER_EXECUTABLE_PATH', '/env/puppeteer');
    vi.stubEnv('CHROME_PATH', '/env/chrome');
    const candidates = browserCandidates();
    expect(candidates.slice(0, 3)).toEqual(['/env/docviz', '/env/puppeteer', '/env/chrome']);
  });

  it('incluye las rutas habituales del sistema operativo actual', () => {
    const candidates = browserCandidates();
    const platform = os.platform();
    if (platform === 'darwin') {
      expect(candidates.some((c) => c.includes('.app/Contents/MacOS'))).toBe(true);
    } else if (platform === 'win32') {
      expect(candidates.some((c) => c.endsWith('.exe'))).toBe(true);
    } else {
      expect(candidates.some((c) => c.startsWith('/usr/bin/'))).toBe(true);
    }
  });

  it('descarta entradas vacias', () => {
    vi.stubEnv('DOCVIZ_BROWSER_PATH', '');
    expect(browserCandidates()).not.toContain('');
  });
});

describe('cache de Playwright', () => {
  it('descubre el Chromium descargado por Playwright', async () => {
    const root = await tempRoot();
    const base = path.join(root, 'chromium-1234');
    const suffixes = [
      path.join('chrome-mac-arm64', 'Chromium.app', 'Contents', 'MacOS'),
      path.join('chrome-mac', 'Chromium.app', 'Contents', 'MacOS'),
      'chrome-linux',
      'chrome-win',
    ];
    for (const suffix of suffixes) await mkdir(path.join(base, suffix), { recursive: true });
    // Se crea el ejecutable de cada plataforma; solo importa que se encuentre uno.
    await writeFile(path.join(base, suffixes[0]!, 'Chromium'), '');
    await writeFile(path.join(base, suffixes[1]!, 'Chromium'), '');
    await writeFile(path.join(base, 'chrome-linux', 'chrome'), '');
    await writeFile(path.join(base, 'chrome-win', 'chrome.exe'), '');

    vi.stubEnv('PLAYWRIGHT_BROWSERS_PATH', root);
    const candidates = browserCandidates();
    expect(candidates.some((c) => c.startsWith(base))).toBe(true);
  });

  it('prefiere la version mas reciente', async () => {
    const root = await tempRoot();
    for (const version of ['chromium-1000', 'chromium-2000']) {
      await mkdir(path.join(root, version, 'chrome-linux'), { recursive: true });
    }
    vi.stubEnv('PLAYWRIGHT_BROWSERS_PATH', root);
    const candidates = browserCandidates().filter((c) => c.startsWith(root));
    expect(candidates[0]).toContain('chromium-2000');
  });

  it('ignora un directorio de cache inexistente', () => {
    vi.stubEnv('PLAYWRIGHT_BROWSERS_PATH', path.join(tmpdir(), 'no-existe-docviz-pw'));
    expect(() => browserCandidates()).not.toThrow();
  });
});

describe('cache de Puppeteer', () => {
  it('descubre el Chrome for Testing descargado por Puppeteer', async () => {
    const root = await tempRoot();
    const dir = path.join(root, 'chrome', '140.0.0', 'chrome-linux64');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'chrome'), '');

    vi.stubEnv('PUPPETEER_CACHE_DIR', root);
    const found = browserCandidates().find((c) => c === path.join(dir, 'chrome'));
    expect(found).toBeDefined();
  });

  it('recorre los tres canales conocidos', async () => {
    const root = await tempRoot();
    for (const channel of ['chrome', 'chrome-headless-shell', 'chromium']) {
      await mkdir(path.join(root, channel, '1.0.0'), { recursive: true });
    }
    vi.stubEnv('PUPPETEER_CACHE_DIR', root);
    const candidates = browserCandidates().filter((c) => c.startsWith(root));
    expect(candidates.length).toBeGreaterThan(3);
  });
});

describe('findBrowser', () => {
  it('devuelve la primera ruta que exista de verdad', async () => {
    const root = await tempRoot();
    const exe = path.join(root, 'mi-chrome');
    await writeFile(exe, '');
    expect(findBrowser(exe)).toBe(exe);
  });

  it('ignora una ruta explicita que no existe y sigue buscando', () => {
    const inexistente = path.join(tmpdir(), 'chrome-que-no-existe-docviz');
    expect(findBrowser(inexistente)).not.toBe(inexistente);
  });
});

describe('mensaje de ayuda', () => {
  it('explica que DocViz no descarga navegadores', () => {
    expect(browserNotFoundHelp()).toContain('no descarga navegadores');
  });
});
