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
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const cache = new Map<string, string>();
const disponibles = new Map<string, boolean>();

/**
 * Si un paquete se puede resolver desde aqui.
 *
 * Hace falta porque un renderer puede estar COMPILADO dentro de DocViz y aun
 * asi no poder dibujar: `likec4` se carga con un `import()` dinamico, asi que
 * su ausencia no se nota hasta el render, ya tarde y con un «Cannot find
 * package» crudo en vez del respaldo que el catalogo declara.
 */
export function paqueteDisponible(name: string): boolean {
  const cached = disponibles.get(name);
  if (cached !== undefined) return cached;
  let hay = false;
  try {
    require_.resolve(name);
    hay = true;
  } catch {
    // Ya vale `false`: no resolverse ES la respuesta, no un fallo que tratar.
  }
  disponibles.set(name, hay);
  return hay;
}

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

/**
 * Version de DocViz, leida de su propio `package.json`.
 *
 * Estaba escrita a mano en `cli.ts` y nadie la subia: la 0.7.0 y la 0.8.0
 * salieron al registro diciendo las dos que eran la 0.6.0, y `--version` es
 * justo lo que mira quien va a abrir un informe de fallo. Una prueba comprueba
 * que coincida con el manifiesto, asi que ya no puede desincronizarse.
 *
 * Se sube por el arbol en lugar de fijar `../package.json`: la ruta no es la
 * misma ejecutando `dist/cli.js` que `src/cli.ts` con tsx.
 */
export function versionDeDocViz(): string {
  // `fileURLToPath` y no `new URL(...).pathname`: en Windows ese `pathname` es
  // `/C:/Users/...`, con una barra delante que ninguna llamada del sistema de
  // archivos acepta. Daba `desconocida` solo alli, que es peor que el numero
  // viejo: parece que la instalacion esta rota.
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
        name?: string;
        version?: string;
      };
      if (pkg.name === 'docviz-builder' && typeof pkg.version === 'string') return pkg.version;
    } catch {
      // seguir subiendo
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return 'desconocida';
}
