/**
 * Verificacion del Markdown ya compilado.
 *
 * Responde a la pregunta del criterio de aceptacion "no hay imagenes rotas":
 * cada referencia de imagen del documento debe existir en disco, ser relativa y
 * quedar dentro del directorio de salida.
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { visit } from 'unist-util-visit';
import type { Image } from 'mdast';
import { parseMarkdown } from '../markdown/scan.js';
import { collectMarkdown } from './builder.js';
import { toPosix } from '../core/paths.js';

export interface VerifyIssue {
  file: string;
  line: number;
  url: string;
  reason: string;
}

export interface VerifyResult {
  documents: number;
  images: number;
  /** Bloques declarativos que quedaron sin compilar en la salida. */
  residualBlocks: Array<{ file: string; line: number; lang: string }>;
  issues: VerifyIssue[];
}

const DECLARATIVE_LANGS = new Set([
  'plantuml',
  'puml',
  'uml',
  'mermaid',
  'mmd',
  'd2',
  'graphviz',
  'dot',
  'vega-lite',
  'vegalite',
  'vl',
  'likec4',
  'c4',
  'diagram',
  'chart',
  'architecture',
]);

export async function verify(outputDir: string): Promise<VerifyResult> {
  const files = await collectMarkdown(outputDir);
  const result: VerifyResult = { documents: files.length, images: 0, residualBlocks: [], issues: [] };

  for (const file of files) {
    const relative = toPosix(path.relative(outputDir, file));
    const text = await readFile(file, 'utf8');
    const tree = parseMarkdown(text);

    const images: Array<{ url: string; line: number; alt: string | null }> = [];
    visit(tree, 'image', (node: Image) => {
      images.push({ url: node.url, line: node.position?.start.line ?? 0, alt: node.alt ?? null });
    });
    visit(tree, 'code', (node) => {
      const lang = (node.lang ?? '').trim().toLowerCase();
      if (DECLARATIVE_LANGS.has(lang)) {
        result.residualBlocks.push({ file: relative, line: node.position?.start.line ?? 0, lang });
      }
    });

    for (const image of images) {
      result.images += 1;
      const { url } = image;

      if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
        if (!url.startsWith('data:')) {
          result.issues.push({
            file: relative,
            line: image.line,
            url,
            reason: 'la imagen usa una URL absoluta en lugar de una ruta relativa',
          });
        }
        continue;
      }
      if (url.startsWith('/')) {
        result.issues.push({
          file: relative,
          line: image.line,
          url,
          reason: 'la ruta de la imagen es absoluta; el documento dejaria de funcionar al moverlo',
        });
        continue;
      }

      const clean = decodeURIComponent(url.replace(/^<|>$/g, '').split('#')[0]!.split('?')[0]!);
      const target = path.resolve(path.dirname(file), clean);
      if (path.relative(outputDir, target).startsWith('..')) {
        result.issues.push({
          file: relative,
          line: image.line,
          url,
          reason: 'la imagen apunta fuera del directorio de salida',
        });
        continue;
      }
      try {
        const info = await stat(target);
        if (!info.isFile() || info.size === 0) {
          result.issues.push({ file: relative, line: image.line, url, reason: 'el recurso existe pero esta vacio' });
        }
      } catch {
        result.issues.push({ file: relative, line: image.line, url, reason: 'el recurso no existe' });
      }

      if (image.alt === null || image.alt.trim() === '') {
        result.issues.push({ file: relative, line: image.line, url, reason: 'la imagen no tiene texto alternativo' });
      }
    }
  }

  return result;
}
