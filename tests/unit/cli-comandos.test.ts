/**
 * Pruebas de los comandos de la CLI que no cubre `cli.test.ts`.
 *
 * Aqui esta el cableado que decide codigos de salida y formatos: `doctor`,
 * `init`, `preview`, y las opciones de `build` que cambian donde y como se
 * escribe. Es codigo aburrido, y por eso mismo es donde una regresion pasa
 * desapercibida: nadie ejecuta `--clean` a mano antes de publicar.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run } from '../../src/cli.js';

const temps: string[] = [];
let out = '';
let err = '';
let cwdOriginal: string;
let sigintPrevios: Array<(...args: unknown[]) => void>;

async function proyecto(archivos: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'docviz-clic-'));
  temps.push(root);
  for (const [relativo, contenido] of Object.entries(archivos)) {
    const destino = path.join(root, relativo);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, contenido, 'utf8');
  }
  return root;
}

const cli = async (...args: string[]): Promise<number> => run(['node', 'docviz', ...args]);

beforeEach(() => {
  out = '';
  err = '';
  cwdOriginal = process.cwd();
  sigintPrevios = process.listeners('SIGINT') as Array<(...args: unknown[]) => void>;
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
  process.chdir(cwdOriginal);
  process.exitCode = undefined;
  // El comando `preview` deja un oyente de SIGINT; se retira solo el suyo para
  // no tocar los que el runner tuviera puestos.
  for (const oyente of process.listeners('SIGINT') as Array<(...args: unknown[]) => void>) {
    if (!sigintPrevios.includes(oyente)) process.removeListener('SIGINT', oyente);
  }
});

afterAll(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});

// --------------------------------------------------------------------------

describe('docviz doctor', () => {
  /** Configuracion sin motores: el resultado no depende de la maquina. */
  const SIN_MOTORES = [
    'source: docs-src',
    'renderers:',
    '  plantuml: { enabled: false }',
    '  mermaid: { enabled: false }',
    '  bpmn: { enabled: false }',
  ].join('\n');

  it('falla con codigo 1 cuando hay tipos que no se pueden dibujar', async () => {
    const root = await proyecto({ 'docviz.config.yaml': SIN_MOTORES });

    expect(await cli('doctor', '-c', path.join(root, 'docviz.config.yaml'))).toBe(1);
    expect(out).toContain('Entorno');
    expect(out).toContain('no se pueden dibujar:');
    expect(out).toContain('Falta algo del entorno');
  });

  it('--json entrega el diagnostico estructurado', async () => {
    const root = await proyecto({ 'docviz.config.yaml': SIN_MOTORES });
    await cli('doctor', '-c', path.join(root, 'docviz.config.yaml'), '--json');

    const d = JSON.parse(out) as { ok: boolean; requisitos: Array<{ nombre: string }>; imposibles: unknown[] };
    expect(d.ok).toBe(false);
    expect(d.requisitos.map((q) => q.nombre)).toContain('Node.js');
    expect(d.imposibles.length).toBeGreaterThan(0);
  });

  it('sin -c usa la configuracion que encuentre', async () => {
    const root = await proyecto({ 'docviz.config.yaml': SIN_MOTORES });
    process.chdir(root);
    expect(await cli('doctor')).toBe(1);
    expect(out).toContain('Motores');
  });
});

describe('docviz init', () => {
  it('prepara el proyecto e informa de lo creado', async () => {
    const root = await proyecto();
    process.chdir(root);

    expect(await cli('init')).toBe(0);
    expect(out).toContain('Creados:');
    expect(out).toContain('Tema: default');
    expect(existsSync(path.join(root, 'AGENTS.md'))).toBe(true);
    expect(await readFile(path.join(root, 'docviz.config.yaml'), 'utf8')).toContain('name: default');
  });

  it('respeta lo que ya existe y ofrece --force', async () => {
    const root = await proyecto({ 'AGENTS.md': 'mio' });
    process.chdir(root);
    await cli('init');

    expect(out).toContain('Ya existian, no se tocaron:');
    expect(out).toContain('--force');
    expect(await readFile(path.join(root, 'AGENTS.md'), 'utf8')).toBe('mio');
  });

  it('con --force y un tema concreto sobrescribe', async () => {
    const root = await proyecto({ 'AGENTS.md': 'mio' });
    process.chdir(root);
    await cli('init', '--force', '-t', 'dark');

    expect(await readFile(path.join(root, 'AGENTS.md'), 'utf8')).toContain('DocViz');
    expect(await readFile(path.join(root, 'docviz.config.yaml'), 'utf8')).toContain('name: dark');
  });

  it('rechaza un tema inexistente sin escribir nada', async () => {
    const root = await proyecto();
    process.chdir(root);

    expect(await cli('init', '-t', 'neon')).toBe(1);
    expect(err).toContain('el tema "neon" no existe');
    expect(existsSync(path.join(root, 'AGENTS.md'))).toBe(false);
  });
});

describe('docviz setup', () => {
  it('encuentra el jar ya descargado y no vuelve a bajarlo', async () => {
    // La prueba no toca la red: el jar del propio repositorio ya esta ahi, y lo
    // que se comprueba es que el comando exista y apunte al sitio correcto.
    expect(await cli('setup')).toBe(0);
    expect(out).toContain('plantuml.jar ya presente');
    expect(out).toContain(path.join('vendor', 'plantuml.jar'));
  });
});

describe('docviz skill', () => {
  it('instala el contrato en el directorio de skills del proyecto', async () => {
    const root = await proyecto();
    process.chdir(root);

    expect(await cli('skill')).toBe(0);
    expect(out).toContain('skill instalado en');
    expect(existsSync(path.join(root, '.claude', 'skills', 'docviz', 'SKILL.md'))).toBe(true);
  });

  it('no pisa uno anterior y acepta el directorio de otro agente', async () => {
    const root = await proyecto();
    process.chdir(root);
    await cli('skill');
    out = '';

    expect(await cli('skill')).toBe(0);
    expect(out).toContain('ya estaba instalado');

    out = '';
    await cli('skill', '--dir', '.agents/skills', '--force');
    expect(existsSync(path.join(root, '.agents', 'skills', 'docviz', 'SKILL.md'))).toBe(true);
  });
});

describe('docviz preview', () => {
  it('sirve el directorio y se detiene con Ctrl+C', async () => {
    const root = await proyecto({ 'docs/a.md': '# Hola\n' });
    const pendiente = cli('preview', path.join(root, 'docs'), '-p', '0');

    await vi.waitFor(() => expect(out).toContain('previsualizacion en http://127.0.0.1:'));
    expect(out).toContain('Ctrl+C');

    process.emit('SIGINT');
    expect(await pendiente).toBe(0);
  });
});

describe('opciones de build', () => {
  const BLOQUE = '## Uno\n\n```d2\nA -> B\n```\n';

  it('--output y --clean escriben donde se les dice y vacian antes', async () => {
    const root = await proyecto({ 'docs-src/a.md': BLOQUE, 'salida/basura.md': 'sobra' });
    process.chdir(root);

    expect(await cli('build', 'docs-src', '--output', 'salida', '--clean')).toBe(0);
    expect(out).toContain('limpieza:');
    expect(existsSync(path.join(root, 'salida', 'a.md'))).toBe(true);
    expect(existsSync(path.join(root, 'salida', 'basura.md'))).toBe(false);
  });

  it('--verbose y --no-cache vuelven a dibujarlo todo', async () => {
    const root = await proyecto({ 'docs-src/a.md': BLOQUE });
    process.chdir(root);

    await cli('build', 'docs-src', '--output', 'docs');
    out = '';
    expect(await cli('build', 'docs-src', '--output', 'docs', '--no-cache', '--verbose')).toBe(0);

    expect(out).toContain('render');
    expect(out).toContain('cache hits:      0');
  });

  it('avisa por stderr de un campo que el diagrama ignoro', async () => {
    const root = await proyecto({
      'docs-src/a.md': ['## Uno', '', '```diagram', 'type: strategy-tree', 'root: Objetivo', 'branches:', '  - Una', 'notas: sobra', '```', ''].join('\n'),
    });
    process.chdir(root);

    expect(await cli('build', 'docs-src', '--output', 'docs')).toBe(0);
    expect(err).toContain('[DV104]');
    expect(err).toContain('"notas"');
  });

  it('un origen que coincide con la salida se rechaza sin traza de pila', async () => {
    const root = await proyecto({ 'docs-src/a.md': BLOQUE });
    process.chdir(root);

    expect(await cli('build', 'docs-src', '--output', 'docs-src')).toBe(1);
    expect(err).toContain('el directorio de salida no puede ser el mismo que el de origen');
    expect(err).not.toContain('at Object');
  });
});

describe('configuracion explicita', () => {
  it('check y verify aceptan -c', async () => {
    const root = await proyecto({
      'docviz.config.yaml': 'source: fuentes\noutput:\n  dir: compilado\n',
      'fuentes/a.md': '## Uno\n\n```d2\nA -> B\n```\n',
    });
    const config = path.join(root, 'docviz.config.yaml');

    expect(await cli('check', '-c', config)).toBe(0);
    expect(out).toContain('check OK');

    out = '';
    expect(await cli('build', '-c', config)).toBe(0);
    out = '';
    expect(await cli('verify', '-c', config)).toBe(0);
    expect(out).toContain('verify OK');
  });

  it('un archivo de configuracion inexistente se reporta como error, no como excepcion', async () => {
    expect(await cli('check', '-c', path.join(tmpdir(), 'no-existe-docviz.yaml'))).toBe(1);
    expect(err).toContain('no se encuentra el archivo de configuracion');
    expect(err).toContain('codigo: DV004');
  });
});

describe('salidas menores', () => {
  it('types <tipo> --json entrega la ficha completa', async () => {
    expect(await cli('types', 'sequence', '--json')).toBe(0);
    const spec = JSON.parse(out) as { type: string; engine: string; example: string };
    expect(spec).toMatchObject({ type: 'sequence', engine: 'plantuml' });
    expect(spec.example).toContain('participants');
  });

  it('la ficha de un tipo con respaldo lo menciona', async () => {
    expect(await cli('types', 'flow')).toBe(0);
    expect(out).toContain('respaldo:');
    expect(out).toContain('d2');
  });

  it('un fallo que no es de DocViz se reporta como inesperado, sin romper el proceso', async () => {
    // Un package.json corrupto revienta dentro de JSON.parse: no es un error
    // del dominio, y aun asi la CLI tiene que terminar ordenadamente.
    const root = await proyecto({ 'package.json': '{ esto no es JSON' });
    process.chdir(root);

    expect(await cli('init')).toBe(1);
    expect(err).toContain('ERROR inesperado');
  });

  it('suggest sin contenido falla, tambien en JSON', async () => {
    expect(await cli('suggest', '   ')).toBe(1);
    expect(err).toContain('describe en una frase');

    err = '';
    out = '';
    expect(await cli('suggest', '   ', '--json')).toBe(1);
    expect(JSON.parse(out)).toMatchObject({ ok: false });
  });
});
