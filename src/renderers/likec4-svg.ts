/**
 * Emisor SVG propio para vistas LikeC4.
 *
 * LikeC4 calcula el layout (posiciones, tamanos y curvas Bezier de cada
 * relacion) mediante Graphviz; lo que no ofrece es un dibujado a SVG sin
 * navegador. Este modulo toma la vista ya distribuida y la dibuja, de forma que
 * el renderer LikeC4 sea tan offline como los demas y respete el tema del
 * proyecto.
 */

import type { Theme } from '../themes/types.js';
import { escapeXml } from './svg-utils.js';

export interface LikeC4Point {
  0: number;
  1: number;
}

export interface LikeC4Node {
  id: string;
  parent: string | null;
  level: number;
  children: string[];
  title: string;
  description?: string | { txt?: string } | null;
  technology?: string | null;
  shape?: string;
  color?: string;
  kind?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style?: { opacity?: number; size?: string; border?: string };
}

export interface LikeC4Edge {
  id: string;
  source: string;
  target: string;
  label?: string | null;
  points: Array<[number, number]>;
  labelBBox?: { x: number; y: number; width: number; height: number } | null;
  color?: string;
  line?: 'solid' | 'dashed' | 'dotted' | string;
  head?: string;
  tail?: string;
}

export interface LikeC4View {
  id: string;
  title?: string | null;
  description?: unknown;
  bounds: { x: number; y: number; width: number; height: number };
  nodes: LikeC4Node[];
  edges: LikeC4Edge[];
}

const PADDING = 24;
const TITLE_SIZE = 15;
const BODY_SIZE = 11.5;
const TECH_SIZE = 10.5;
const LINE_GAP = 1.35;

/** Ancho medio de caracter respecto al tamano de fuente, para el ajuste de linea. */
const CHAR_RATIO = 0.55;

export function renderLikeC4View(view: LikeC4View, theme: Theme): string {
  const { bounds } = view;
  const width = Math.max(1, Math.round(bounds.width)) + PADDING * 2;
  const height = Math.max(1, Math.round(bounds.height)) + PADDING * 2;
  const offsetX = PADDING - bounds.x;
  const offsetY = PADDING - bounds.y;

  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  // Los contenedores se pintan primero para que las hojas queden por encima.
  const ordered = [...view.nodes].sort((a, b) => a.level - b.level || b.children.length - a.children.length);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
  );
  parts.push(defs(theme));
  parts.push(`<rect width="${width}" height="${height}" fill="${theme.likec4.background}"/>`);
  parts.push(`<g transform="translate(${round(offsetX)},${round(offsetY)})">`);

  for (const node of ordered) parts.push(renderNode(node, theme));
  for (const edge of view.edges) parts.push(renderEdge(edge, theme, byId));

  parts.push('</g>');
  parts.push('</svg>');
  return parts.join('\n');
}

function defs(theme: Theme): string {
  const stroke = theme.likec4.edgeStroke;
  return [
    '<defs>',
    `<marker id="lc4-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${stroke}"/></marker>`,
    `<marker id="lc4-arrow-open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M 0 0 L 10 5 L 0 10" fill="none" stroke="${stroke}" stroke-width="1.6"/></marker>`,
    `<marker id="lc4-diamond" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M 0 6 L 6 1 L 12 6 L 6 11 z" fill="${stroke}"/></marker>`,
    `<marker id="lc4-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto" markerUnits="userSpaceOnUse"><circle cx="5" cy="5" r="4" fill="${stroke}"/></marker>`,
    `<filter id="lc4-shadow" x="-10%" y="-10%" width="130%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-opacity="0.18"/></filter>`,
    '</defs>',
  ].join('\n');
}

// --------------------------------------------------------------------------
// Nodos
// --------------------------------------------------------------------------

function renderNode(node: LikeC4Node, theme: Theme): string {
  const isGroup = node.children.length > 0;
  const baseFill = isGroup
    ? theme.likec4.groupFill
    : (theme.likec4.nodeFill[node.color ?? 'primary'] ?? theme.palette.primary);
  const stroke = isGroup
    ? theme.likec4.groupStroke
    : (theme.likec4.nodeStroke[node.color ?? 'primary'] ?? theme.palette.primary);

  // LikeC4 expresa la transparencia del relleno en `style.opacity` (0-100).
  // Se compone contra el fondo aqui, en lugar de emitir `fill-opacity`, porque
  // el color del texto debe elegirse contra el color que se vera de verdad: un
  // azul oscuro al 15% es un azul claro, y encima de el el texto blanco no se
  // lee.
  const opacity = node.style?.opacity !== undefined ? clamp(node.style.opacity / 100, 0.08, 1) : 1;
  const fill = isGroup ? baseFill : blend(baseFill, theme.likec4.background, opacity);
  const text = isGroup ? theme.palette.text : contrastText(fill, theme);
  const muted = isGroup ? theme.palette.textMuted : withAlpha(text, 0.75);

  const x = round(node.x);
  const y = round(node.y);
  const w = round(node.width);
  const h = round(node.height);

  const parts: string[] = [`<g data-node="${escapeXml(node.id)}">`];

  if (isGroup) {
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" fill-opacity="0.55" stroke="${stroke}" stroke-width="1.2" stroke-dasharray="6 4"/>`,
    );
    // El titulo del contenedor va arriba a la izquierda, fuera del area util.
    parts.push(
      textNode(escapeXml(node.title), x + 14, y + 20, TITLE_SIZE, theme.palette.text, 'start', 600, theme),
    );
  } else {
    parts.push(shapePath(node.shape ?? 'rectangle', x, y, w, h, fill, stroke, 1));
    parts.push(...nodeLabels(node, x, y, w, h, text, muted, theme));
  }

  parts.push('</g>');
  return parts.join('\n');
}

function nodeLabels(
  node: LikeC4Node,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  muted: string,
  theme: Theme,
): string[] {
  const innerWidth = Math.max(40, w - 32);
  const titleLines = wrap(node.title, innerWidth, TITLE_SIZE, 3);
  const description = normalizeText(node.description);
  const descLines = description === undefined ? [] : wrap(description, innerWidth, BODY_SIZE, 3);
  const technology = normalizeText(node.technology);
  const techLines = technology === undefined ? [] : wrap(`[${technology}]`, innerWidth, TECH_SIZE, 1);

  const blockHeight =
    titleLines.length * TITLE_SIZE * LINE_GAP +
    (descLines.length > 0 ? 6 + descLines.length * BODY_SIZE * LINE_GAP : 0) +
    (techLines.length > 0 ? 4 + techLines.length * TECH_SIZE * LINE_GAP : 0);

  const cx = x + w / 2;
  let cursor = y + h / 2 - blockHeight / 2 + TITLE_SIZE * 0.85;

  const out: string[] = [];
  for (const line of titleLines) {
    out.push(textNode(escapeXml(line), cx, cursor, TITLE_SIZE, color, 'middle', 600, theme));
    cursor += TITLE_SIZE * LINE_GAP;
  }
  if (descLines.length > 0) {
    cursor += 6;
    for (const line of descLines) {
      out.push(textNode(escapeXml(line), cx, cursor, BODY_SIZE, muted, 'middle', 400, theme));
      cursor += BODY_SIZE * LINE_GAP;
    }
  }
  if (techLines.length > 0) {
    cursor += 4;
    for (const line of techLines) {
      out.push(
        textNode(escapeXml(line), cx, cursor, TECH_SIZE, muted, 'middle', 400, theme, 'italic'),
      );
      cursor += TECH_SIZE * LINE_GAP;
    }
  }
  return out;
}

/** Dibuja el contorno correspondiente a la forma LikeC4 declarada. */
function shapePath(
  shape: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke: string,
  opacity: number,
): string {
  const common = `fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="1.5" filter="url(#lc4-shadow)"`;

  switch (shape) {
    case 'person': {
      // Rectangulo redondeado con una cabeza semicircular en el borde superior.
      const headR = Math.min(16, h * 0.14);
      const bodyY = y + headR;
      return [
        `<rect x="${x}" y="${round(bodyY)}" width="${w}" height="${round(h - headR)}" rx="10" ${common}/>`,
        `<circle cx="${round(x + w / 2)}" cy="${round(bodyY)}" r="${round(headR)}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="1.5"/>`,
      ].join('\n');
    }
    case 'cylinder':
    case 'storage': {
      const ry = Math.min(14, h * 0.12);
      return [
        `<path d="M ${x} ${round(y + ry)} A ${round(w / 2)} ${round(ry)} 0 0 1 ${x + w} ${round(y + ry)} L ${x + w} ${round(y + h - ry)} A ${round(w / 2)} ${round(ry)} 0 0 1 ${x} ${round(y + h - ry)} Z" ${common}/>`,
        `<path d="M ${x} ${round(y + ry)} A ${round(w / 2)} ${round(ry)} 0 0 0 ${x + w} ${round(y + ry)}" fill="none" stroke="${stroke}" stroke-width="1.2" stroke-opacity="0.7"/>`,
      ].join('\n');
    }
    case 'queue': {
      const rx = Math.min(16, w * 0.06);
      return [
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${round(rx)}" ry="${round(h / 2)}" ${common}/>`,
        `<path d="M ${round(x + w - rx * 2)} ${y} A ${round(rx)} ${round(h / 2)} 0 0 1 ${round(x + w - rx * 2)} ${y + h}" fill="none" stroke="${stroke}" stroke-width="1.2" stroke-opacity="0.7"/>`,
      ].join('\n');
    }
    case 'browser': {
      const bar = 18;
      return [
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" ${common}/>`,
        `<path d="M ${x} ${round(y + bar)} L ${x + w} ${round(y + bar)}" stroke="${stroke}" stroke-width="1.2" stroke-opacity="0.7" fill="none"/>`,
        `<circle cx="${x + 14}" cy="${round(y + bar / 2)}" r="3" fill="${stroke}" fill-opacity="0.55"/>`,
        `<circle cx="${x + 26}" cy="${round(y + bar / 2)}" r="3" fill="${stroke}" fill-opacity="0.55"/>`,
        `<circle cx="${x + 38}" cy="${round(y + bar / 2)}" r="3" fill="${stroke}" fill-opacity="0.55"/>`,
      ].join('\n');
    }
    case 'mobile': {
      const inset = Math.min(28, w * 0.12);
      return [
        `<rect x="${round(x + inset)}" y="${y}" width="${round(w - inset * 2)}" height="${h}" rx="12" ${common}/>`,
        `<rect x="${round(x + w / 2 - 12)}" y="${round(y + 6)}" width="24" height="3" rx="1.5" fill="${stroke}" fill-opacity="0.55"/>`,
      ].join('\n');
    }
    case 'component': {
      const tabW = 14;
      const tabH = 10;
      return [
        `<rect x="${round(x + tabW / 2)}" y="${y}" width="${round(w - tabW / 2)}" height="${h}" rx="6" ${common}/>`,
        `<rect x="${x}" y="${round(y + h * 0.28)}" width="${tabW}" height="${tabH}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="1.3"/>`,
        `<rect x="${x}" y="${round(y + h * 0.58)}" width="${tabW}" height="${tabH}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="1.3"/>`,
      ].join('\n');
    }
    case 'document': {
      const wave = Math.min(16, h * 0.12);
      return `<path d="M ${x} ${round(y + 6)} Q ${x} ${y} ${x + 6} ${y} L ${x + w - 6} ${y} Q ${x + w} ${y} ${x + w} ${round(y + 6)} L ${x + w} ${round(y + h - wave)} Q ${round(x + w * 0.75)} ${round(y + h)} ${round(x + w / 2)} ${round(y + h - wave / 2)} Q ${round(x + w * 0.25)} ${round(y + h - wave)} ${x} ${round(y + h - wave / 2)} Z" ${common}/>`;
    }
    case 'bucket': {
      const ry = Math.min(12, h * 0.1);
      const inset = w * 0.08;
      return [
        `<path d="M ${x} ${round(y + ry)} A ${round(w / 2)} ${round(ry)} 0 0 1 ${x + w} ${round(y + ry)} L ${round(x + w - inset)} ${round(y + h - ry)} A ${round(w / 2 - inset)} ${round(ry)} 0 0 1 ${round(x + inset)} ${round(y + h - ry)} Z" ${common}/>`,
        `<path d="M ${x} ${round(y + ry)} A ${round(w / 2)} ${round(ry)} 0 0 0 ${x + w} ${round(y + ry)}" fill="none" stroke="${stroke}" stroke-width="1.2" stroke-opacity="0.7"/>`,
      ].join('\n');
    }
    case 'rectangle':
    default:
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" ${common}/>`;
  }
}

// --------------------------------------------------------------------------
// Relaciones
// --------------------------------------------------------------------------

function renderEdge(edge: LikeC4Edge, theme: Theme, nodes: Map<string, LikeC4Node>): string {
  const points = edge.points ?? [];
  if (points.length < 2) return '';

  const stroke = theme.likec4.edgeStroke;
  const dash =
    edge.line === 'dashed' ? ' stroke-dasharray="7 5"' : edge.line === 'dotted' ? ' stroke-dasharray="2 4"' : '';
  const marker = markerFor(edge.head);
  const tailMarker = edge.tail !== undefined && edge.tail !== 'none' ? ` marker-start="url(#${markerFor(edge.tail)})"` : '';

  const parts: string[] = [
    `<path d="${bezierPath(points)}" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round"${dash} marker-end="url(#${marker})"${tailMarker} data-edge="${escapeXml(edge.id)}"/>`,
  ];

  const label = typeof edge.label === 'string' ? edge.label.trim() : '';
  if (label !== '') {
    const box = edge.labelBBox;
    const anchor = box ?? midpointBox(points);
    const lines = wrap(label, Math.max(70, box?.width ?? 120), BODY_SIZE, 2);
    const lineHeight = BODY_SIZE * LINE_GAP;
    const boxWidth = Math.max(...lines.map((l) => textWidth(l, BODY_SIZE))) + 10;
    const boxHeight = lines.length * lineHeight + 6;
    const cx = round(anchor.x + (box?.width ?? 0) / 2);
    const top = round(anchor.y - (box === undefined ? boxHeight / 2 : 2));
    parts.push(
      `<rect x="${round(cx - boxWidth / 2)}" y="${top}" width="${round(boxWidth)}" height="${round(boxHeight)}" rx="4" fill="${theme.likec4.background}" fill-opacity="0.92"/>`,
    );
    let cursor = top + BODY_SIZE + 2;
    for (const line of lines) {
      parts.push(textNode(escapeXml(line), cx, cursor, BODY_SIZE, theme.likec4.edgeText, 'middle', 500, theme));
      cursor += lineHeight;
    }
  }

  // Nota: `nodes` queda disponible para futuras decoraciones por forma de origen.
  void nodes;
  return parts.join('\n');
}

function markerFor(head: string | undefined): string {
  switch (head) {
    case 'diamond':
    case 'odiamond':
      return 'lc4-diamond';
    case 'dot':
    case 'odot':
      return 'lc4-dot';
    case 'open':
    case 'vee':
    case 'onormal':
      return 'lc4-arrow-open';
    default:
      return 'lc4-arrow';
  }
}

/**
 * Graphviz entrega la curva como punto inicial seguido de tripletas de control.
 * Si sobran puntos que no completan una tripleta se cierran con segmentos rectos.
 */
function bezierPath(points: Array<[number, number]>): string {
  const [first, ...rest] = points;
  let d = `M ${round(first![0])} ${round(first![1])}`;
  let i = 0;
  while (i + 2 < rest.length) {
    const c1 = rest[i]!;
    const c2 = rest[i + 1]!;
    const end = rest[i + 2]!;
    d += ` C ${round(c1[0])} ${round(c1[1])}, ${round(c2[0])} ${round(c2[1])}, ${round(end[0])} ${round(end[1])}`;
    i += 3;
  }
  for (; i < rest.length; i += 1) {
    const p = rest[i]!;
    d += ` L ${round(p[0])} ${round(p[1])}`;
  }
  return d;
}

function midpointBox(points: Array<[number, number]>): { x: number; y: number; width: number; height: number } {
  const mid = points[Math.floor(points.length / 2)]!;
  return { x: mid[0], y: mid[1], width: 0, height: 0 };
}

// --------------------------------------------------------------------------
// Texto
// --------------------------------------------------------------------------

function textNode(
  content: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  anchor: 'start' | 'middle' | 'end',
  weight: number,
  theme: Theme,
  style?: 'italic',
): string {
  const italic = style === 'italic' ? ' font-style="italic"' : '';
  return `<text x="${round(x)}" y="${round(y)}" font-family="${escapeXml(theme.fontFamily)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${italic}>${content}</text>`;
}

function textWidth(text: string, size: number): number {
  return text.length * size * CHAR_RATIO;
}

/** Ajuste de linea por palabras con truncado con elipsis al llegar al maximo. */
export function wrap(text: string, maxWidth: number, size: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter((w) => w !== '');
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (textWidth(candidate, size) <= maxWidth || current === '') {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && current !== '') lines.push(current);
  if (lines.length === maxLines) {
    const consumed = lines.join(' ').split(/\s+/).length;
    if (consumed < words.length) {
      const last = lines[maxLines - 1]!;
      lines[maxLines - 1] = `${last.replace(/[\s,.;:]+$/, '')}...`;
    }
  }
  return lines;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const t = value.trim();
    return t === '' ? undefined : t;
  }
  if (value !== null && typeof value === 'object' && 'txt' in (value as Record<string, unknown>)) {
    return normalizeText((value as { txt?: unknown }).txt);
  }
  return undefined;
}

// --------------------------------------------------------------------------
// Color
// --------------------------------------------------------------------------

/** Elige texto claro u oscuro segun la luminancia del relleno (WCAG). */
export function contrastText(fill: string, theme: Theme): string {
  const rgb = parseHex(fill);
  if (rgb === undefined) return theme.palette.text;
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? '#12181F' : '#FFFFFF';
}

/** Compone `fg` sobre `bg` con la opacidad dada y devuelve un color opaco. */
export function blend(fg: string, bg: string, alpha: number): string {
  const a = parseHex(fg);
  const b = parseHex(bg);
  if (a === undefined || b === undefined) return fg;
  const mix = a.map((c, i) => Math.round(c * alpha + b[i]! * (1 - alpha)));
  return `#${mix.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function withAlpha(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  if (rgb === undefined) return hex;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function parseHex(hex: string): [number, number, number] | undefined {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (m === null) return undefined;
  let value = m[1]!;
  if (value.length === 3) value = value.split('').map((c) => c + c).join('');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
