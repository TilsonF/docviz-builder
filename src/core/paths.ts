/**
 * Resolucion de rutas de recursos y contencion del directorio de salida
 * (seccion 12, puntos 8 y 9 de la especificacion).
 *
 * Todo lo que se escriba debe quedar dentro del directorio configurado. Ninguna
 * cadena procedente de un documento Markdown se usa como ruta sin pasar por
 * `assertInside`.
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { PathSecurityError } from './errors.js';
import type { OutputFormat } from './types.js';

const DIACRITICS = /[̀-ͯ]/g;
const NON_SLUG = /[^a-z0-9]+/g;

/**
 * Convierte un titulo en un nombre de archivo seguro: minusculas ASCII,
 * separadas por guiones, sin puntos ni separadores de ruta.
 */
export function slugify(title: string, fallback = 'diagrama'): string {
  const slug = title
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(NON_SLUG, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : fallback;
}

/** Nombre de archivo del recurso: `<slug>-<hash>.<ext>`. */
export function assetFileName(title: string, hash: string, format: OutputFormat): string {
  return `${slugify(title)}-${hash}.${format}`;
}

/**
 * Verifica que `candidate` quede estrictamente dentro de `root`.
 *
 * Rechaza `..`, rutas absolutas inyectadas, bytes nulos y enlaces que apunten
 * fuera del arbol. Devuelve la ruta absoluta normalizada.
 */
export function assertInside(root: string, candidate: string): string {
  if (candidate.includes('\0')) {
    throw new PathSecurityError('la ruta contiene un byte nulo', candidate.replace(/\0/g, '\\0'));
  }
  const absRoot = path.resolve(root);
  const absCandidate = path.resolve(absRoot, candidate);
  const rel = path.relative(absRoot, absCandidate);
  if (rel === '') return absCandidate;
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new PathSecurityError(
      'la ruta se sale del directorio de salida configurado',
      `raiz: ${absRoot}\nruta: ${absCandidate}`,
    );
  }
  return absCandidate;
}

/**
 * Valida un fragmento de ruta relativa proveniente de configuracion
 * (por ejemplo `output.assetsDir`).
 */
export function assertRelativeDir(value: string, field: string): string {
  if (value.trim() === '') {
    throw new PathSecurityError(`${field} no puede estar vacio`);
  }
  if (path.isAbsolute(value) || /^[a-zA-Z]:[\\/]/.test(value)) {
    throw new PathSecurityError(`${field} no admite rutas absolutas`, value);
  }
  const normalized = path.normalize(value).replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new PathSecurityError(`${field} no puede apuntar fuera del directorio de salida`, value);
  }
  return normalized.replace(/\/+$/, '');
}

/** Convierte una ruta del sistema a separadores POSIX (Markdown siempre usa `/`). */
export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

/**
 * Ruta legible de un archivo en un mensaje de error.
 *
 * Relativa a la raiz del proyecto mientras el archivo este dentro; si esta
 * fuera —compilar un directorio de otro sitio es legitimo— se muestra completa,
 * porque `../../../../../private/tmp/...` no ayuda a nadie a encontrarlo.
 */
export function displayPath(rootDir: string, file: string): string {
  const relative = path.relative(rootDir, file);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return toPosix(path.resolve(file));
  }
  return toPosix(relative);
}

/**
 * Ruta relativa desde el documento compilado hasta el recurso, siempre con
 * prefijo `./` o `../` para que sea inequivocamente relativa.
 */
export function relativeAssetPath(fromDocumentDir: string, assetAbsolutePath: string): string {
  const rel = toPosix(path.relative(fromDocumentDir, assetAbsolutePath));
  if (rel.startsWith('.')) return rel;
  return `./${rel}`;
}

/** Crea el directorio de recursos, comprobando antes que quede dentro de la salida. */
export async function ensureAssetsDir(outputDir: string, assetsDir: string): Promise<string> {
  const safe = assertRelativeDir(assetsDir, 'output.assetsDir');
  const abs = assertInside(outputDir, safe);
  await mkdir(abs, { recursive: true });
  return abs;
}
