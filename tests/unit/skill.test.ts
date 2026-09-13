/**
 * Pruebas de la instalacion del skill.
 *
 * Un agente solo abre `AGENTS.md` si ya esta trabajando en ese repositorio. El
 * skill es lo que hace que sepa que DocViz existe antes de eso, asi que lo que
 * se comprueba aqui es que acabe en el sitio donde su agente lo va a buscar.
 */

import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  formatearSkill,
  installSkill,
  readSkill,
  skillSourcePath,
  skillTargetDir,
} from '../../src/build/skill.js';

const temps: string[] = [];

async function proyecto(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'docviz-skill-'));
  temps.push(dir);
  return dir;
}

afterAll(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});

describe('el skill que se distribuye', () => {
  it('viaja dentro del paquete y declara nombre y descripcion', async () => {
    const texto = await readSkill();
    expect(texto.startsWith('---\n')).toBe(true);
    expect(texto).toMatch(/^name: docviz$/m);
    expect(texto).toMatch(/^description: .{80,}/m);
  });

  it('explica las tres vallas y como preguntar el tipo', async () => {
    const texto = await readSkill();
    for (const valla of ['`diagram`', '`chart`', '`architecture`']) expect(texto).toContain(valla);
    expect(texto).toContain('docviz suggest');
    expect(texto).toContain('docviz types');
  });

  it('trae la tabla de codigos, que es lo que permite reintentar', async () => {
    const texto = await readSkill();
    for (const codigo of ['DV101', 'DV104', 'DV105', 'DV106']) expect(texto).toContain(codigo);
  });
});

describe('donde se instala', () => {
  it('por defecto, en el proyecto', async () => {
    const root = await proyecto();
    expect(skillTargetDir({ cwd: root })).toBe(path.join(root, '.claude', 'skills'));
  });

  it('con --global, en el perfil del usuario', async () => {
    const root = await proyecto();
    expect(skillTargetDir({ cwd: root, global: true })).toBe(path.join(homedir(), '.claude', 'skills'));
  });

  it('con --dir, donde diga el agente que se use', async () => {
    const root = await proyecto();
    expect(skillTargetDir({ cwd: root, dir: '.config/opencode/skills' })).toBe(
      path.join(root, '.config', 'opencode', 'skills'),
    );
  });
});

describe('instalacion', () => {
  it('copia el skill y crea el arbol de directorios', async () => {
    const root = await proyecto();
    const result = await installSkill({ cwd: root });

    expect(result.escrito).toBe(true);
    expect(result.destino).toBe(path.join(root, '.claude', 'skills', 'docviz', 'SKILL.md'));
    expect(await readFile(result.destino, 'utf8')).toBe(await readFile(skillSourcePath(), 'utf8'));
  });

  it('no pisa una instalacion anterior salvo que se le pida', async () => {
    const root = await proyecto();
    const destino = path.join(root, '.claude', 'skills', 'docviz', 'SKILL.md');
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, 'el mio', 'utf8');

    const respetado = await installSkill({ cwd: root });
    expect(respetado).toMatchObject({ escrito: false, motivo: 'ya existe' });
    expect(await readFile(destino, 'utf8')).toBe('el mio');

    const forzado = await installSkill({ cwd: root, force: true });
    expect(forzado.escrito).toBe(true);
    expect(await readFile(destino, 'utf8')).toContain('name: docviz');
  });

  it('respeta el directorio de otro agente', async () => {
    const root = await proyecto();
    const result = await installSkill({ cwd: root, dir: '.agents/skills' });
    expect(result.destino).toBe(path.join(root, '.agents', 'skills', 'docviz', 'SKILL.md'));
  });
});

describe('informe', () => {
  it('distingue instalado de ya existente', () => {
    expect(formatearSkill({ destino: '/x/SKILL.md', escrito: true })).toContain('skill instalado en /x/SKILL.md');
    expect(formatearSkill({ destino: '/x/SKILL.md', escrito: false, motivo: 'ya existe' })).toContain('--force');
  });
});
