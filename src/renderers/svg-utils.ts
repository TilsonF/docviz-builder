/**
 * Utilidades comunes de post-proceso de SVG.
 *
 * Todo SVG que sale de DocViz pasa por aqui para garantizar tres cosas:
 *   1. dimensiones explicitas (si no, `<img src="...svg">` se rompe o se recorta);
 *   2. un `<title>` accesible;
 *   3. sanitizacion: sin scripts ni manejadores de eventos (seccion 12.7).
 */

const SCRIPT_TAG = /<script\b[\s\S]*?<\/script\s*>/gi;
const SELF_CLOSING_SCRIPT = /<script\b[^>]*\/>/gi;
const FOREIGN_OBJECT_SCRIPT = /\son(?:abort|blur|click|error|focus|load|mouse[a-z]+|key[a-z]+|begin|end|repeat|activate|focusin|focusout|unload|resize|scroll|zoom)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URL = /(\b(?:href|xlink:href)\s*=\s*)(["'])\s*javascript:[^"']*\2/gi;

/** Elimina scripts, manejadores inline y URLs `javascript:` del SVG. */
export function sanitizeSvg(svg: string): string {
  return svg
    .replace(SCRIPT_TAG, '')
    .replace(SELF_CLOSING_SCRIPT, '')
    .replace(FOREIGN_OBJECT_SCRIPT, '')
    .replace(JS_URL, '$1$2#$2');
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
