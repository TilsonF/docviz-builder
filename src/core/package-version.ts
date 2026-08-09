/**
 * Lectura de la version de un paquete instalado.
 *
 * No se puede importar `<paquete>/package.json` directamente: varios paquetes
 * (d2, graphviz-wasm, vega) no lo exponen en su mapa `exports`. Se resuelve el
 * modulo y se sube por el arbol hasta encontrar su `package.json`.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const cache = new Map<string, string>();

export function packageVersion(name: string, fallback = 'desconocida'): string {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;

  let version = fallback;
  try {
    let dir = path.dirname(require_.resolve(name));
    for (let depth = 0; depth < 12; depth += 1) {
      const candidate = path.join(dir, 'package.json');
      try {
        const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as { name?: string; version?: string };
        if (pkg.name === name && typeof pkg.version === 'string') {
          version = pkg.version;
          break;
        }
      } catch {
        // seguir subiendo
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // paquete no resoluble: se devuelve el valor por defecto
  }

  cache.set(name, version);
  return version;
}
