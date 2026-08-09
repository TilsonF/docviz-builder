/**
 * Pruebas de las herramientas MCP.
 *
 * Se ejercitan sin transporte: son las mismas funciones que el servidor stdio
 * expone al agente.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  buildDocuments,
  listTypes,
  previewDocument,
  renderDiagram,
  renderableTypes,
  validateDocument,
} from '../../src/mcp/tools.js';

const temps: string[] = [];

async function project(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'docviz-mcp-'));
  temps.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return root;
}

afterAll(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});

describe('docviz_types', () => {
  it('publica el catalogo completo', () => {
    const result = listTypes();
    expect(result.ok).toBe(true);
    expect(result['diagram']).toContain('sequence');
    expect(result['chart']).toContain('bar');
    expect(result['architecture']).toContain('c4-context');
    expect(result['themes']).toContain('corporate');
  });

  it('renderableTypes reune los tres catalogos ordenados', () => {
    const types = renderableTypes();
    expect(types).toContain('strategy-tree');
    expect(types).toContain('waterfall');
    expect([...types].sort()).toEqual(types);
  });
});

describe('docviz_validate_document', () => {
  it('valida contenido en memoria y describe cada bloque', async () => {
    const result = await validateDocument({
      content: ['## Flujo', '', '```diagram', 'type: flow', 'flow:', '  - A -> B', '```'].join('\n'),
    });
    expect(result.ok).toBe(true);
    expect(result['blocks']).toBe(1);
    expect((result['findings'] as Array<{ engine: string }>)[0]!.engine).toBe('mermaid');
  });

  it('reporta un error del DSL con su detalle', async () => {
    const result = await validateDocument({ content: '```chart\ntype: radar\ndata: []\n```' });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result['errors'])).toContain('radar');
  });

  it('valida un directorio de proyecto', async () => {
    const root = await project({ 'docs-src/a.md': '## Uno\n\n```d2\nA -> B\n```\n' });
    const result = await validateDocument({ cwd: root });
    expect(result.ok).toBe(true);
    expect(result['documents']).toBe(1);
  });

  it('devuelve el error de configuracion en lugar de lanzarlo', async () => {
    const root = await project({ 'docviz.config.yaml': 'theme:\n  name: neon\n' });
    const result = await validateDocument({ cwd: root });
    expect(result.ok).toBe(false);
    expect(String(result['error'])).toContain('neon');
  });
});

describe('docviz_render_diagram', () => {
  it('renderiza un tipo del DSL eligiendo el motor', async () => {
    const root = await project();
    const result = await renderDiagram({
      cwd: root,
      type: 'strategy-tree',
      source: 'root: Mejorar calidad\nbranches:\n  - Automatizacion\n  - Proceso',
      title: 'Estrategia',
    });
    expect(result.ok).toBe(true);
    expect(result['engine']).toBe('d2');
    expect(String(result['content'])).toContain('<svg');
  });

  it('renderiza un grafico', async () => {
    const root = await project();
    const result = await renderDiagram({
      cwd: root,
      type: 'bar',
      source: 'data:\n  - label: SP1\n    value: 42\n  - label: SP2\n    value: 28',
    });
    expect(result.ok).toBe(true);
    expect(result['engine']).toBe('vega-lite');
  });

  it('acepta tambien el nombre de un motor directamente', async () => {
    const root = await project();
    const result = await renderDiagram({ cwd: root, type: 'graphviz', source: 'digraph { A -> B }' });
    expect(result.ok).toBe(true);
    expect(result['engine']).toBe('graphviz');
  });

  it('escribe el recurso cuando se indica outputDir', async () => {
    const root = await project();
    const result = await renderDiagram({
      cwd: root,
      type: 'flow',
      source: 'flow:\n  - A -> B',
      title: 'Mi flujo',
      outputDir: 'salida',
    });
    expect(result.ok).toBe(true);
    expect(String(result['path'])).toBe('salida/mi-flujo.svg');
  });

  it('rechaza un tipo inexistente listando los validos', async () => {
    const root = await project();
    const result = await renderDiagram({ cwd: root, type: 'mandala', source: 'x: 1' });
    expect(result.ok).toBe(false);
    expect(String(result['detail'])).toContain('strategy-tree');
  });

  it('devuelve el error del DSL sin lanzarlo', async () => {
    const root = await project();
    const result = await renderDiagram({ cwd: root, type: 'bar', source: 'data:\n  - label: A' });
    expect(result.ok).toBe(false);
    expect(String(result['error'])).toContain('value');
  });

  it('respeta el tema pedido', async () => {
    const root = await project();
    const claro = await renderDiagram({ cwd: root, type: 'graphviz', source: 'digraph { A -> B }', theme: 'default' });
    const oscuro = await renderDiagram({ cwd: root, type: 'graphviz', source: 'digraph { A -> B }', theme: 'dark' });
    expect(claro['content']).not.toBe(oscuro['content']);
  });
});

describe('docviz_build_document y docviz_preview', () => {
  it('compila y verifica en una sola llamada', async () => {
    const root = await project({
      'docs-src/arquitectura.md': '## Contexto\n\n```d2\nA -> B\n```\n',
    });
    const result = await buildDocuments({ cwd: root });
    expect(result.ok).toBe(true);
    expect((result['stats'] as { blocks: number }).blocks).toBe(1);
    expect((result['verification'] as { issues: unknown[] }).issues).toEqual([]);
  });

  it('devuelve el resumen de la salida', async () => {
    const root = await project({ 'docs-src/a.md': '## Uno\n\n```d2\nA -> B\n```\n' });
    await buildDocuments({ cwd: root });
    const preview = await previewDocument({ cwd: root });
    expect(preview.ok).toBe(true);
    expect(preview['images']).toBe(1);
  });

  it('devuelve el Markdown compilado de un documento concreto', async () => {
    const root = await project({ 'docs-src/a.md': '## Uno\n\n```d2\nA -> B\n```\n' });
    await buildDocuments({ cwd: root });
    const preview = await previewDocument({ cwd: root, document: 'a.md' });
    expect(String(preview['markdown'])).toContain('![Uno](./assets/generated/');
  });

  it('impide leer fuera del directorio de salida', async () => {
    const root = await project({ 'docs-src/a.md': '# a\n' });
    await buildDocuments({ cwd: root });
    const preview = await previewDocument({ cwd: root, document: '../../../etc/passwd' });
    expect(preview.ok).toBe(false);
    expect(String(preview['error'])).toContain('fuera del directorio');
  });

  it('informa del fallo de compilacion con el detalle completo', async () => {
    const root = await project({ 'docs-src/a.md': '## Uno\n\n```graphviz\ndigraph { ][\n```\n' });
    const result = await buildDocuments({ cwd: root });
    expect(result.ok).toBe(false);
    expect(String(result['detail'])).toContain('renderer: graphviz');
  });
});
