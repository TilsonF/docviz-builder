/**
 * Prueba de cache (seccion 21).
 *
 * Escenario exigido:
 *   1. build -> N diagramas regenerados
 *   2. build sin cambios -> 0 regenerados, N cache hits
 *   3. cambiar un solo diagrama -> 1 regenerado, N-1 cache hits
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildProject, cleanupProjects, listAssets, makeProject } from './helpers.js';

afterAll(cleanupProjects);

const DOC = (etiqueta: string): string =>
  [
    '## Uno',
    '',
    '```d2',
    'A -> B',
    '```',
    '',
    '## Dos',
    '',
    '```graphviz',
    'digraph { X -> Y; }',
    '```',
    '',
    '## Tres',
    '',
    '```vega-lite',
    `{"data": {"values": [{"a": "${etiqueta}", "b": 3}]},`,
    ' "mark": "bar",',
    ' "encoding": {"x": {"field": "a", "type": "nominal"},',
    '              "y": {"field": "b", "type": "quantitative"}}}',
    '```',
    '',
  ].join('\n');

describe('cache de recursos', () => {
  it('regenera todo la primera vez, nada la segunda y solo lo cambiado la tercera', async () => {
    const root = await makeProject({ 'doc.md': DOC('inicial') });

    // 1. Primera compilacion: todo se genera.
    const first = await buildProject(root);
    expect(first.errors).toEqual([]);
    expect(first.stats.blocks).toBe(3);
    expect(first.stats.generated).toBe(3);
    expect(first.stats.cacheHits).toBe(0);
    const assetsAfterFirst = await listAssets(root);
    expect(assetsAfterFirst).toHaveLength(3);

    // 2. Sin tocar nada: cero regenerados, todo son aciertos de cache.
    const second = await buildProject(root);
    expect(second.stats.generated).toBe(0);
    expect(second.stats.cacheHits).toBe(3);
    expect(await listAssets(root)).toEqual(assetsAfterFirst);

    // 3. Se modifica un unico diagrama.
    const source = path.join(root, 'docs-src', 'doc.md');
    await writeFile(source, DOC('modificado'), 'utf8');
    const third = await buildProject(root);
    expect(third.stats.generated).toBe(1);
    expect(third.stats.cacheHits).toBe(2);

    // El recurso viejo ya no se referencia y aparece uno nuevo.
    const assetsAfterThird = await listAssets(root);
    const nuevos = assetsAfterThird.filter((a) => !assetsAfterFirst.includes(a));
    expect(nuevos).toHaveLength(1);
  });

  it('el resultado es deterministico byte a byte entre ejecuciones', async () => {
    const root = await makeProject({ 'doc.md': DOC('estable') });
    await buildProject(root);
    const assets = await listAssets(root);
    const before = await Promise.all(
      assets.map((a) => readFile(path.join(root, 'docs', 'assets', 'generated', a))),
    );

    // Se fuerza el re-render ignorando el cache; los bytes deben coincidir.
    const again = await buildProject(root, {}, { cache: { enabled: false, dir: '.docviz-cache' } });
    expect(again.stats.cacheHits).toBe(0);
    expect(await listAssets(root)).toEqual(assets);
    const after = await Promise.all(
      assets.map((a) => readFile(path.join(root, 'docs', 'assets', 'generated', a))),
    );
    for (let i = 0; i < assets.length; i += 1) {
      expect(after[i]!.equals(before[i]!)).toBe(true);
    }
  });

  it('cambiar el tema invalida el cache', async () => {
    const root = await makeProject({ 'doc.md': DOC('tema') });
    const first = await buildProject(root);
    expect(first.stats.generated).toBe(3);

    const second = await buildProject(root, {}, { theme: { name: 'dark' } });
    expect(second.stats.cacheHits).toBe(0);
    expect(second.stats.generated).toBe(3);

    // Y volver al tema original vuelve a acertar en el cache.
    const third = await buildProject(root);
    expect(third.stats.generated).toBe(0);
    expect(third.stats.cacheHits).toBe(3);
  });

  it('--clean borra la salida pero conserva los aciertos de cache', async () => {
    const root = await makeProject({ 'doc.md': DOC('limpio') });
    await buildProject(root);
    const cleaned = await buildProject(root, { clean: true });
    expect(cleaned.stats.generated).toBe(0);
    expect(cleaned.stats.cacheHits).toBe(3);
    expect(await listAssets(root)).toHaveLength(3);
  });

  it('el mismo diagrama repetido en dos documentos comparte recurso', async () => {
    const root = await makeProject({
      'a.md': '## Uno\n\n```d2\nA -> B\n```\n',
      'b.md': '## Uno\n\n```d2\nA -> B\n```\n',
    });
    const result = await buildProject(root);
    expect(result.stats.blocks).toBe(2);
    // El segundo bloque es identico: se resuelve por cache y comparte archivo.
    expect(result.stats.generated).toBe(1);
    expect(result.stats.cacheHits).toBe(1);
    expect(await listAssets(root)).toHaveLength(1);
  });
});
