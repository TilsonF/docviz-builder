/**
 * Sustitucion de bloques por imagenes Markdown.
 *
 * El reemplazo es quirurgico: se usan los desplazamientos que da el AST para
 * cortar exactamente la valla de codigo y nada mas. Volver a serializar todo el
 * documento con `remark-stringify` normalizaria comillas, vinetas y saltos, y
 * el criterio de aceptacion exige mantener intacto el resto del Markdown.
 */

import type { DiagramBlock } from '../core/types.js';

export interface Replacement {
  block: DiagramBlock;
  /** Ruta relativa del recurso, ya calculada respecto al documento. */
  assetPath: string;
}

/** Escapa el texto alternativo para que no rompa la sintaxis de imagen. */
export function escapeAltText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

/**
 * Escapa la ruta. Las rutas generadas son slugs ASCII, pero un espacio o un
 * parentesis en un `assetsDir` configurado a mano romperia el enlace.
 */
export function encodeAssetPath(assetPath: string): string {
  if (/[\s()<>]/.test(assetPath)) return `<${assetPath.replace(/[<>]/g, '')}>`;
  return assetPath;
}

export function imageMarkdown(alt: string, assetPath: string): string {
  return `![${escapeAltText(alt)}](${encodeAssetPath(assetPath)})`;
}

/**
 * Aplica los reemplazos de atras hacia adelante para que los desplazamientos
 * de los bloques anteriores sigan siendo validos.
 */
export function applyReplacements(source: string, replacements: readonly Replacement[]): string {
  const ordered = [...replacements].sort((a, b) => b.block.start - a.block.start);
  let out = source;
  for (const { block, assetPath } of ordered) {
    const image = imageMarkdown(block.title, assetPath);
    out = out.slice(0, block.start) + image + out.slice(block.end);
  }
  return out;
}
