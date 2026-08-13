/**
 * Pruebas de la CLI.
 *
 * Se invoca `run()` en proceso capturando stdout/stderr y el codigo de salida,
 * sobre proyectos temporales que no requieren renderizar.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run } from '../../src/cli.js';

const temps: string[] = [];
let out: string;
let err: string;
let cwd: string;

async function project(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'docviz-cli-'));
  temps.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return root;
}

beforeEach(() => {
  out = '';
  err = '';
  cwd = process.cwd();
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
  process.chdir(cwd);
  process.exitCode = undefined;
});

afterAll(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});

async function cli(...args: string[]): Promise<number> {
  return run(['node', 'docviz', ...args]);
}

describe('docviz types', () => {
  it('lista los tipos del DSL y los temas', async () => {
    expect(await cli('types')).toBe(0);
    expect(out).toContain('```diagram```');
    expect(out).toContain('sequence');
    expect(out).toContain('strategy-tree');
    expect(out).toContain('```chart```');
    expect(out).toContain('bar');
    expect(out).toContain('```architecture```');
    expect(out).toContain('c4-context');
    expect(out).toContain('temas: default, corporate, executive, dark');
  });
});

describe('docviz check', () => {
  it('acepta un proyecto valido', async () => {
    const root = await project({
      'docs-src/a.md': '## Uno\n\n```d2\nA -> B\n```\n',
      'docs-src/b.md': '## Dos\n\n```chart\ntype: bar\ndata:\n  - label: A\n    value: 1\n```\n',
    });
    process.chdir(root);
    expect(await cli('check')).toBe(0);
    expect(out).toContain('bloques:    2');
    expect(out).toContain('check OK');
  });

  it('con --verbose detalla cada bloque y su motor', async () => {
    const root = await project({ 'docs-src/a.md': '## Uno\n\n```d2\nA -> B\n```\n' });
    process.chdir(root);
    await cli('check', '--verbose');
    expect(out).toContain('d2 -> d2');
    expect(out).toContain('"Uno"');
  });

  it('falla con codigo 1 y reporta el bloque roto', async () => {
    const root = await project({
      'docs-src/a.md': '## Uno\n\n```chart\ntype: radar\ndata: []\n```\n',
    });
    process.chdir(root);
    expect(await cli('check')).toBe(1);
    expect(err).toContain('ERROR');
    expect(err).toContain('a.md');
    expect(err).toContain('radar');
  });

  it('acepta un directorio de origen explicito', async () => {
    const root = await project({ 'fuentes/a.md': '## Uno\n\n```d2\nA -> B\n```\n' });
    process.chdir(root);
    expect(await cli('check', 'fuentes')).toBe(0);
    expect(out).toContain('bloques:    1');
  });

  it('informa de un tema inexistente sin trazas de pila', async () => {
    const root = await project({
      'docs-src/a.md': '# x\n',
      'docviz.config.yaml': 'theme:\n  name: neon\n',
    });
    process.chdir(root);
    expect(await cli('check')).toBe(1);
    expect(err).toContain('ERROR');
    expect(err).toContain('neon');
    expect(err).not.toContain('at Object');
  });
});

describe('docviz verify', () => {
  it('acepta una salida correcta', async () => {
    const root = await project({
      'docs/doc.md': '![D](./assets/generated/a.svg)\n',
      'docs/assets/generated/a.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
    });
    process.chdir(root);
    expect(await cli('verify')).toBe(0);
    expect(out).toContain('verify OK');
  });

  it('falla si hay una imagen rota', async () => {
    const root = await project({ 'docs/doc.md': '![D](./assets/generated/falta.svg)\n' });
    process.chdir(root);
    expect(await cli('verify')).toBe(1);
    expect(err).toContain('no existe');
  });

  it('falla si quedo un bloque declarativo sin compilar', async () => {
    const root = await project({ 'docs/doc.md': '```d2\nA -> B\n```\n' });
    process.chdir(root);
    expect(await cli('verify')).toBe(1);
    expect(err).toContain('sin compilar');
  });
});

describe('docviz build', () => {
  it('compila, informa estadisticas y respeta --theme', async () => {
    const root = await project({ 'docs-src/a.md': '## Uno\n\n```d2\nA -> B\n```\n' });
    process.chdir(root);
    expect(await cli('build', 'docs-src', '--output', 'salida', '--theme', 'dark', '--verbose')).toBe(0);
    expect(out).toContain('diagramas:       1');
    expect(out).toContain('regenerados:     1');
    expect(out).toContain('tema:            dark');
    expect(out).toContain('render  d2');
  });

  it('falla y reporta cuando un diagrama es invalido', async () => {
    const root = await project({
      'docs-src/a.md': '## Uno\n\n```graphviz\ndigraph { roto ->> ][\n```\n',
    });
    process.chdir(root);
    expect(await cli('build')).toBe(1);
    expect(err).toContain('ERROR');
    expect(err).toContain('renderer: graphviz');
  });

  it('con --continue-on-error termina en 1 pero deja salida', async () => {
    const root = await project({
      'docs-src/a.md': '## Bueno\n\n```d2\nA -> B\n```\n\n## Malo\n\n```graphviz\ndigraph { ][\n```\n',
    });
    process.chdir(root);
    expect(await cli('build', '--continue-on-error')).toBe(1);
    expect(err).toContain('--continue-on-error activo');
    expect(out).toContain('documentos:      1');
  });

  it('rechaza un backend invalido', async () => {
    const root = await project({ 'docs-src/a.md': '# x\n' });
    process.chdir(root);
    expect(await cli('build', '--backend', 'nube')).toBe(1);
    expect(err).toContain('local');
  });
});

describe('docviz types con metadatos', () => {
  it('muestra el proposito de cada tipo, no solo su nombre', async () => {
    expect(await cli('types')).toBe(0);
    expect(out).toContain('sequence');
    expect(out).toContain('Quien habla con quien y en que orden');
    expect(out).toContain('docviz suggest');
  });

  it('--short vuelve al listado escueto', async () => {
    await cli('types', '--short');
    expect(out).toContain('- sequence');
    expect(out).not.toContain('Quien habla con quien');
  });

  it('--json entrega el catalogo completo', async () => {
    await cli('types', '--json');
    const parsed = JSON.parse(out) as { types: Array<{ type: string; whenNotToUse: string }>; themes: string[] };
    expect(parsed.types.length).toBeGreaterThan(40);
    expect(parsed.themes).toContain('corporate');
    expect(parsed.types[0]!.whenNotToUse).toBeTruthy();
  });

  it('muestra la ficha de un tipo concreto con su ejemplo', async () => {
    expect(await cli('types', 'bpmn')).toBe(0);
    expect(out).toContain('cuando usarlo:');
    expect(out).toContain('cuando no:');
    expect(out).toContain('type: bpmn');
  });

  it('resuelve un alias', async () => {
    await cli('types', 'uml-sequence');
    expect(out).toContain('sequence  (diagram, plantuml)');
  });

  it('falla con un tipo inexistente y lista los validos', async () => {
    expect(await cli('types', 'mandala')).toBe(1);
    expect(err).toContain('strategy-tree');
  });
});

describe('docviz suggest', () => {
  it('recomienda a partir de una frase y devuelve el bloque', async () => {
    expect(await cli('suggest', 'el', 'proceso', 'de', 'aprobacion', 'para', 'auditoria', '-n', '1')).toBe(0);
    expect(out).toContain('bpmn');
    expect(out).toContain('```diagram');
    expect(out).toContain('cuando no:');
  });

  it('--json entrega el resultado estructurado', async () => {
    await cli('suggest', 'comparar', 'defectos', 'por', 'sprint', '--json');
    const parsed = JSON.parse(out) as { ok: boolean; matches: Array<{ type: string }> };
    expect(parsed.ok).toBe(true);
    expect(parsed.matches.length).toBeGreaterThan(0);
  });

  it('aconseja no dibujar cuando nada encaja', async () => {
    expect(await cli('suggest', 'zzzz', 'qqqq')).toBe(0);
    expect(out).toContain('tabla');
  });
});
