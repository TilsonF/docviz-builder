/**
 * Pruebas de la comparacion entre dos versiones de la documentacion.
 *
 * La propiedad que importa no es contar diagramas, sino que el diff hable de
 * cambios reales: mover un bloque o cambiar el tema no son cambios; cambiar el
 * contenido o el motor si.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diff, formatDiff, hasChanges } from '../../src/build/diff.js';
import { run } from '../../src/cli.js';
import { diffDocuments } from '../../src/mcp/tools.js';
import { defaultConfig } from '../../src/config/load.js';
import type { DiffResult } from '../../src/build/diff.js';
import type { DocVizConfig } from '../../src/config/types.js';

const temps: string[] = [];

const SECUENCIA = ['```diagram', 'type: sequence', 'participants: [A, B]', 'flow:', '  - A -> B: hola', '```'].join('\n');
const SECUENCIA_AMPLIADA = [
  '```diagram',
  'type: sequence',
  'participants: [A, B, C]',
  'flow:',
  '  - A -> B: hola',
  '  - B -> C: adios',
  '```',
].join('\n');

async function tree(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'docviz-diff-'));
  temps.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return root;
}

function config(root: string): DocVizConfig {
  return { ...defaultConfig(root), rootDir: root };
}

function statusOf(result: DiffResult, title: string): string | undefined {
  return result.entries.find((e) => e.title === title)?.status;
}

afterAll(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});

describe('diff de diagramas', () => {
  it('clasifica nuevo, eliminado, modificado e igual', async () => {
    const base = await tree({
      'a.md': ['## Igual', '', SECUENCIA, '', '## Modificado', '', SECUENCIA, '', '## Eliminado', '', SECUENCIA, ''].join('\n'),
    });
    const head = await tree({
      'a.md': ['## Igual', '', SECUENCIA, '', '## Modificado', '', SECUENCIA_AMPLIADA, '', '## Nuevo', '', SECUENCIA, ''].join('\n'),
    });

    const result = await diff(config(base), base, head);

    expect(statusOf(result, 'Igual')).toBe('unchanged');
    expect(statusOf(result, 'Modificado')).toBe('changed');
    expect(statusOf(result, 'Nuevo')).toBe('added');
    expect(statusOf(result, 'Eliminado')).toBe('removed');
    expect(result.summary).toEqual({ added: 1, removed: 1, changed: 1, unchanged: 1 });
    expect(hasChanges(result)).toBe(true);
  });

  it('un modificado conserva los dos hashes y un igual no cambia de huella', async () => {
    const base = await tree({ 'a.md': `## Uno\n\n${SECUENCIA}\n` });
    const head = await tree({ 'a.md': `## Uno\n\n${SECUENCIA_AMPLIADA}\n` });

    const [entry] = (await diff(config(base), base, head)).entries;
    expect(entry!.status).toBe('changed');
    expect(entry!.baseHash).toBeTypeOf('string');
    expect(entry!.headHash).not.toBe(entry!.baseHash);
    expect(entry!.previousEngine).toBeUndefined();
  });

  it('insertar texto delante no convierte los diagramas en nuevos', async () => {
    const base = await tree({ 'a.md': `## Uno\n\n${SECUENCIA}\n` });
    const head = await tree({ 'a.md': `# Titulo anadido\n\nUn parrafo nuevo.\n\n## Uno\n\n${SECUENCIA}\n` });

    const result = await diff(config(base), base, head);
    expect(result.summary).toEqual({ added: 0, removed: 0, changed: 0, unchanged: 1 });
    expect(hasChanges(result)).toBe(false);
    expect(result.entries[0]!.line).toBeGreaterThan(3);
  });

  it('distingue dos diagramas con el mismo titulo en el mismo documento', async () => {
    const base = await tree({ 'a.md': `## Uno\n\n${SECUENCIA}\n\n${SECUENCIA}\n` });
    const head = await tree({ 'a.md': `## Uno\n\n${SECUENCIA}\n\n${SECUENCIA_AMPLIADA}\n` });

    const result = await diff(config(base), base, head);
    expect(result.summary).toEqual({ added: 0, removed: 0, changed: 1, unchanged: 1 });
  });

  it('cambiar de motor se reporta como tal', async () => {
    const base = await tree({ 'a.md': ['## Uno', '', '```diagram', 'type: flow', 'flow:', '  - A -> B', '```', ''].join('\n') });
    const head = await tree({
      'a.md': ['## Uno', '', '```diagram', 'type: strategy-tree', 'root: A', 'branches:', '  - B', '```', ''].join('\n'),
    });

    const [entry] = (await diff(config(base), base, head)).entries;
    expect(entry!.status).toBe('changed');
    expect(entry!.previousEngine).toBe('mermaid');
    expect(entry!.engine).toBe('d2');
  });

  it('un lado invalido se reporta pero no impide comparar el resto', async () => {
    const base = await tree({ 'a.md': ['```diagram', 'type: sequence', 'particpants: [A]', '```', '', '## Bueno', '', SECUENCIA, ''].join('\n') });
    const head = await tree({ 'a.md': `## Bueno\n\n${SECUENCIA}\n` });

    const result = await diff(config(base), base, head);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.side).toBe('base');
    expect(result.issues[0]!.line).toBe(1);
    expect(statusOf(result, 'Bueno')).toBe('unchanged');
  });

  it('un directorio vacio deja todo como nuevo', async () => {
    const base = await tree({});
    const head = await tree({ 'a.md': `## Uno\n\n${SECUENCIA}\n` });
    expect((await diff(config(base), base, head)).summary.added).toBe(1);
  });
});

describe('reporte legible', () => {
  it('omite los iguales salvo que se pidan', async () => {
    const base = await tree({ 'a.md': `## Uno\n\n${SECUENCIA}\n` });
    const head = await tree({ 'a.md': `## Uno\n\n${SECUENCIA}\n\n## Dos\n\n${SECUENCIA}\n` });
    const result = await diff(config(base), base, head);

    expect(formatDiff(result)).not.toContain('"Uno"');
    expect(formatDiff(result, { all: true })).toContain('"Uno"');
    expect(formatDiff(result)).toContain('+ ');
    expect(formatDiff(result)).toContain('1 nuevo(s)');
  });

  it('lo dice explicitamente cuando no cambio nada', async () => {
    const base = await tree({ 'a.md': `## Uno\n\n${SECUENCIA}\n` });
    expect(formatDiff(await diff(config(base), base, base))).toContain('sin cambios en los diagramas');
  });

  it('los bloques ilegibles salen como aviso', async () => {
    const base = await tree({ 'a.md': ['```diagram', 'type: sequence', 'particpants: [A]', '```', ''].join('\n') });
    const head = await tree({ 'a.md': `## Uno\n\n${SECUENCIA}\n` });
    expect(formatDiff(await diff(config(base), base, head))).toContain('AVISO [base]');
  });
});

describe('docviz diff', () => {
  let out = '';
  let err = '';

  beforeEach(() => {
    out = '';
    err = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      err += String(chunk);
      return true;
    });
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('imprime el reporte y termina en cero por defecto', async () => {
    const base = await tree({ 'a.md': `## Uno\n\n${SECUENCIA}\n` });
    const head = await tree({ 'a.md': `## Uno\n\n${SECUENCIA_AMPLIADA}\n` });

    expect(await run(['node', 'docviz', 'diff', base, head])).toBe(0);
    expect(out).toContain('~ a.md');
    expect(out).toContain('1 modificado(s)');
    expect(err).toBe('');
  });

  it('con --json devuelve la estructura completa', async () => {
    const base = await tree({ 'a.md': `## Uno\n\n${SECUENCIA}\n` });
    const head = await tree({ 'a.md': `## Uno\n\n${SECUENCIA_AMPLIADA}\n` });

    await run(['node', 'docviz', 'diff', base, head, '--json']);
    const parsed = JSON.parse(out) as DiffResult;
    expect(parsed.summary.changed).toBe(1);
    expect(parsed.entries[0]!.title).toBe('Uno');
  });

  it('con --exit-code falla si algo cambio y pasa si no', async () => {
    const base = await tree({ 'a.md': `## Uno\n\n${SECUENCIA}\n` });
    const head = await tree({ 'a.md': `## Uno\n\n${SECUENCIA_AMPLIADA}\n` });

    expect(await run(['node', 'docviz', 'diff', base, head, '--exit-code'])).toBe(1);
    process.exitCode = undefined;
    expect(await run(['node', 'docviz', 'diff', base, base, '--exit-code'])).toBe(0);
  });
});

describe('docviz_diff (MCP)', () => {
  it('devuelve solo lo que cambio, con el resumen completo', async () => {
    const root = await tree({
      'anterior/a.md': `## Uno\n\n${SECUENCIA}\n\n## Dos\n\n${SECUENCIA}\n`,
      'nueva/a.md': `## Uno\n\n${SECUENCIA_AMPLIADA}\n\n## Dos\n\n${SECUENCIA}\n`,
    });

    const result = await diffDocuments({ cwd: root, base: 'anterior', head: 'nueva' });

    expect(result.ok).toBe(true);
    expect(result['summary']).toEqual({ added: 0, removed: 0, changed: 1, unchanged: 1 });
    // Los iguales no viajan: son la mayoria y no responden a "que cambio".
    expect(result['entries']).toHaveLength(1);
    expect((result['entries'] as Array<{ title: string }>)[0]!.title).toBe('Uno');
  });

  it('un directorio inexistente vuelve como dato, no como excepcion', async () => {
    const root = await tree({ 'nueva/a.md': `## Uno\n\n${SECUENCIA}\n` });
    const result = await diffDocuments({ cwd: root, base: 'no-existe', head: 'nueva' });
    expect(result.ok).toBe(true);
    expect(result['summary']).toMatchObject({ added: 1, removed: 0, changed: 0 });
  });
});
