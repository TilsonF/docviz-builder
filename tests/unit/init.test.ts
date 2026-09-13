/**
 * Pruebas de `docviz init`.
 *
 * La promesa del comando es doble: dejar el proyecto listo y **no romper nada**
 * de lo que ya hubiera. La segunda mitad es la que importa, porque se ejecuta
 * sobre repositorios ajenos con archivos que no son nuestros.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { check } from '../../src/build/builder.js';
import { init, formatearInit, SCRIPTS, type InitResult } from '../../src/build/init.js';
import { defaultConfig } from '../../src/config/load.js';

const temps: string[] = [];

async function proyecto(archivos: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'docviz-init-'));
  temps.push(root);
  for (const [relativo, contenido] of Object.entries(archivos)) {
    await writeFile(path.join(root, relativo), contenido, 'utf8');
  }
  return root;
}

const ejecutar = async (root: string, force = false): Promise<InitResult> =>
  init({ cwd: root, theme: 'corporate', force });

afterAll(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});

describe('proyecto nuevo', () => {
  it('deja los cuatro archivos del flujo documentado', async () => {
    const root = await proyecto();
    const result = await ejecutar(root);

    expect(result.creados).toEqual([
      'docviz.config.yaml',
      'AGENTS.md',
      path.join('docs-src', 'arquitectura.md'),
      '.gitignore',
    ]);
    expect(result.omitidos).toEqual([]);
  });

  it('el tema elegido llega a la configuracion', async () => {
    const root = await proyecto();
    await ejecutar(root);
    expect(await readFile(path.join(root, 'docviz.config.yaml'), 'utf8')).toContain('name: corporate');
  });

  it('sin package.json propone todos los scripts', async () => {
    const result = await ejecutar(await proyecto());
    expect(result.scriptsPendientes).toEqual(SCRIPTS.map((s) => [s[0], s[1]]));
  });

  it('el AGENTS.md generado explica los codigos y los avisos', async () => {
    const root = await proyecto();
    await ejecutar(root);
    const texto = await readFile(path.join(root, 'AGENTS.md'), 'utf8');

    expect(texto).toContain('DV101');
    expect(texto).toContain('DV104');
    expect(texto).toContain('docviz diff');
  });

  it('el documento de ejemplo compila de verdad', async () => {
    const root = await proyecto();
    await ejecutar(root);

    // Si el ejemplo que se le entrega a un proyecto nuevo no fuera valido, la
    // primera experiencia con DocViz seria un error.
    const result = await check({ ...defaultConfig(root), rootDir: root });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.blocks).toBe(2);
  });
});

describe('proyecto que ya tiene cosas', () => {
  it('no sobrescribe lo que existe, lo informa', async () => {
    const root = await proyecto({ 'AGENTS.md': 'mis instrucciones', 'docviz.config.yaml': 'mio' });
    const result = await ejecutar(root);

    expect(result.omitidos).toContain('AGENTS.md');
    expect(result.omitidos).toContain('docviz.config.yaml');
    expect(result.creados).not.toContain('AGENTS.md');
    expect(await readFile(path.join(root, 'AGENTS.md'), 'utf8')).toBe('mis instrucciones');
  });

  it('con --force si los sustituye', async () => {
    const root = await proyecto({ 'AGENTS.md': 'mis instrucciones' });
    const result = await ejecutar(root, true);

    expect(result.creados).toContain('AGENTS.md');
    expect(result.omitidos).toEqual([]);
    expect(await readFile(path.join(root, 'AGENTS.md'), 'utf8')).toContain('DocViz');
  });

  it('amplia el .gitignore existente en lugar de reemplazarlo', async () => {
    const root = await proyecto({ '.gitignore': 'node_modules/\ndist/\n' });
    const result = await ejecutar(root);
    const texto = await readFile(path.join(root, '.gitignore'), 'utf8');

    expect(result.creados).toContain('.gitignore (ampliado)');
    expect(texto).toContain('node_modules/');
    expect(texto).toContain('.docviz-cache/');
  });

  it('no vuelve a anadir la entrada del cache si ya estaba', async () => {
    const root = await proyecto({ '.gitignore': 'node_modules/\n.docviz-cache/\n' });
    const result = await ejecutar(root);

    expect(result.omitidos).toContain('.gitignore');
    expect(await readFile(path.join(root, '.gitignore'), 'utf8')).toBe('node_modules/\n.docviz-cache/\n');
  });

  it('solo propone los scripts que faltan', async () => {
    const root = await proyecto({
      'package.json': JSON.stringify({ name: 'x', scripts: { 'docs:check': 'docviz check docs-src', test: 'vitest' } }),
    });
    const result = await ejecutar(root);
    const nombres = result.scriptsPendientes.map(([n]) => n);

    expect(nombres).not.toContain('docs:check');
    expect(nombres).toContain('docs:build');
    expect(nombres).toHaveLength(SCRIPTS.length - 1);
  });

  it('con todos los scripts puestos no propone ninguno', async () => {
    const root = await proyecto({
      'package.json': JSON.stringify({ scripts: Object.fromEntries(SCRIPTS.map(([n, c]) => [n, c])) }),
    });
    expect((await ejecutar(root)).scriptsPendientes).toEqual([]);
  });

  it('un package.json sin scripts se trata como si no tuviera ninguno', async () => {
    const root = await proyecto({ 'package.json': JSON.stringify({ name: 'x' }) });
    expect((await ejecutar(root)).scriptsPendientes).toHaveLength(SCRIPTS.length);
  });
});

describe('informe legible', () => {
  it('separa lo creado de lo respetado y sugiere --force', () => {
    const texto = formatearInit(
      { creados: ['AGENTS.md'], omitidos: ['docviz.config.yaml'], scriptsPendientes: [['docs:check', 'docviz check docs-src']] },
      'dark',
    );

    expect(texto).toContain('Creados:');
    expect(texto).toContain('+ AGENTS.md');
    expect(texto).toContain('Ya existian, no se tocaron:');
    expect(texto).toContain('--force');
    expect(texto).toContain('"docs:check": "docviz check docs-src"');
    expect(texto).toContain('Tema: dark');
  });

  it('sin nada que reportar no imprime secciones vacias', () => {
    const texto = formatearInit({ creados: [], omitidos: [], scriptsPendientes: [] }, 'default');

    expect(texto).not.toContain('Creados:');
    expect(texto).not.toContain('Ya existian');
    expect(texto).not.toContain('scripts');
    expect(texto).toContain('Siguientes pasos:');
  });
});
