/**
 * Utilidades comunes de post-proceso de SVG.
 *
 * Todo SVG que sale de DocViz pasa por aqui para garantizar tres cosas:
 *   1. dimensiones explicitas (si no, `<img src="...svg">` se rompe o se recorta);
 *   2. un `<title>` accesible;
 *   3. sanitizacion: sin scripts ni manejadores de eventos (seccion 12.7).
 */

/**
 * Elementos que pueden aparecer en un SVG de DocViz.
 *
 * Es una lista de permitidos, no de prohibidos. La version anterior enumeraba
 * los manejadores de eventos conocidos y dejaba pasar todo lo demas: `onwheel`,
 * `ontoggle`, `<animate attributeName="href" to="javascript:...">` y media
 * docena mas de vectores sobrevivian. Con una lista de permitidos, lo que no
 * se ha pensado se cae por defecto en lugar de colarse.
 *
 * El contenido de la lista sale de medir que emiten de verdad los seis motores
 * sobre los 57 tipos del catalogo, mas el vocabulario SVG estandar que un
 * bloque nativo puede usar legitimamente. Una prueba comprueba que sanear los
 * 69 diagramas del catalogo no cambia ni un byte.
 */
const ALLOWED_ELEMENTS = new Set([
  // Estructura
  'svg', 'g', 'defs', 'symbol', 'use', 'switch', 'title', 'desc', 'style', 'a',
  // Formas
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  // Texto
  'text', 'tspan', 'textpath',
  // Pintura
  'marker', 'mask', 'clippath', 'pattern', 'lineargradient', 'radialgradient', 'stop',
  // Filtros (los que emiten los motores)
  'filter', 'fedropshadow', 'fegaussianblur', 'feoffset', 'feblend', 'feflood',
  'fecomposite', 'femerge', 'femergenode', 'fecolormatrix',
  // Etiquetas HTML dentro de foreignObject (Mermaid las usa)
  'foreignobject', 'div', 'span', 'p', 'br', 'b', 'i', 'em', 'strong', 'ul', 'ol', 'li',
]);

/**
 * Elementos que se eliminan con todo su contenido.
 *
 * Para el resto de elementos no permitidos se descarta solo la etiqueta y se
 * conservan los hijos: un elemento desconocido suele ser un envoltorio, y
 * tirarlo entero desfiguraria el dibujo. Estos no: su contenido *es* el peligro.
 */
const DROP_WITH_CONTENT = new Set([
  'script', 'iframe', 'object', 'embed', 'applet', 'handler', 'audio', 'video',
  'base', 'meta', 'link', 'noscript',
]);

/** Atributos admitidos por nombre exacto. */
const ALLOWED_ATTRS = new Set([
  // Identidad y estructura
  'id', 'class', 'xmlns', 'xmlns:xlink', 'version', 'viewbox', 'preserveaspectratio',
  'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
  'd', 'points', 'transform', 'transform-origin', 'overflow', 'display', 'visibility',
  // Pintura
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
  'stroke-miterlimit', 'opacity', 'color', 'style',
  // Texto
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline',
  'alignment-baseline', 'baseline-shift', 'letter-spacing', 'word-spacing', 'dx', 'dy',
  'textlength', 'lengthadjust', 'xml:space', 'lineheight', 'white-space',
  // Marcadores, mascaras, gradientes y filtros
  'marker-start', 'marker-mid', 'marker-end', 'markerwidth', 'markerheight', 'markerunits',
  'refx', 'refy', 'orient', 'offset', 'stop-color', 'stop-opacity', 'gradientunits',
  'gradienttransform', 'spreadmethod', 'maskunits', 'clippathunits', 'clip-path', 'clip-rule',
  'mask', 'filter', 'filterunits', 'stddeviation', 'flood-color', 'flood-opacity', 'result', 'in',
  'patternunits', 'pointer-events', 'shape-rendering', 'text-rendering', 'vector-effect',
  // Accesibilidad y trazabilidad
  'role', 'lang', 'xml:lang', 'requiredfeatures', 'requiredextensions', 'systemlanguage',
  // Enlaces (el valor se valida aparte)
  'href', 'xlink:href', 'target', 'xlink:title',
  // Metadatos que emiten los motores: `type` en `<style>`, el resto de PlantUML
  // y del SVG estandar. Sin ellos el dibujo cambia, asi que estan medidos, no
  // supuestos: salen de sanear los 69 diagramas del catalogo y ver que faltaba.
  'type', 'contentstyletype', 'zoomandpan', 'codeline',
]);

/** Prefijos de atributo admitidos en bloque. */
const ALLOWED_ATTR_PREFIXES = ['data-', 'aria-'];

/** Esquemas de URL que no pueden aparecer en ningun atributo de enlace. */
const PELIGROSO_EN_URL = /^(?:javascript|vbscript|data|file|blob):/i;

/**
 * Busca el fin de una etiqueta respetando las comillas.
 *
 * Un `>` dentro del valor de un atributo no cierra nada; cortar ahi es como se
 * cuela la mitad de los saneadores basados en expresiones regulares.
 */
function findTagEnd(svg: string, start: number): number {
  let quote: string | undefined;
  for (let i = start + 1; i < svg.length; i += 1) {
    const c = svg[i]!;
    if (quote !== undefined) {
      if (c === quote) quote = undefined;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '>') return i;
  }
  return svg.length - 1;
}

interface ParsedTag {
  /** Nombre en minusculas, solo para buscar en las listas. */
  name: string;
  /**
   * Nombre tal cual venia.
   *
   * SVG es XML y distingue mayusculas: `foreignObject`, `linearGradient` o
   * `viewBox` en minusculas dejan de significar nada, y el navegador deja de
   * escalar el dibujo sin avisar de nada.
   */
  raw: string;
  closing: boolean;
  selfClosing: boolean;
  attrs: Array<{ name: string; raw: string; value?: string; quote: string }>;
}

/** Analiza una etiqueta ya delimitada, respetando comillas. */
function parseTag(raw: string): ParsedTag | undefined {
  const m = /^<\s*(\/?)\s*([a-zA-Z][\w:.-]*)/.exec(raw);
  if (m === null) return undefined;
  const closing = m[1] === '/';
  const nombreBruto = m[2]!;
  const selfClosing = /\/\s*>$/.test(raw);

  const attrs: ParsedTag['attrs'] = [];
  const attrRe = /([:\w.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  attrRe.lastIndex = m[0].length;
  let a: RegExpExecArray | null;
  while ((a = attrRe.exec(raw)) !== null) {
    const bruto = a[1]!;
    if (bruto === '/' || bruto === '') continue;
    const valor = a[2] ?? a[3] ?? a[4];
    const quote = a[3] !== undefined ? "'" : '"';
    attrs.push({ name: bruto.toLowerCase(), raw: bruto, ...(valor !== undefined ? { value: valor } : {}), quote });
  }
  return { name: nombreBruto.toLowerCase(), raw: nombreBruto, closing, selfClosing, attrs };
}

/** Resuelve entidades numericas y con nombre para poder ver el esquema real. */
function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_m, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&(?:amp|colon|tab|newline|NewLine);?/gi, (m2) => (/amp/i.test(m2) ? '&' : /colon/i.test(m2) ? ':' : ''));
}

/** Un enlace solo puede apuntar a un fragmento, a una ruta relativa o a http(s). */
function urlSegura(valor: string): boolean {
  const limpio = decodeEntities(valor).replace(/[\s\u0000-\u001f]/g, '');
  if (limpio === '') return true;
  if (PELIGROSO_EN_URL.test(limpio)) return false;
  // Cualquier otro esquema explicito tampoco: no hay motivo para que un
  // diagrama abra `tel:`, `ms-msdt:` ni nada por el estilo.
  if (/^[a-z][a-z0-9+.-]*:/i.test(limpio)) return /^https?:/i.test(limpio);
  return true;
}

/**
 * CSS sin importaciones remotas ni URLs ejecutables.
 *
 * Vale tanto para el atributo `style` como para el contenido de un elemento
 * `<style>`, que es CSS de verdad y por tanto puede traerse una hoja entera de
 * otro sitio con `@import`.
 */
function estiloSeguro(valor: string): string {
  return decodeEntities(valor)
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\(/gi, 'void(')
    .replace(/behavior\s*:[^;]*;?/gi, '')
    .replace(/url\(\s*['"]?\s*(?:javascript|vbscript|data|file|blob):[^)]*\)/gi, 'none');
}

/** Escapa `<` y `>` dentro del valor de un atributo. */
function valorSeguro(valor: string): string {
  return valor.includes('<') || valor.includes('>')
    ? valor.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    : valor;
}

function attrPermitido(nombre: string): boolean {
  if (nombre.startsWith('on')) return false;
  if (ALLOWED_ATTRS.has(nombre)) return true;
  return ALLOWED_ATTR_PREFIXES.some((p) => nombre.startsWith(p));
}

const URL_ATTRS = new Set(['href', 'xlink:href', 'src', 'xlink:href']);

/** Reconstruye una etiqueta permitida quedandose solo con lo que puede llevar. */
/**
 * Reconstruye una etiqueta permitida quedandose solo con lo que puede llevar.
 *
 * Si no hubo nada que quitar devuelve la etiqueta **tal cual venia**. Reescribir
 * cada etiqueta cambiaria los bytes de todos los diagramas —espacios, comillas,
 * orden— e invalidaria el cache entero sin que el dibujo cambie en nada.
 */
function rebuildTag(tag: ParsedTag, bruto: string): string {
  if (tag.closing) return bruto;
  const partes: string[] = [tag.raw];
  let intacta = true;
  for (const attr of tag.attrs) {
    if (!attrPermitido(attr.name)) {
      intacta = false;
      continue;
    }
    if (attr.value === undefined) {
      partes.push(attr.raw);
      continue;
    }
    if (URL_ATTRS.has(attr.name) && !urlSegura(attr.value)) {
      intacta = false;
      continue;
    }
    // Un `<` literal dentro de un atributo no es XML valido, y es lo que
    // permite que un procesador posterior menos cuidadoso lo lea como etiqueta.
    const limpio = valorSeguro(attr.name === 'style' ? estiloSeguro(attr.value) : attr.value);
    if (limpio !== attr.value) intacta = false;
    partes.push(`${attr.raw}=${attr.quote}${limpio}${attr.quote}`);
  }
  if (intacta) return bruto;
  return `<${partes.join(' ')}${tag.selfClosing ? '/' : ''}>`;
}

/**
 * Deja el SVG con solo los elementos y atributos permitidos.
 *
 * No intenta reparar un SVG mal formado: recorre las etiquetas respetando las
 * comillas, y lo que no reconoce lo descarta.
 */
export function sanitizeSvg(svg: string): string {
  const out: string[] = [];
  let i = 0;
  let saltandoHasta: string | undefined;
  let dentroDeStyle = false;

  while (i < svg.length) {
    const abre = svg.indexOf('<', i);
    if (abre === -1) {
      if (saltandoHasta === undefined) out.push(dentroDeStyle ? estiloSeguro(svg.slice(i)) : svg.slice(i));
      break;
    }
    if (saltandoHasta === undefined) {
      const texto = svg.slice(i, abre);
      out.push(dentroDeStyle ? estiloSeguro(texto) : texto);
    }

    // Los comentarios se eliminan. No ejecutan nada por si mismos, pero un
    // comentario mal cerrado es la via clasica de mXSS cuando el SVG se
    // incrusta dentro de un HTML, y no aportan nada al dibujo.
    if (svg.startsWith('<!--', abre)) {
      const fin = svg.indexOf('-->', abre);
      i = fin === -1 ? svg.length : fin + 3;
      continue;
    }
    if (svg.startsWith('<?', abre) || svg.startsWith('<!', abre)) {
      const fin = svg.indexOf('>', abre);
      const bruto = svg.slice(abre, fin === -1 ? svg.length : fin + 1);
      if (saltandoHasta === undefined) out.push(bruto);
      i = fin === -1 ? svg.length : fin + 1;
      continue;
    }

    const cierre = findTagEnd(svg, abre);
    const bruto = svg.slice(abre, cierre + 1);
    const tag = parseTag(bruto);
    i = cierre + 1;

    if (tag === undefined) continue;

    if (saltandoHasta !== undefined) {
      if (tag.closing && tag.name === saltandoHasta) saltandoHasta = undefined;
      continue;
    }

    if (DROP_WITH_CONTENT.has(tag.name)) {
      if (!tag.closing && !tag.selfClosing) saltandoHasta = tag.name;
      continue;
    }
    if (!ALLOWED_ELEMENTS.has(tag.name)) continue;

    if (tag.name === 'style' && !tag.selfClosing) dentroDeStyle = !tag.closing;
    out.push(rebuildTag(tag, bruto));
  }

  return out.join('');
}

interface SvgOpenTag {
  raw: string;
  index: number;
  attrs: Record<string, string>;
}

function parseOpenSvgTag(svg: string): SvgOpenTag | undefined {
  const match = /<svg\b[^>]*>/i.exec(svg);
  if (match === null) return undefined;
  const raw = match[0];
  const attrs: Record<string, string> = {};
  const attrRe = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(raw)) !== null) {
    attrs[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? '';
  }
  return { raw, index: match.index, attrs };
}

function setAttr(tag: string, name: string, value: string): string {
  const re = new RegExp(`(\\s${name}\\s*=\\s*)(?:"[^"]*"|'[^']*')`, 'i');
  if (re.test(tag)) return tag.replace(re, `$1"${value}"`);
  return tag.replace(/^<svg\b/i, `<svg ${name}="${value}"`);
}

/**
 * Longitud absoluta en pixeles, o `undefined` si no lo es.
 *
 * Es deliberadamente estricto: `parseFloat("100%")` devuelve 100, y aceptarlo
 * dejaria los diagramas de Mermaid (que emite `width="100%"`) a 100 px de ancho.
 */
function toPx(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const match = /^\s*(\d+(?:\.\d+)?)(px)?\s*$/i.exec(value);
  if (match === null) return undefined;
  const n = Number.parseFloat(match[1]!);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Garantiza `width`, `height` y `viewBox` numericos en el elemento raiz.
 *
 * Mermaid emite `width="100%"` sin `height`, lo que en un visor Markdown
 * produce una imagen de altura cero. Aqui se deriva el tamano real del
 * `viewBox` y se fija en pixeles.
 */
export function normalizeSvgDimensions(svg: string): string {
  const tag = parseOpenSvgTag(svg);
  if (tag === undefined) return svg;

  const viewBox = tag.attrs['viewbox'];
  let width = toPx(tag.attrs['width']);
  let height = toPx(tag.attrs['height']);

  let vb: number[] | undefined;
  if (viewBox !== undefined) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) vb = parts;
  }

  if (vb !== undefined) {
    if (width === undefined) width = vb[2];
    if (height === undefined) height = vb[3];
    const ratio = vb[3]! / vb[2]!;
    // Si solo una dimension era porcentual, se recalcula la otra por proporcion.
    if (toPx(tag.attrs['width']) === undefined && height !== undefined && ratio > 0) {
      width = Math.round(height / ratio);
    }
    if (toPx(tag.attrs['height']) === undefined && width !== undefined) {
      height = Math.round(width * ratio);
    }
  }

  if (width === undefined || height === undefined) return svg;

  let newTag = setAttr(tag.raw, 'width', String(Math.round(width)));
  newTag = setAttr(newTag, 'height', String(Math.round(height)));
  if (vb === undefined) {
    newTag = setAttr(newTag, 'viewBox', `0 0 ${Math.round(width)} ${Math.round(height)}`);
  }
  // `preserveAspectRatio="none"` (PlantUML) deforma el diagrama al escalarlo.
  newTag = newTag.replace(/\spreserveAspectRatio\s*=\s*(["'])none\1/i, '');

  return svg.slice(0, tag.index) + newTag + svg.slice(tag.index + tag.raw.length);
}

/**
 * Renumera los identificadores internos del SVG en orden de aparicion.
 *
 * Vega mantiene un contador global de `clipPath` por proceso: el mismo grafico
 * renderizado dos veces produce `clip1` y luego `clip2`, es decir bytes
 * distintos para la misma entrada. Eso rompe el determinismo que exige el
 * modelo de cache, asi que los ids se normalizan aqui para todos los motores.
 *
 * Se reescribe tanto el atributo `id` como toda referencia `#id`: Mermaid
 * incrusta una hoja de estilos cuyos selectores estan acotados por el id del
 * elemento raiz (`#mi-id .task { ... }`). Renombrar solo el atributo dejaria
 * esos selectores sin destino y el diagrama saldria sin estilos, con los
 * rectangulos en negro.
 */
export function stabilizeSvgIds(svg: string, prefix = 'dv'): string {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of svg.matchAll(/\bid="([^"]+)"/g)) {
    const id = match[1]!;
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  if (ids.length === 0) return svg;

  const mapping = new Map<string, string>();
  ids.forEach((id, index) => mapping.set(id, `${prefix}${index + 1}`));

  // Se reemplaza de los ids mas largos a los mas cortos para que un id que sea
  // prefijo de otro no corrompa el reemplazo.
  const ordered = [...mapping.entries()].sort((a, b) => b[0].length - a[0].length);
  let out = svg;
  for (const [from, to] of ordered) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\bid="${escaped}"`, 'g'), `id="${to}"`);
    // `#id` como token completo: cubre selectores CSS, `url(#id)` y `href="#id"`.
    // El limite posterior evita que un id que sea prefijo de otro se corrompa.
    out = out.replace(new RegExp(`#${escaped}(?![\\w-])`, 'g'), `#${to}`);
  }
  return out;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Inserta `<title>` como primer hijo del `<svg>` si aun no existe uno. */
export function injectTitle(svg: string, title: string | undefined): string {
  if (title === undefined || title.trim() === '') return svg;
  const tag = parseOpenSvgTag(svg);
  if (tag === undefined) return svg;
  const after = tag.index + tag.raw.length;
  const rest = svg.slice(after);
  if (/^\s*<title\b/i.test(rest)) return svg;
  return `${svg.slice(0, after)}<title>${escapeXml(title)}</title>${rest}`;
}

/** Asegura que exista la declaracion de namespace SVG. */
export function ensureNamespace(svg: string): string {
  const tag = parseOpenSvgTag(svg);
  if (tag === undefined) return svg;
  if (tag.attrs['xmlns'] !== undefined) return svg;
  const newTag = tag.raw.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return svg.slice(0, tag.index) + newTag + svg.slice(tag.index + tag.raw.length);
}

/** Pipeline completo aplicado a todo SVG antes de escribirlo a disco. */
export function finalizeSvg(svg: string, title?: string): string {
  let out = svg.replace(/^﻿/, '').trim();
  // PlantUML antepone un PI propio (`<?plantuml ...?>`) que confunde a algunos visores.
  out = out.replace(/^<\?plantuml[^>]*\?>/i, '');
  out = sanitizeSvg(out);
  out = stabilizeSvgIds(out);
  out = ensureNamespace(out);
  out = normalizeSvgDimensions(out);
  out = injectTitle(out, title);
  if (!/^<\?xml/i.test(out)) {
    out = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n${out}`;
  }
  return `${out}\n`;
}
