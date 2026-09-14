/**
 * Pruebas del modelo de arquitectura compartido.
 *
 * Documentar un sistema son tres vistas —contexto, contenedores, componentes— y
 * hasta ahora cada bloque repetia sus elementos. A los tres meses las tres
 * vistas del mismo sistema ya no coinciden y nadie sabe cual es la buena.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { compileDsl, resolverModelo } from '../../src/dsl/index.js';
import { DslValidationError } from '../../src/core/errors.js';

const temps: string[] = [];

const MODELO = [
  'elements:',
  '  - id: cliente',
  '    kind: person',
  '    name: Cliente',
  '  - id: plataforma',
  '    kind: system',
  '    name: Plataforma',
  '  - id: api',
  '    kind: container',
  '    name: API',
  '    parent: plataforma',
  '  - id: bd',
  '    kind: container',
  '    name: Base de datos',
  '    parent: plataforma',
  'relations:',
  '  - from: cliente',
  '    to: plataforma',
  '    label: Usa',
  '  - from: api',
  '    to: bd',
  '    label: SQL',
].join('\n');

async function proyecto(archivos: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'docviz-modelo-'));
  temps.push(root);
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'sistema.model.yaml'), MODELO, 'utf8');
  for (const [relativo, contenido] of Object.entries(archivos)) {
    await writeFile(path.join(root, relativo), contenido, 'utf8');
  }
  return root;
}

const contextoDe = (root: string) => ({ baseDir: path.join(root, 'docs'), root });

const vista = (...lineas: string[]): string =>
  ['type: c4-container', 'model: ./sistema.model.yaml', ...lineas].join('\n');

afterAll(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});

describe('una vista del modelo', () => {
  it('sin filtro enseña el modelo entero', async () => {
    const root = await proyecto();
    const compiled = compileDsl('architecture', vista(), () => true, contextoDe(root));
    for (const nombre of ['Cliente', 'Plataforma', 'API', 'Base de datos']) {
      expect(compiled.source, nombre).toContain(nombre);
    }
  });

  it('`include` deja solo lo que se pide', async () => {
    const root = await proyecto();
    const compiled = compileDsl('architecture', vista('include: [cliente, plataforma]'), () => true, contextoDe(root));
    expect(compiled.source).toContain('Cliente');
    expect(compiled.source).not.toContain('Base de datos');
  });

  it('`exclude` quita lo que estorba', async () => {
    const root = await proyecto();
    const compiled = compileDsl('architecture', vista('exclude: [bd]'), () => true, contextoDe(root));
    expect(compiled.source).toContain('API');
    expect(compiled.source).not.toContain('Base de datos');
  });

  it('una relacion con un extremo fuera de la vista no se dibuja', async () => {
    // Una flecha colgando de algo que no se ve confunde mas que omitirla.
    const root = await proyecto();
    const doc: Record<string, unknown> = { type: 'c4-context', model: './sistema.model.yaml', include: ['api', 'plataforma'] };
    resolverModelo(doc, contextoDe(root));
    // `api -> bd` se cae porque `bd` no esta; `cliente -> plataforma` tampoco.
    expect(doc['relations']).toEqual([]);
  });

  it('un padre que se queda fuera deja de referenciarse', async () => {
    // Si no, el compilador fallaria por una referencia que el autor no escribio.
    const root = await proyecto();
    const doc: Record<string, unknown> = { type: 'c4-container', model: './sistema.model.yaml', include: ['api'] };
    resolverModelo(doc, contextoDe(root));
    expect((doc['elements'] as Array<Record<string, unknown>>)[0]!['parent']).toBeUndefined();
  });

  it('el bloque puede añadir lo suyo al modelo compartido', async () => {
    // Una vista concreta puede necesitar un sistema externo que no pertenece al
    // modelo comun.
    const root = await proyecto();
    const compiled = compileDsl(
      'architecture',
      vista('elements:', '  - id: correo', '    kind: system', '    name: Servicio de correo'),
      () => true,
      contextoDe(root),
    );
    expect(compiled.source).toContain('Servicio de correo');
    expect(compiled.source).toContain('Cliente');
  });

  it('no genera avisos de campo desconocido', async () => {
    // `model`, `include` y `exclude` son del bloque, no del tipo.
    const root = await proyecto();
    const compiled = compileDsl('architecture', vista('include: [cliente, plataforma]'), () => true, contextoDe(root));
    expect(compiled.warnings).toBeUndefined();
  });

  it('tres vistas del mismo modelo, tres dibujos distintos', async () => {
    const root = await proyecto();
    const ctx = contextoDe(root);
    const contexto = compileDsl('architecture', 'type: c4-context\nmodel: ./sistema.model.yaml\ninclude: [cliente, plataforma]', () => true, ctx);
    const contenedores = compileDsl('architecture', vista('exclude: [cliente]'), () => true, ctx);

    expect(contexto.source).not.toBe(contenedores.source);
    expect(contexto.source).not.toContain('Base de datos');
    expect(contenedores.source).toContain('Base de datos');
  });
});

describe('lo que se rechaza', () => {
  const fallar = async (lineas: string[]): Promise<DslValidationError> => {
    const root = await proyecto();
    try {
      compileDsl('architecture', vista(...lineas), () => true, contextoDe(root));
    } catch (err) {
      return err as DslValidationError;
    }
    throw new Error('se esperaba un error y no lo hubo');
  };

  it('un identificador que no esta en el modelo, listando los que si', async () => {
    const err = await fallar(['include: [inventado]']);
    expect(err.message).toContain('"inventado" no existe');
    expect(err.detail).toContain('api, bd, cliente, plataforma');
  });

  it('una vista que se queda sin nada que dibujar', async () => {
    const err = await fallar(['include: [cliente]', 'exclude: [cliente]']);
    expect(err.message).toContain('sin elementos');
  });

  it('un modelo que no existe', async () => {
    const root = await proyecto();
    let err: DslValidationError | undefined;
    try {
      compileDsl('architecture', 'type: c4-context\nmodel: ./no-esta.yaml', () => true, contextoDe(root));
    } catch (e) {
      err = e as DslValidationError;
    }
    expect(err?.message).toContain('no se encuentra');
  });

  it('un modelo vacio', async () => {
    const root = await proyecto({ 'docs/vacio.yaml': 'elements: []\n' });
    let err: DslValidationError | undefined;
    try {
      compileDsl('architecture', 'type: c4-context\nmodel: ./vacio.yaml', () => true, contextoDe(root));
    } catch (e) {
      err = e as DslValidationError;
    }
    expect(err?.message).toContain('no declara ningun elemento');
  });

  it('una URL, igual que en los datos', async () => {
    let err: DslValidationError | undefined;
    try {
      resolverModelo({ model: 'https://ejemplo.test/m.yaml' }, { baseDir: '/tmp/docs', root: '/tmp' });
    } catch (e) {
      err = e as DslValidationError;
    }
    expect(err?.message).toContain('no admite URLs');
  });

  it('una ruta que sale del arbol de origen', async () => {
    let err: DslValidationError | undefined;
    try {
      resolverModelo({ model: '../../../../etc/passwd.yaml' }, { baseDir: '/tmp/docs', root: '/tmp' });
    } catch (e) {
      err = e as DslValidationError;
    }
    expect(err?.message).toContain('fuera del directorio de origen');
  });

  it('sin `model` no toca nada', () => {
    const doc: Record<string, unknown> = { type: 'c4-context', elements: [{ id: 'a', name: 'A' }] };
    resolverModelo(doc, { baseDir: '/tmp/docs', root: '/tmp' });
    expect(doc['elements']).toEqual([{ id: 'a', name: 'A' }]);
  });
});
