/**
 * Conjunto de iconos del proyecto.
 *
 * Los logos de marca **no viajan en el paquete**. La licencia de una coleccion
 * de logos resuelve el copyright del archivo, no el uso de la marca: el propio
 * texto de CC0 dice que no cede derechos de marca y que quien dona no responde
 * de los derechos de terceros. Asi que se traen con `docviz icons`, una vez y
 * a peticion, igual que `docviz setup` trae el jar de PlantUML.
 *
 * Lo que si viaja son los pictogramas genericos de `assets/icons`, que son de
 * Lucide y estan bajo ISC: una licencia que si permite redistribuirlos, y un
 * dibujo abstracto no es la marca de nadie.
 *
 * El dibujo no se inyecta como `<image>` ni como data URI: ninguno de los dos
 * sobrevive al saneador —`image` no esta en la lista de elementos permitidos y
 * `data:` no es un esquema admitido— y base64 ocupa un 33 % mas. Se inyecta
 * como un `<svg>` anidado, que pasa intacto.
 */

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { DocVizError, ERROR_CODES } from './errors.js';

/**
 * Direccion que D2 recibe en lugar del dibujo.
 *
 * D2 sabe reservar y situar el hueco de un `icon:`, pero solo acepta una URL.
 * Se le da una que **no resuelve a proposito** —el dominio `.invalid` esta
 * reservado por el RFC 2606 para esto— y DocViz la sustituye despues por el
 * dibujo. Asi el trazado lo sigue haciendo el motor y el SVG que sale no
 * contiene ninguna referencia a la red.
 */
export const SENTINELA = 'https://docviz.invalid/icon/';

/** Nombre admisible: se convierte en nombre de archivo, asi que se acota. */
const NOMBRE_RE = /^[a-z0-9][a-z0-9_-]*$/;

export function nombreDeIconoValido(nombre: string): boolean {
  return NOMBRE_RE.test(nombre) && nombre.length <= 64;
}

export interface IconoResuelto {
  nombre: string;
  /** `viewBox` propio del dibujo, que es lo que permite reescalarlo sin deformarlo. */
  viewBox: string;
  /** Contenido interior del SVG, sin su etiqueta raiz. */
  contenido: string;
  /**
   * Atributos de pintura que estaban en la etiqueta raiz y heredan los hijos.
   *
   * Sin esto un icono de trazo sale como una mancha negra: Lucide declara
   * `fill="none" stroke="currentColor"` **en la raiz**, y quedarse solo con el
   * interior deja los trazos con el relleno por defecto, que es negro. No se
   * ve en ninguna comprobacion de texto; se ve mirando el dibujo.
   */
  pintura: string;
  /** De donde salio, para poder acreditarlo. */
  fuente: string;
}

export interface ConjuntoIconos {
  resolver(nombre: string): IconoResuelto | undefined;
  /** Huella de los iconos que **esta** fuente nombra, o undefined si no nombra ninguno. */
  huellaDeFuente(source: string): string | undefined;
  nombres(): readonly string[];
  /** Huella del conjunto: entra en el hash para que cambiar un logo invalide el recurso. */
  huella(): string;
}

interface EntradaManifiesto {
  file?: unknown;
  source?: unknown;
}

const NOMBRE_EN_FUENTE = new RegExp(`${SENTINELA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([a-z0-9_-]+)`, 'g');

class Conjunto implements ConjuntoIconos {
  private readonly mapa: Map<string, IconoResuelto & { bytes: string }>;
  private readonly fingerprint: string;

  constructor(entradas: readonly (IconoResuelto & { bytes: string })[]) {
    this.mapa = new Map(entradas.map((e) => [e.nombre, e]));
    const h = createHash('sha256');
    for (const e of [...entradas].sort((a, b) => (a.nombre < b.nombre ? -1 : 1))) {
      h.update(`${e.nombre}\u0000${e.bytes}\u0000`);
    }
    this.fingerprint = entradas.length === 0 ? 'sin-iconos' : h.digest('hex').slice(0, 16);
  }

  resolver(nombre: string): IconoResuelto | undefined {
    return this.mapa.get(nombre);
  }

  /**
   * Solo los iconos que la fuente nombra entran en el hash.
   *
   * Si entrara el conjunto entero, instalar un icono que nadie usa invalidaria
   * el cache de todas las figuras del proyecto. Y si no entrara ninguno, cambiar
   * el archivo de un logo dejaria servido el dibujo viejo para siempre, que es
   * exactamente el fallo que obligo a inventar PIPELINE_VERSION.
   */
  huellaDeFuente(source: string): string | undefined {
    const nombres = new Set<string>();
    for (const m of source.matchAll(NOMBRE_EN_FUENTE)) {
      const nombre = m[1];
      if (nombre !== undefined) nombres.add(nombre);
    }
    if (nombres.size === 0) return undefined;
    const h = createHash('sha256');
    for (const nombre of [...nombres].sort()) {
      h.update(`${nombre}\u0000${this.mapa.get(nombre)?.bytes ?? 'ausente'}\u0000`);
    }
    return h.digest('hex').slice(0, 16);
  }

  nombres(): readonly string[] {
    return [...this.mapa.keys()].sort();
  }

  huella(): string {
    return this.fingerprint;
  }
}

/** Conjunto sin ningun icono: lo que hay antes de ejecutar `docviz icons`. */
export function conjuntoVacio(): ConjuntoIconos {
  return new Conjunto([]);
}

/**
 * Parte un SVG en su `viewBox` y su contenido interior.
 *
 * Sin `viewBox` no se puede reescalar: se construye uno desde `width`/`height`
 * si los trae, y si no se rechaza en lugar de dibujarlo a un tamano cualquiera.
 */
const PINTURA_HEREDABLE = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'fill-rule',
  'clip-rule',
  'color',
  'opacity',
];

export function partirSvg(
  svg: string,
  nombre: string,
): { viewBox: string; contenido: string; pintura: string } {
  const apertura = /<svg\b([^>]*)>/i.exec(svg);
  if (apertura === null) {
    throw new DocVizError(
      `el icono "${nombre}" no contiene un elemento <svg>`,
      {},
      undefined,
      ERROR_CODES.CONFIG,
    );
  }
  const atributos = apertura[1] ?? '';
  const vb = /viewBox\s*=\s*["']([^"']+)["']/i.exec(atributos)?.[1]?.trim();
  const w = /\bwidth\s*=\s*["']?([\d.]+)/i.exec(atributos)?.[1];
  const h = /\bheight\s*=\s*["']?([\d.]+)/i.exec(atributos)?.[1];
  const viewBox = vb ?? (w !== undefined && h !== undefined ? `0 0 ${w} ${h}` : undefined);
  if (viewBox === undefined) {
    throw new DocVizError(
      `el icono "${nombre}" no declara viewBox ni width/height, asi que no se puede reescalar sin deformarlo`,
      {},
      undefined,
      ERROR_CODES.CONFIG,
    );
  }
  const pintura = PINTURA_HEREDABLE.flatMap((nombreAttr) => {
    const m = new RegExp(`\\b${nombreAttr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(atributos);
    const valor = m?.[1] ?? m?.[2];
    return valor === undefined ? [] : [`${nombreAttr}="${valor}"`];
  }).join(' ');

  const cierre = svg.lastIndexOf('</svg>');
  const interior = svg.slice(apertura.index + apertura[0].length, cierre === -1 ? undefined : cierre);
  return { viewBox, contenido: interior.trim(), pintura };
}

/**
 * Carga los iconos de uno o varios directorios.
 *
 * El ultimo gana: los del proyecto pueden sustituir a los que trae el paquete,
 * que es lo que permite a una organizacion poner su propia marca sin tocar el
 * codigo.
 */
export async function cargarIconos(directorios: readonly string[]): Promise<ConjuntoIconos> {
  const entradas = new Map<string, IconoResuelto & { bytes: string }>();
  for (const dir of directorios) {
    for (const [nombre, entrada] of await leerDirectorio(dir)) entradas.set(nombre, entrada);
  }
  return new Conjunto([...entradas.values()]);
}

async function leerDirectorio(dir: string): Promise<Map<string, IconoResuelto & { bytes: string }>> {
  const salida = new Map<string, IconoResuelto & { bytes: string }>();
  let archivos: string[];
  try {
    archivos = await readdir(dir);
  } catch {
    return salida; // un directorio que no existe no es un error: es que no hay iconos
  }
  const fuentes = await leerManifiesto(dir);
  for (const archivo of archivos.sort()) {
    if (!archivo.toLowerCase().endsWith('.svg')) continue;
    const nombre = archivo.slice(0, -4);
    if (!nombreDeIconoValido(nombre)) continue;
    const bytes = await readFile(path.join(dir, archivo), 'utf8');
    const { viewBox, contenido, pintura } = partirSvg(bytes, nombre);
    salida.set(nombre, {
      nombre,
      viewBox,
      contenido,
      pintura,
      fuente: fuentes.get(nombre) ?? 'local',
      bytes,
    });
  }
  return salida;
}

async function leerManifiesto(dir: string): Promise<Map<string, string>> {
  const fuentes = new Map<string, string>();
  try {
    const bruto = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8')) as {
      icons?: Record<string, EntradaManifiesto>;
    };
    for (const [nombre, entrada] of Object.entries(bruto.icons ?? {})) {
      if (typeof entrada?.source === 'string') fuentes.set(nombre, entrada.source);
    }
  } catch {
    // Sin manifiesto los iconos siguen sirviendo; lo unico que se pierde es
    // poder acreditar de donde salio cada uno.
  }
  return fuentes;
}
