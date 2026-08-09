/**
 * Pruebas del orquestador de build que no requieren renderizar de verdad.
 */

import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { build, check, collectMarkdown } from '../../src/build/builder.js';
import { defaultConfig } from '../../src/config/load.js';
import { DocVizError } from '../../src/core/errors.js';
import type { DocVizConfig } from '../../src/config/types.js';

const temps: string[] = [];

async function project(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'docviz-builder-'));
  temps.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return root;
}

function config(root: string, overrides: Partial<DocVizConfig> = {}): DocVizConfig {
  return { ...defaultConfig(root), ...overrides, rootDir: root };
}

afterAll(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});

describe('collectMarkdown', () => {
  it('recorre subdirectorios y ordena el resultado', async () => {
    const root = await project({
      'docs-src/b.md': '# b',
      'docs-src/a.md': '# a',
      'docs-src/sub/c.markdown': '# c',
      'docs-src/nota.txt': 'texto',
    });
    const files = await collectMarkdown(path.join(root, 'docs-src'));
    expect(files.map((f) => path.basename(f))).toEqual(['a.md', 'b.md', 'c.markdown']);
  });

  it('ignora directorios ocultos y node_modules', async () => {
    const root = await project({
      'docs-src/a.md': '# a',
      'docs-src/.oculto/b.md': '# b',
      'docs-src/node_modules/c.md': '# c',
    });
    expect(await collectMarkdown(path.join(root, 'docs-src'))).toHaveLength(1);
  });

  it('devuelve lista vacia si el directorio no existe', async () => {
    expect(await collectMarkdown(path.join(tmpdir(), 'no-existe-docviz'))).toEqual([]);
  });
});

describe('check', () => {
  it('lista los bloques detectados con su motor', async () => {
    const root = await project({
      'docs-src/a.md': '## Uno\n\n```d2\nA -> B\n```\n\n## Dos\n\n```chart\ntype: bar\ndata:\n  - label: A\n    value: 1\n```\n',
    });
    const result = await check(config(root));
    expect(result.documents).toBe(1);
    expect(result.blocks).toBe(2);
    expect(result.errors).toEqual([]);
    expect(result.findings.map((f) => f.rendererType)).toEqual(['d2', 'vega-lite']);
    expect(result.findings[0]!.line).toBeGreaterThan(0);
  });

  it('reporta un renderer deshabilitado', async () => {
    const root = await project({ 'docs-src/a.md': '## Uno\n\n```mermaid\nflowchart LR\nA-->B\n```\n' });
    const cfg = config(root);
    cfg.renderers.mermaid.enabled = false;
    const result = await check(cfg);
    // Sin renderer registrado el lenguaje deja de reconocerse: no hay bloque.
    expect(result.blocks).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('reporta un formato imposible para el motor', async () => {
    const root = await project({ 'docs-src/a.md': '## Uno\n\n```d2\nA -> B\n```\n' });
    const cfg = config(root);
    cfg.formats['d2'] = 'png';
    const result = await check(cfg);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.format()).toContain('no puede producir png');
  });

  it('reporta un DSL invalido con archivo y sin renderizar', async () => {
    const root = await project({ 'docs-src/a.md': '```diagram\ntype: mandala\n```\n' });
    const result = await check(config(root));
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.location.file).toContain('a.md');
  });

  it('no falla con un proyecto sin documentos', async () => {
    const root = await project({});
    const result = await check(config(root));
    expect(result).toMatchObject({ documents: 0, blocks: 0, errors: [] });
  });
});

describe('build — reglas generales', () => {
  it('rechaza que origen y salida sean el mismo directorio', async () => {
    const root = await project({ 'docs-src/a.md': '# a' });
    const cfg = config(root, { source: 'docs-src', output: 'docs-src' });
    await expect(build(cfg)).rejects.toThrow(DocVizError);
  });

  it('copia los archivos que no son Markdown', async () => {
    const root = await project({
      'docs-src/a.md': '# a\n',
      'docs-src/adjuntos/foto.png': 'binario',
      'docs-src/datos.csv': 'a,b\n1,2\n',
    });
    await build(config(root));
    expect((await stat(path.join(root, 'docs', 'adjuntos', 'foto.png'))).isFile()).toBe(true);
    expect((await stat(path.join(root, 'docs', 'datos.csv'))).isFile()).toBe(true);
  });

  it('preserva la estructura de subdirectorios', async () => {
    const root = await project({ 'docs-src/guias/uno.md': '## Uno\n\n```d2\nA -> B\n```\n' });
    await build(config(root));
    expect((await stat(path.join(root, 'docs', 'guias', 'uno.md'))).isFile()).toBe(true);
  });

  it('usa rutas relativas correctas desde documentos anidados', async () => {
    const root = await project({ 'docs-src/a/b/doc.md': '## Uno\n\n```d2\nA -> B\n```\n' });
    await build(config(root));
    const { readFile } = await import('node:fs/promises');
    const markdown = await readFile(path.join(root, 'docs', 'a', 'b', 'doc.md'), 'utf8');
    expect(markdown).toContain('](../../assets/generated/');
  });

  it('--clean elimina la salida previa', async () => {
    const root = await project({ 'docs-src/a.md': '# a\n' });
    await build(config(root));
    await writeFile(path.join(root, 'docs', 'sobrante.md'), '# sobra\n', 'utf8');
    await build(config(root), { clean: true });
    await expect(stat(path.join(root, 'docs', 'sobrante.md'))).rejects.toThrow();
  });

  it('informa por el callback de log en modo verbose', async () => {
    const root = await project({ 'docs-src/a.md': '## Uno\n\n```d2\nA -> B\n```\n' });
    const lines: string[] = [];
    await build(config(root), { verbose: true, onLog: (m) => lines.push(m) });
    expect(lines.some((l) => l.includes('d2'))).toBe(true);
  });

  it('respeta el formato pedido en la valla', async () => {
    const root = await project({
      'docs-src/a.md': '## Uno\n\n```plantuml format=png\n@startuml\nA -> B\n@enduml\n```\n',
    });
    const result = await build(config(root));
    expect(result.assets[0]!.format).toBe('png');
    expect(result.assets[0]!.relativePath).toMatch(/\.png$/);
  });

  it('respeta la longitud de hash configurada', async () => {
    const root = await project({ 'docs-src/a.md': '## Uno\n\n```d2\nA -> B\n```\n' });
    const result = await build(config(root, { hash: { length: 16 } }));
    expect(result.assets[0]!.hash).toHaveLength(16);
  });

  it('escribe los recursos en el assetsDir configurado', async () => {
    const root = await project({ 'docs-src/a.md': '## Uno\n\n```d2\nA -> B\n```\n' });
    await build(config(root, { assetsDir: 'img/diagramas' }));
    expect((await stat(path.join(root, 'docs', 'img', 'diagramas'))).isDirectory()).toBe(true);
  });
});
