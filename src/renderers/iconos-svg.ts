/**
 * Sustitucion del hueco del icono por el dibujo.
 *
 * El motor reserva y situa el hueco: a D2 se le pasa `icon:` con una URL
 * sentinela que no resuelve, y emite un `<image>` ya colocado con su `x`, `y`,
 * `width` y `height`. Aqui se cambia ese `<image>` por un `<svg>` anidado con
 * el dibujo dentro. Ventajas de hacerlo asi y no de otra forma:
 *
 * - El trazado lo sigue haciendo el motor. DocViz no calcula coordenadas.
 * - El SVG que sale **no referencia la red**: la regla `referencia-remota` lo
 *   exige, y un `<image href="https://...">` la incumpliria.
 * - Un `<svg>` anidado pasa el saneador intacto; `<image>` se elimina —no esta
 *   en la lista de elementos permitidos— y `data:` no es un esquema admitido.
 *   Ademas inline ocupa un 33 % menos que el mismo dibujo en base64.
 *
 * La sustitucion ocurre **antes** de sanear, a proposito: el contenido de un
 * logo es un archivo de un tercero, y asi pasa por la misma lista de permitidos
 * que todo lo demas en lugar de entrar por detras.
 */

import { DocVizError, ERROR_CODES } from '../core/errors.js';
import { SENTINELA, type ConjuntoIconos } from '../core/iconos.js';

/** `<image>` con la URL sentinela, con sus atributos de geometria. */
const HUECO_RE = /<image\b([^>]*?)\/?>/gi;

function atributo(atributos: string, nombre: string): string | undefined {
  const re = new RegExp(`\\b${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const m = re.exec(atributos);
  return m?.[1] ?? m?.[2];
}

/**
 * Prefija los ids del dibujo y sus referencias.
 *
 * Dos logos en la misma figura traen ids iguales —`a`, `clip0`, `paint0`— y el
 * segundo se queda sin su degradado o sin su recorte. `dedupeSvgIds` renombra
 * duplicados pero no toca las referencias, que es justo lo que hace falta aqui.
 */
function prefijarIds(contenido: string, prefijo: string): string {
  const ids = new Set<string>();
  for (const m of contenido.matchAll(/(?<![\w-])id\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const valor = m[1] ?? m[2];
    if (valor !== undefined && valor !== '') ids.add(valor);
  }
  if (ids.size === 0) return contenido;
  let salida = contenido;
  for (const id of ids) {
    const escapado = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nuevo = `${prefijo}${id}`;
    salida = salida
      .replace(new RegExp(`((?<![\\w-])id\\s*=\\s*["'])${escapado}(["'])`, 'g'), `$1${nuevo}$2`)
      .replace(new RegExp(`url\\(\\s*#${escapado}\\s*\\)`, 'g'), `url(#${nuevo})`)
      .replace(new RegExp(`((?:xlink:)?href\\s*=\\s*["'])#${escapado}(["'])`, 'g'), `$1#${nuevo}$2`);
  }
  return salida;
}

export interface InyeccionResultado {
  svg: string;
  /** Nombres sustituidos, en orden de aparicion y sin repetir. */
  usados: readonly string[];
}

/**
 * Cambia cada hueco por su dibujo.
 *
 * Un nombre que el conjunto no tiene **falla**: dejarlo pasar dibujaria un
 * diagrama con un hueco, y un hueco no se ve revisando el Markdown.
 */
export interface Tinte {
  /** Tinta del tema en claro. */
  claro: string;
  /** Tinta del tema en oscuro. */
  oscuro: string;
}

export function inyectarIconos(
  svg: string,
  iconos: ConjuntoIconos,
  prefijo = 'dv',
  tinte?: Tinte,
): InyeccionResultado {
  if (!svg.includes(SENTINELA)) return { svg, usados: [] };

  const usados: string[] = [];
  const faltan = new Set<string>();
  let contador = 0;
  let tintados = 0;
  const variable = `--${prefijo}-ico`;

  const salida = svg.replace(HUECO_RE, (bruto, atributos: string) => {
    const href = atributo(atributos, 'href') ?? atributo(atributos, 'xlink:href');
    if (href === undefined || !href.startsWith(SENTINELA)) return bruto;
    const nombre = href.slice(SENTINELA.length);

    const icono = iconos.resolver(nombre);
    if (icono === undefined) {
      faltan.add(nombre);
      return bruto;
    }
    if (!usados.includes(nombre)) usados.push(nombre);

    const x = atributo(atributos, 'x') ?? '0';
    const y = atributo(atributos, 'y') ?? '0';
    const w = atributo(atributos, 'width') ?? '0';
    const h = atributo(atributos, 'height') ?? '0';

    contador += 1;
    const contenido = prefijarIds(
      // El `<title>` del logo no aporta: la figura ya tiene su nombre accesible
      // y el nodo su etiqueta de texto. El icono es decoracion de esa etiqueta.
      icono.contenido.replace(/<(title|desc)\b[^>]*>[\s\S]*?<\/\1>/gi, ''),
      `${prefijo}i${contador}`,
    );

    // Un pictograma generico se dibuja con `currentColor` a proposito: no es
    // la marca de nadie, asi que toma la tinta del tema y se lee igual en claro
    // y en oscuro. Un logo de marca no lleva `currentColor` y no se tine: eso
    // es lo que no hay que hacerle nunca a una marca.
    // `currentColor` suele venir en la etiqueta raiz del icono, no en su
    // interior: hay que mirar las dos partes o la tinta no se aplica nunca.
    const usaTinta = contenido.includes('currentColor') || icono.pintura.includes('currentColor');
    if (usaTinta && tinte !== undefined) tintados += 1;
    const tinta =
      tinte !== undefined && usaTinta ? ` color="var(${variable},${tinte.claro})"` : '';

    // `preserveAspectRatio` nunca es `none`: deformar el logo de una marca
    // incumple los terminos de uso de varias —Azure lo prohibe por escrito— y
    // ademas se nota a simple vista.
    return (
      `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${icono.viewBox}"` +
      ` preserveAspectRatio="xMidYMid meet" aria-hidden="true" data-dv-icon="${nombre}"${tinta}` +
      `${icono.pintura === '' ? '' : ` ${icono.pintura}`}>` +
      `${contenido}</svg>`
    );
  });

  if (faltan.size > 0) {
    const disponibles = iconos.nombres();
    const faltantes = [...faltan].sort();
    const pista =
      `traelo con \`docviz icons ${faltantes.join(' ')}\`` +
      (disponibles.length === 0
        ? '; ahora mismo no hay ninguno instalado'
        : `; instalados: ${disponibles.slice(0, 12).join(', ')}${disponibles.length > 12 ? ', ...' : ''}`);
    throw new DocVizError(
      `icono desconocido: ${faltantes.join(', ')}`,
      {},
      pista,
      ERROR_CODES.ICONO_DESCONOCIDO,
    );
  }

  if (tintados === 0 || tinte === undefined) return { svg: salida, usados };

  // La tinta se declara como variable propia de **esta** figura y con su
  // contraparte oscura. No se puede delegar en `applyColorScheme`: ese paso se
  // retira en cuanto el SVG ya trae un `prefers-color-scheme`, que es el caso
  // de todo lo que dibuja D2. Sin esto el pictograma se queda con la tinta
  // clara sobre fondo oscuro, es decir, invisible.
  const estilo =
    `<style>#${prefijo}{${variable}:${tinte.claro}}` +
    `@media (prefers-color-scheme:dark){#${prefijo}{${variable}:${tinte.oscuro}}}</style>`;
  const cierre = salida.lastIndexOf('</svg>');
  const conEstilo =
    cierre === -1 ? salida : `${salida.slice(0, cierre)}${estilo}${salida.slice(cierre)}`;
  return { svg: conEstilo, usados };
}
