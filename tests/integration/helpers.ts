/**
 * Utilidades compartidas por las pruebas de integracion.
 *
 * Cada prueba trabaja sobre un proyecto temporal real: documentos en disco,
 * build completo y verificacion del resultado.
 */

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build, type BuildOptions, type BuildResult } from '../../src/build/builder.js';
import { defaultConfig } from '../../src/config/load.js';
import type { DocVizConfig } from '../../src/config/types.js';

const created: string[] = [];

export async function makeProject(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'docviz-it-'));
  created.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, 'docs-src', relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return root;
}

export async function cleanupProjects(): Promise<void> {
  for (const dir of created.splice(0)) await rm(dir, { recursive: true, force: true });
}

export function configFor(root: string, overrides: Partial<DocVizConfig> = {}): DocVizConfig {
  return { ...defaultConfig(root), ...overrides, rootDir: root };
}

export async function buildProject(
  root: string,
  options: BuildOptions = {},
  configOverrides: Partial<DocVizConfig> = {},
): Promise<BuildResult> {
  return build(configFor(root, configOverrides), options);
}

export async function readOutput(root: string, relative: string): Promise<string> {
  return readFile(path.join(root, 'docs', relative), 'utf8');
}

export async function listAssets(root: string): Promise<string[]> {
  try {
    return (await readdir(path.join(root, 'docs', 'assets', 'generated'))).sort();
  } catch {
    return [];
  }
}

export async function readAsset(root: string, name: string): Promise<string> {
  return readFile(path.join(root, 'docs', 'assets', 'generated', name), 'utf8');
}

/** Extrae las rutas de imagen del Markdown compilado. */
export function imagePaths(markdown: string): string[] {
  return [...markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]!);
}

/** Extrae los textos alternativos del Markdown compilado. */
export function altTexts(markdown: string): string[] {
  return [...markdown.matchAll(/!\[([^\]]*)\]\([^)]+\)/g)].map((m) => m[1]!);
}

/** Comprobaciones minimas de que un SVG es utilizable en un visor Markdown. */
export function assertUsableSvg(svg: string): void {
  if (!svg.includes('<svg')) throw new Error('el recurso no contiene un elemento <svg>');
  const openTag = /<svg\b[^>]*>/.exec(svg)![0];
  if (!/\bwidth="\d+(\.\d+)?"/.test(openTag)) throw new Error(`sin ancho absoluto: ${openTag.slice(0, 160)}`);
  if (!/\bheight="\d+(\.\d+)?"/.test(openTag)) throw new Error(`sin alto absoluto: ${openTag.slice(0, 160)}`);
  if (!openTag.includes('xmlns=')) throw new Error('sin namespace SVG');
  if (/<script/i.test(svg)) throw new Error('el SVG contiene un script');
  if (/\son\w+\s*=/.test(svg)) throw new Error('el SVG contiene un manejador de eventos inline');
}

/** Tamano del lienzo declarado en el SVG. */
export function svgSize(svg: string): { width: number; height: number } {
  const tag = /<svg\b[^>]*>/.exec(svg)![0];
  return {
    width: Number(/\bwidth="(\d+(?:\.\d+)?)"/.exec(tag)![1]),
    height: Number(/\bheight="(\d+(?:\.\d+)?)"/.exec(tag)![1]),
  };
}
