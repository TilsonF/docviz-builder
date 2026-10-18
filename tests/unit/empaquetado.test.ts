/**
 * Pruebas del contrato de empaquetado: un solo formato, dos puertas.
 *
 * El paquete se publica como ESM (`"type": "module"`) con UN solo fichero
 * compilado de entrada. Las condiciones `import` y `require` apuntan a ese
 * mismo fichero, y eso es lo que evita el *dual-package hazard*: declarar
 * `"type": "module"` no lo evita por si solo —un paquete de doble formato
 * tambien lo declara—, lo evita que no exista una segunda construccion que
 * el resolutor pueda cargar aparte.
 *
 * La comprobacion de que el grafo compilado se puede requerir de verdad
 * —sin `await` de nivel superior, que lanzaria ERR_REQUIRE_ASYNC_MODULE—
 * necesita `dist`, asi que vive en `scripts/comprobar-cjs.mjs` y corre en
 * CI despues de compilar. Aqui se fija el contrato declarado.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifiesto = JSON.parse(readFileSync(path.join(raiz, 'package.json'), 'utf8')) as {
  type?: string;
  main?: string;
  types?: string;
  engines?: { node?: string };
  exports?: Record<string, Record<string, string>>;
  scripts?: Record<string, string>;
};
const entrada = manifiesto.exports?.['.'] ?? {};

describe('contrato de empaquetado', () => {
  it('se publica como ESM', () => {
    expect(manifiesto.type).toBe('module');
  });

  it('abre las dos puertas, import y require', () => {
    expect(entrada['import']).toBeDefined();
    expect(entrada['require']).toBeDefined();
  });

  it('las dos puertas dan al mismo fichero, que es lo que evita el dual-package hazard', () => {
    expect(entrada['require']).toBe(entrada['import']);
  });

  it('declara los tipos antes que las condiciones de carga', () => {
    expect(Object.keys(entrada)[0]).toBe('types');
    expect(entrada['types']).toBe(manifiesto.types);
  });

  it('"main" coincide con la entrada del mapa, para resolutores antiguos', () => {
    expect(manifiesto.main).toBe(entrada['import']);
  });

  it('expone package.json, que es lo que piden las herramientas', () => {
    expect(manifiesto.exports?.['./package.json']).toBe('./package.json');
  });

  it('declara el Node que require(esm) necesita', () => {
    // require() de un modulo ESM funciona sin bandera desde 22.12. Si el suelo
    // bajara de ahi, la condicion "require" prometeria algo que no se cumple.
    const minimo = /(\d+)\.(\d+)/.exec(manifiesto.engines?.node ?? '');
    expect(minimo).not.toBeNull();
    const [mayor, menor] = [Number(minimo?.[1]), Number(minimo?.[2])];
    expect(mayor > 22 || (mayor === 22 && menor >= 12)).toBe(true);
  });

  it('tiene el guardian que comprueba el grafo compilado', () => {
    expect(manifiesto.scripts?.['check:cjs']).toBe('node scripts/comprobar-cjs.mjs');
  });
});
