/**
 * Cache de recursos en disco (secciones 10 y 21 de la especificacion).
 *
 * La clave es el hash completo del recurso. El cache vive fuera del directorio
 * de salida, de modo que `--clean` borra la salida pero conserva los aciertos.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { OutputFormat } from './types.js';

export const DEFAULT_CACHE_DIR = '.docviz-cache';

export interface CacheEntry {
  content: Buffer;
  format: OutputFormat;
}

export interface CacheStats {
  hits: number;
  misses: number;
  writes: number;
}

export class AssetCache {
  private readonly dir: string;
  private readonly enabled: boolean;
  private readonly stats: CacheStats = { hits: 0, misses: 0, writes: 0 };

  constructor(dir: string, enabled = true) {
    this.dir = path.resolve(dir);
    this.enabled = enabled;
  }

  get directory(): string {
    return this.dir;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  getStats(): Readonly<CacheStats> {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.writes = 0;
  }

  private entryPath(fullHash: string, format: OutputFormat): string {
    // Dos niveles de sharding: evita directorios con decenas de miles de entradas.
    const a = fullHash.slice(0, 2);
    const b = fullHash.slice(2, 4);
    return path.join(this.dir, a, b, `${fullHash}.${format}`);
  }

  async get(fullHash: string, format: OutputFormat): Promise<Buffer | undefined> {
    if (!this.enabled) {
      this.stats.misses += 1;
      return undefined;
    }
    try {
      const content = await readFile(this.entryPath(fullHash, format));
      this.stats.hits += 1;
      return content;
    } catch {
      this.stats.misses += 1;
      return undefined;
    }
  }

  async set(fullHash: string, format: OutputFormat, content: Buffer): Promise<void> {
    const target = this.entryPath(fullHash, format);
    await mkdir(path.dirname(target), { recursive: true });
    // Escritura atomica: un build interrumpido no deja una entrada truncada
    // que luego se sirva como acierto de cache.
    const tmp = `${target}.${createHash('sha1').update(String(process.pid)).digest('hex').slice(0, 8)}.tmp`;
    await writeFile(tmp, content);
    const { rename } = await import('node:fs/promises');
    await rename(tmp, target);
    this.stats.writes += 1;
  }

  async clear(): Promise<void> {
    await rm(this.dir, { recursive: true, force: true });
  }
}
