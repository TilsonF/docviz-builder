/**
 * Pruebas de rutas y contencion del directorio de salida (seccion 19 — Paths).
 */

import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  assertInside,
  assertRelativeDir,
  assetFileName,
  ensureAssetsDir,
  relativeAssetPath,
  slugify,
  toPosix,
} from '../../src/core/paths.js';
import { PathSecurityError } from '../../src/core/errors.js';

const temps: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'docviz-paths-'));
  temps.push(dir);
  return dir;
}
afterAll(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});

describe('slugify', () => {
  it('normaliza acentos y espacios', () => {
    expect(slugify('Flujo de autenticación')).toBe('flujo-de-autenticacion');
  });

  it('elimina caracteres que podrian formar una ruta', () => {
    expect(slugify('../../etc/passwd')).toBe('etc-passwd');
    expect(slugify('a/b\\c')).toBe('a-b-c');
    expect(slugify('archivo.svg')).toBe('archivo-svg');
  });

  it('devuelve un valor por defecto si no queda nada util', () => {
    expect(slugify('###')).toBe('diagrama');
    expect(slugify('')).toBe('diagrama');
  });

  it('acota la longitud', () => {
    expect(slugify('a'.repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe('assetFileName', () => {
  it('produce `<slug>-<hash>.<ext>`', () => {
    expect(assetFileName('Flujo de autenticación', 'e61fc827', 'svg')).toBe(
      'flujo-de-autenticacion-e61fc827.svg',
    );
    expect(assetFileName('Arquitectura', 'a4f93d12', 'png')).toBe('arquitectura-a4f93d12.png');
  });
});

describe('assertInside — impide path traversal', () => {
  it('acepta rutas contenidas', () => {
    const root = path.resolve('/tmp/salida');
    expect(assertInside(root, 'assets/generated/a.svg')).toBe(
      path.join(root, 'assets/generated/a.svg'),
    );
  });

  it('rechaza rutas que suben del directorio raiz', () => {
    const root = path.resolve('/tmp/salida');
    expect(() => assertInside(root, '../../../../etc/passwd')).toThrow(PathSecurityError);
    expect(() => assertInside(root, 'assets/../../fuera.svg')).toThrow(PathSecurityError);
  });

  it('rechaza rutas absolutas fuera del raiz', () => {
    const root = path.resolve('/tmp/salida');
    expect(() => assertInside(root, '/etc/passwd')).toThrow(PathSecurityError);
  });

  it('rechaza bytes nulos', () => {
    expect(() => assertInside('/tmp/salida', 'a\0b.svg')).toThrow(PathSecurityError);
  });

  it('acepta el propio raiz', () => {
    const root = path.resolve('/tmp/salida');
    expect(assertInside(root, '.')).toBe(root);
  });
});

describe('assertRelativeDir', () => {
  it('acepta un subdirectorio relativo', () => {
    expect(assertRelativeDir('assets/generated', 'output.assetsDir')).toBe('assets/generated');
    expect(assertRelativeDir('./assets/generated/', 'output.assetsDir')).toBe('assets/generated');
  });

  it('rechaza rutas absolutas', () => {
    expect(() => assertRelativeDir('/var/www', 'output.assetsDir')).toThrow(PathSecurityError);
    expect(() => assertRelativeDir('C:\\datos', 'output.assetsDir')).toThrow(PathSecurityError);
  });

  it('rechaza salir del directorio de salida', () => {
    expect(() => assertRelativeDir('../fuera', 'output.assetsDir')).toThrow(PathSecurityError);
  });

  it('rechaza valores vacios', () => {
    expect(() => assertRelativeDir('   ', 'output.assetsDir')).toThrow(PathSecurityError);
  });
});

describe('ensureAssetsDir', () => {
  it('crea el directorio assets/generated', async () => {
    const root = await tempDir();
    const dir = await ensureAssetsDir(root, 'assets/generated');
    expect(dir).toBe(path.join(root, 'assets', 'generated'));
    expect((await stat(dir)).isDirectory()).toBe(true);
  });

  it('es idempotente', async () => {
    const root = await tempDir();
    await ensureAssetsDir(root, 'assets/generated');
    await expect(ensureAssetsDir(root, 'assets/generated')).resolves.toBeDefined();
  });

  it('no permite un assetsDir que se salga de la salida', async () => {
    const root = await tempDir();
    await expect(ensureAssetsDir(root, '../fuera')).rejects.toThrow(PathSecurityError);
  });
});

describe('relativeAssetPath', () => {
  it('produce una ruta relativa con prefijo explicito', () => {
    const out = path.resolve('/tmp/docs');
    const asset = path.join(out, 'assets', 'generated', 'a.svg');
    expect(relativeAssetPath(out, asset)).toBe('./assets/generated/a.svg');
  });

  it('sube de directorio cuando el documento esta anidado', () => {
    const out = path.resolve('/tmp/docs');
    const asset = path.join(out, 'assets', 'generated', 'a.svg');
    expect(relativeAssetPath(path.join(out, 'sub', 'dir'), asset)).toBe('../../assets/generated/a.svg');
  });

  it('nunca devuelve una ruta absoluta', () => {
    const out = path.resolve('/tmp/docs');
    const asset = path.join(out, 'assets', 'generated', 'a.svg');
    for (const dir of [out, path.join(out, 'x'), path.join(out, 'x', 'y')]) {
      expect(path.isAbsolute(relativeAssetPath(dir, asset))).toBe(false);
    }
  });
});

describe('toPosix', () => {
  it('devuelve separadores POSIX', () => {
    expect(toPosix(path.join('a', 'b', 'c'))).toBe('a/b/c');
  });
});
