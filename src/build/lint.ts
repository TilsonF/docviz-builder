/**
 * Revision del artefacto, no de la fuente.
 *
 * `check` valida el bloque antes de dibujar y `verify` comprueba que el
 * Markdown no cite imagenes que no existen. Entre los dos quedaba un hueco:
 * nadie miraba **el SVG que sale**. Un motor puede emitir un dibujo con la
 * etiqueta fuera del lienzo, con un `url(#id)` que no apunta a nada —y por
 * tanto sin su recorte o sin su flecha—, o con dos ids repetidos que se pisan
 * al incrustarlo en una pagina. Nada de eso falla el build, y se descubre
 * cuando el documento ya esta impreso.
 *
 * Todo lo que se comprueba aqui es **exacto**: se lee lo que el archivo dice.
 * Lo que no se puede saber sin maquetar —si dos etiquetas se solapan, si un
 * texto desborda su caja— no se adivina: se cuenta cuantos elementos quedaron
 * sin mirar, para que el silencio no se confunda con un visto bueno.
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { t } from '../core/idioma.js';
import { letraMinima, LIENZOS, type TamanoSalida } from '../core/salida.js';
import { toPosix } from '../core/paths.js';

/** Severidad de un hallazgo. Solo `error` hace fallar la compuerta. */
export type Severidad = 'error' | 'aviso';

export interface Hallazgo {
  file: string;
  severidad: Severidad;
  regla: string;
  mensaje: string;
}

export interface LintResult {
  archivos: number;
  hallazgos: Hallazgo[];
  /**
   * Elementos de texto cuya posicion real no se puede resolver leyendo el
   * archivo, porque heredan una transformacion.
   *
   * No son un problema: son lo que esta revision **no** cubre.
   */
  sinMedir: number;
}

const REGLAS = [
  'nombre-accesible',
  'variables-globales',
  'referencia-colgante',
  'id-repetido',
  'referencia-remota',
  'guion-ejecutable',
  'lienzo',
  'letra-minima',
  'texto-fuera-del-lienzo',
] as const;

export type Regla = (typeof REGLAS)[number];

export function reglas(): readonly Regla[] {
  return REGLAS;
}

export interface LintOptions {
  /** Destino con el que se compilo, para exigir su letra minima. */
  size?: TamanoSalida;
  /** Reglas que no se aplican. */
  omitir?: readonly string[];
}

/** Revisa todos los SVG de un directorio, en orden alfabetico. */
export async function lint(dir: string, options: LintOptions = {}): Promise<LintResult> {
  const archivos = (await recoger(dir)).sort();
  const result: LintResult = { archivos: archivos.length, hallazgos: [], sinMedir: 0 };
  for (const archivo of archivos) {
    const svg = await readFile(archivo, 'utf8');
    const uno = lintSvg(svg, toPosix(path.relative(dir, archivo)), options);
    result.hallazgos.push(...uno.hallazgos);
    result.sinMedir += uno.sinMedir;
  }
  return result;
}

async function recoger(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entradas;
  try {
    entradas = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entrada of entradas) {
    if (entrada.name.startsWith('.')) continue;
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) out.push(...(await recoger(completo)));
    else if (entrada.isFile() && path.extname(entrada.name).toLowerCase() === '.svg') out.push(completo);
  }
  return out;
}

/** Revisa un SVG ya renderizado. */
export function lintSvg(svg: string, file: string, options: LintOptions = {}): LintResult {
  const omitir = new Set(options.omitir ?? []);
  const hallazgos: Hallazgo[] = [];
  const add = (regla: Regla, severidad: Severidad, mensaje: string): void => {
    if (omitir.has(regla)) return;
    hallazgos.push({ file, severidad, regla, mensaje });
  };

  const apertura = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? '';

  // --- el contrato propio de DocViz -------------------------------------
  // El contenido tiene que tener texto: un `<title></title>` vacio es peor que
  // no tener ninguno, porque aparenta cumplir el contrato.
  const tieneTitulo = [...svg.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].some(
    (m) => (m[1] ?? '').trim() !== '',
  );
  if (!/\brole\s*=\s*(["'])img\1/i.test(apertura) || !tieneTitulo) {
    add(
      'nombre-accesible',
      'error',
      t(
        'el dibujo no tiene nombre accesible: falta role="img" o un <title> con texto',
        'the drawing has no accessible name: role="img" or a non-empty <title> is missing',
      ),
    );
  }

  if (/<style[^>]*>[^<]*:root\s*\{/i.test(svg)) {
    add(
      'variables-globales',
      'error',
      t(
        'declara variables CSS sobre `:root`: incrustado en una pagina se las pisa con los demas diagramas',
        'declares CSS variables on `:root`: inlined in a page they collide with the other diagrams',
      ),
    );
  }

  // --- integridad de las referencias internas ---------------------------
  // `(?<![\w-])` y no `\b`: con `\b` esta expresion tambien casa `data-id`,
  // porque el guion es un limite de palabra. D2 y Mermaid etiquetan cada arista
  // con `data-id` y la misma arista aparece dos veces —el trazo y su etiqueta—,
  // asi que daba tres archivos con ids repetidos que no existian.
  const ids = [...svg.matchAll(/(?<![\w-])id\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => m[1] ?? m[2] ?? '');
  const repetidos = [...contar(ids).entries()].filter(([, n]) => n > 1).map(([id]) => id);
  if (repetidos.length > 0) {
    add(
      'id-repetido',
      'error',
      t(
        `${repetidos.length} id repetido(s) dentro del archivo: ${muestra(repetidos)}`,
        `${repetidos.length} duplicate id(s) within the file: ${muestra(repetidos)}`,
      ),
    );
  }

  const definidos = new Set(ids);
  const referidos = new Set<string>();
  // Solo se miran las referencias escritas en un **atributo**. Las que viven
  // dentro de un `<style>` dependen de que su selector llegue a aplicar, y eso
  // no se puede saber sin maquetar: Mermaid lleva reglas para su aspecto «neo»
  // y D2 para su modo a mano libre, con gradientes que esos motores solo
  // definen cuando ese modo esta activo. Contarlas daba 145 errores de los que
  // ninguno era real.
  const sinEstilos = svg.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  for (const m of sinEstilos.matchAll(/=\s*(?:"[^"]*url\(\s*['"]?#([^)'"\s]+)|'[^']*url\(\s*["']?#([^)'"\s]+))/g)) {
    referidos.add(m[1] ?? m[2] ?? '');
  }
  for (const m of sinEstilos.matchAll(/(?:xlink:)?href\s*=\s*(?:"#([^"]*)"|'#([^']*)')/g)) {
    referidos.add(m[1] ?? m[2] ?? '');
  }
  const colgantes = [...referidos].filter((id) => id !== '' && !definidos.has(id)).sort();
  if (colgantes.length > 0) {
    add(
      'referencia-colgante',
      'error',
      t(
        `apunta a ${colgantes.length} id que no existe: ${muestra(colgantes)}. ` +
          'El elemento se dibuja sin su recorte, su mascara o su flecha, y nadie lo nota',
        `points at ${colgantes.length} missing id(s): ${muestra(colgantes)}. ` +
          'The element renders without its clip, mask or arrowhead, and nobody notices',
      ),
    );
  }

  // --- autosuficiencia --------------------------------------------------
  const remotas = [
    ...svg.matchAll(/(?:(?:xlink:)?href|src)\s*=\s*(?:"(https?:[^"]*)"|'(https?:[^']*)')/gi),
  ].map((m) => m[1] ?? m[2] ?? '');
  for (const m of svg.matchAll(/@import\s+[^;]+/gi)) remotas.push(m[0]);
  if (remotas.length > 0) {
    add(
      'referencia-remota',
      'aviso',
      t(
        `necesita la red para dibujarse del todo: ${muestra(remotas)}`,
        `needs the network to render completely: ${muestra(remotas)}`,
      ),
    );
  }

  if (/<script\b/i.test(svg) || /\son[a-z]+\s*=/i.test(svg)) {
    add(
      'guion-ejecutable',
      'error',
      t('lleva un guion o un manejador de eventos', 'carries a script or an event handler'),
    );
  }

  // --- lienzo y legibilidad ---------------------------------------------
  const vb = leerViewBox(apertura);
  const ancho = leerLongitud(apertura, 'width');
  const alto = leerLongitud(apertura, 'height');
  if (vb === undefined || ancho === undefined || alto === undefined) {
    add(
      'lienzo',
      'error',
      t(
        'le falta viewBox, width o height en pixeles: un visor lo mostrara con altura cero o recortado',
        'missing viewBox, width or height in pixels: a viewer will show it clipped or zero-height',
      ),
    );
  }

  const destino = options.size;
  if (destino !== undefined && destino !== 'fit' && vb !== undefined && ancho !== undefined) {
    const letra = letraMinima(svg);
    const minimo = LIENZOS[destino].minFontPx;
    if (letra !== undefined) {
      const efectiva = Math.round(((letra * ancho) / vb.w) * 10) / 10;
      if (efectiva < minimo - 0.5) {
        add(
          'letra-minima',
          'aviso',
          t(
            `la letra mas pequena queda a ${efectiva} px y "${destino}" pide ${minimo}`,
            `the smallest text lands at ${efectiva}px and "${destino}" requires ${minimo}`,
          ),
        );
      }
    }
  }

  // --- texto fuera del lienzo -------------------------------------------
  const fuera = textosFuera(svg, vb);
  if (fuera.recortados.length > 0) {
    add(
      'texto-fuera-del-lienzo',
      'error',
      t(
        `${fuera.recortados.length} texto(s) con su origen fuera del viewBox: ${muestra(fuera.recortados)}`,
        `${fuera.recortados.length} text element(s) anchored outside the viewBox: ${muestra(fuera.recortados)}`,
      ),
    );
  }

  return { archivos: 1, hallazgos, sinMedir: fuera.sinMedir };
}

function contar(valores: readonly string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of valores) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

function muestra(valores: readonly string[], max = 3): string {
  const primeros = valores.slice(0, max).join(', ');
  return valores.length > max ? `${primeros}, +${valores.length - max}` : primeros;
}

function leerViewBox(apertura: string): { x: number; y: number; w: number; h: number } | undefined {
  const m = /\bviewBox\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(apertura);
  if (m === null) return undefined;
  const p = (m[1] ?? m[2] ?? '').trim().split(/[\s,]+/).map(Number);
  if (p.length !== 4 || !p.every((n) => Number.isFinite(n))) return undefined;
  const [x, y, w, h] = p as [number, number, number, number];
  return w > 0 && h > 0 ? { x, y, w, h } : undefined;
}

function leerLongitud(apertura: string, attr: string): number | undefined {
  const m = new RegExp(`\\b${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(apertura);
  if (m === null) return undefined;
  const bruto = (m[1] ?? m[2] ?? '').trim();
  if (!/^\d+(?:\.\d+)?(?:px)?$/i.test(bruto)) return undefined;
  const n = Number.parseFloat(bruto);
  return n > 0 ? n : undefined;
}

/**
 * Textos cuyo origen cae fuera del lienzo.
 *
 * Solo se juzga el texto que **no** hereda ninguna transformacion: resolver una
 * cadena de `transform` es maquetar, y aqui no se maqueta. Los demas se cuentan
 * aparte y el informe los nombra, porque un recuento de cero hallazgos sobre
 * cien elementos sin mirar no significa que el dibujo este bien.
 */
function textosFuera(
  svg: string,
  vb: { x: number; y: number; w: number; h: number } | undefined,
): { recortados: string[]; sinMedir: number } {
  if (vb === undefined) return { recortados: [], sinMedir: 0 };
  const recortados: string[] = [];
  let sinMedir = 0;
  let profundidadTransformada = 0;
  let profundidad = 0;

  const etiquetas = svg.matchAll(/<(\/?)([a-zA-Z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(\/?)>/g);
  for (const m of etiquetas) {
    const cierre = m[1] === '/';
    const nombre = m[2]!.toLowerCase();
    const atributos = m[3] ?? '';
    const auto = m[4] === '/';

    if (nombre === 'g' || nombre === 'svg') {
      if (cierre) {
        profundidad -= 1;
        // Al salir del grupo que traia la transformacion se vuelve a poder
        // medir. Dejarlo en `profundidad` mantenia la marca puesta y todo lo
        // que viniera despues se contaba como «sin medir».
        if (profundidadTransformada > profundidad) profundidadTransformada = 0;
      } else if (!auto) {
        if (/\btransform\s*=/i.test(atributos) && profundidadTransformada === 0) {
          profundidadTransformada = profundidad + 1;
        }
        profundidad += 1;
      }
      continue;
    }

    // La etiqueta de cierre no es otro elemento: contarla duplicaba el recuento
    // de lo que quedo sin medir, y ese numero es justamente lo que se publica.
    if (nombre !== 'text' || cierre) continue;
    if (profundidadTransformada > 0 || /\btransform\s*=/i.test(atributos)) {
      sinMedir += 1;
      continue;
    }
    const x = numero(atributos, 'x');
    const y = numero(atributos, 'y');
    if (x === undefined || y === undefined) {
      sinMedir += 1;
      continue;
    }
    if (x < vb.x || x > vb.x + vb.w || y < vb.y || y > vb.y + vb.h) {
      recortados.push(`(${x}, ${y})`);
    }
  }
  return { recortados, sinMedir };
}

function numero(atributos: string, attr: string): number | undefined {
  const m = new RegExp(`\\b${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(atributos);
  if (m === null) return undefined;
  const n = Number.parseFloat((m[1] ?? m[2] ?? '').trim());
  return Number.isFinite(n) ? n : undefined;
}

/** Hallazgos que hacen fallar la compuerta. */
export function errores(result: LintResult): Hallazgo[] {
  return result.hallazgos.filter((h) => h.severidad === 'error');
}
