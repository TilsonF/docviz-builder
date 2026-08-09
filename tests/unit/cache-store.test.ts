/**
 * Pruebas del almacen de cache en disco.
 */

import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { AssetCache, DEFAULT_CACHE_DIR } from '../../src/core/cache.js';

const temps: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'docviz-cache-'));
  temps.push(dir);
  return dir;
}
afterAll(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});

const HASH = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

describe('AssetCache', () => {
  it('devuelve undefined y cuenta fallo cuando no hay entrada', async () => {
    const cache = new AssetCache(path.join(await tempDir(), 'c'));
    expect(await cache.get(HASH, 'svg')).toBeUndefined();
    expect(cache.getStats()).toEqual({ hits: 0, misses: 1, writes: 0 });
  });

  it('guarda y recupera una entrada', async () => {
    const cache = new AssetCache(path.join(await tempDir(), 'c'));
    await cache.set(HASH, 'svg', Buffer.from('<svg/>'));
    const found = await cache.get(HASH, 'svg');
    expect(found?.toString()).toBe('<svg/>');
    expect(cache.getStats()).toEqual({ hits: 1, misses: 0, writes: 1 });
  });

  it('distingue formatos con el mismo hash', async () => {
    const cache = new AssetCache(path.join(await tempDir(), 'c'));
    await cache.set(HASH, 'svg', Buffer.from('svg'));
    expect(await cache.get(HASH, 'png')).toBeUndefined();
  });

  it('reparte las entradas en subdirectorios', async () => {
    const dir = path.join(await tempDir(), 'c');
    const cache = new AssetCache(dir);
    await cache.set(HASH, 'svg', Buffer.from('x'));
    const level1 = await readdir(dir);
    expect(level1).toEqual([HASH.slice(0, 2)]);
    const level2 = await readdir(path.join(dir, HASH.slice(0, 2)));
    expect(level2).toEqual([HASH.slice(2, 4)]);
  });

  it('no deja archivos temporales tras escribir', async () => {
    const dir = path.join(await tempDir(), 'c');
    const cache = new AssetCache(dir);
    await cache.set(HASH, 'svg', Buffer.from('x'));
    const files = await readdir(path.join(dir, HASH.slice(0, 2), HASH.slice(2, 4)));
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('deshabilitado nunca acierta, pero sigue escribiendo', async () => {
    const dir = path.join(await tempDir(), 'c');
    const cache = new AssetCache(dir, false);
    expect(cache.isEnabled).toBe(false);
    await cache.set(HASH, 'svg', Buffer.from('x'));
    expect(await cache.get(HASH, 'svg')).toBeUndefined();
    expect(cache.getStats().hits).toBe(0);
    // La entrada existe: un build posterior con cache activo la aprovechara.
    expect((await stat(path.join(dir, HASH.slice(0, 2), HASH.slice(2, 4), `${HASH}.svg`))).isFile()).toBe(true);
  });

  it('clear elimina todo el directorio', async () => {
    const dir = path.join(await tempDir(), 'c');
    const cache = new AssetCache(dir);
    await cache.set(HASH, 'svg', Buffer.from('x'));
    await cache.clear();
    await expect(stat(dir)).rejects.toThrow();
  });

  it('resetStats vuelve a cero los contadores', async () => {
    const cache = new AssetCache(path.join(await tempDir(), 'c'));
    await cache.get(OTHER, 'svg');
    cache.resetStats();
    expect(cache.getStats()).toEqual({ hits: 0, misses: 0, writes: 0 });
  });

  it('expone el directorio resuelto', async () => {
    const dir = await tempDir();
    expect(new AssetCache(path.join(dir, 'c')).directory).toBe(path.join(dir, 'c'));
  });

  it('una entrada corrupta en disco no impide leerla como bytes', async () => {
    const dir = path.join(await tempDir(), 'c');
    const cache = new AssetCache(dir);
    await cache.set(HASH, 'svg', Buffer.from('parcial'));
    await writeFile(path.join(dir, HASH.slice(0, 2), HASH.slice(2, 4), `${HASH}.svg`), 'otro');
    expect((await cache.get(HASH, 'svg'))?.toString()).toBe('otro');
  });

  it('el directorio por defecto es .docviz-cache', () => {
    expect(DEFAULT_CACHE_DIR).toBe('.docviz-cache');
  });
});
