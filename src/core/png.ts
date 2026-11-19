/**
 * Compresion sin perdida del PNG generado.
 *
 * Los motores que solo emiten SVG se rasterizan con Chromium, y Chromium
 * escribe un PNG correcto pero holgado: no reduce el tipo de color ni busca el
 * filtro por fila que mejor comprime. Sobre el catalogo de este repositorio
 * —las 69 figuras de `artifacts/test-results/screenshots/claro`— oxipng recorta
 * un 32,1 % (837 582 -> 569 016 B) **dejando los pixeles intactos**: las 69
 * salen identicas al decodificarlas a RGBA.
 *
 * Donde se cobra ese ahorro no es en la pagina sino en el repositorio de quien
 * escribe la documentacion: un PNG es un binario versionado, cada regeneracion
 * deja un blob nuevo y los viejos no se van nunca.
 *
 * Va apagada por defecto porque cuesta unos 250 ms por figura, y el
 * presupuesto de render ya se agoto una vez en Windows.
 */

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { DocVizError, ERROR_CODES } from './errors.js';

/** Nivel de oxipng. El 3 es el punto donde deja de mejorar lo que cuesta. */
const NIVEL = 3;

interface Optimizador {
  (data: ArrayBuffer | Uint8Array, opciones: Record<string, unknown>): Promise<ArrayBuffer>;
}

/**
 * El `lib` del proyecto es ES2023 y el namespace `WebAssembly` vive en
 * `lib.dom`. Se declara aqui lo unico que se usa en lugar de arrastrar toda la
 * DOM al typecheck de una libreria de Node.
 */
const wasm = (globalThis as unknown as {
  WebAssembly: { compile(bytes: Uint8Array): Promise<unknown> };
}).WebAssembly;

let cargando: Promise<Optimizador> | undefined;

/**
 * Carga el modulo WASM una sola vez por proceso.
 *
 * `@jsquash/oxipng` esta pensado para el navegador: si no se le pasa el modulo
 * ya compilado intenta un `fetch` del `.wasm` y falla en Node. Se resuelve la
 * ruta del archivo con `createRequire` —el paquete no declara `exports`, asi
 * que el subcamino es accesible— y se compila desde disco.
 */
async function cargar(): Promise<Optimizador> {
  cargando ??= (async (): Promise<Optimizador> => {
    const require = createRequire(import.meta.url);
    const modulo = (await import('@jsquash/oxipng/optimise.js')) as {
      default: Optimizador;
      init: (modulo: unknown) => Promise<unknown>;
    };
    const ruta = require.resolve('@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm');
    await modulo.init(await wasm.compile(await readFile(ruta)));
    return modulo.default;
  })();
  return cargando;
}

/**
 * Recomprime un PNG sin tocar un solo pixel.
 *
 * Devuelve el original cuando el resultado no es mas pequeno: oxipng no deberia
 * engordar nunca un archivo, pero el contrato de esta funcion es «igual o
 * menos bytes, los mismos pixeles», y conviene que lo garantice el codigo y no
 * la confianza.
 */
export async function optimizarPng(png: Buffer): Promise<Buffer> {
  let optimizar: Optimizador;
  try {
    optimizar = await cargar();
  } catch (err) {
    throw new DocVizError(
      'no se pudo cargar el optimizador de PNG',
      {},
      `${err instanceof Error ? err.message : String(err)}. Desactiva renderers.png.optimize en docviz.config.yaml para seguir sin comprimir`,
      ERROR_CODES.OPTIMIZACION_PNG,
    );
  }
  let salida: Buffer;
  try {
    salida = Buffer.from(
      await optimizar(png, { level: NIVEL, interlace: false, optimiseAlpha: true }),
    );
  } catch (err) {
    throw new DocVizError(
      'el optimizador de PNG rechazo la imagen',
      {},
      `${err instanceof Error ? err.message : String(err)}. Desactiva renderers.png.optimize en docviz.config.yaml`,
      ERROR_CODES.OPTIMIZACION_PNG,
    );
  }
  return salida.byteLength < png.byteLength ? salida : png;
}
