/**
 * El icono, dibujado de verdad por D2.
 *
 * Las pruebas unitarias cubren la sustitucion sobre un SVG de mentira. Lo que
 * solo se puede comprobar dibujando es que el motor **reserve y situe** el
 * hueco: a D2 se le pasa una URL sentinela que no resuelve, y si algun dia
 * dejara de aceptarla o de colocar el `<image>`, el icono desapareceria sin
 * que ninguna prueba de texto se enterara.
 *
 * Se usa un pictograma generico y no una marca a proposito: los genericos
 * viajan en el paquete, asi que esto corre en CI sin red. Las marcas no, que
 * es justamente lo que esta prueba no debe dar por supuesto.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { buildProject, cleanupProjects, listAssets, makeProject, readAsset } from './helpers.js';

afterAll(cleanupProjects);

const DOC = [
  '```diagram',
  'type: strategy-tree',
  'title: Con icono',
  'root: Plataforma',
  'branches:',
  '  - name: Servidor',
  '    icon: server',
  '```',
  '',
].join('\n');

describe('iconos de extremo a extremo', () => {
  it('D2 reserva el hueco y DocViz lo rellena sin salir a la red', async () => {
    const root = await makeProject({ 'src/doc.md': DOC });
    await buildProject(root);
    const assets = await listAssets(root);
    expect(assets).toHaveLength(1);
    const svg = await readAsset(root, assets[0]!);

    // El dibujo esta dentro, como <svg> anidado.
    expect(svg).toContain('data-dv-icon="server"');
    // Y no queda rastro ni del hueco ni de ninguna referencia remota.
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('docviz.invalid');
    expect(svg).not.toMatch(/(?:xlink:)?href\s*=\s*"https?:/);
    // Con la geometria que calculo el motor, y sin deformarlo.
    expect(svg).toMatch(/data-dv-icon="server"|preserveAspectRatio="xMidYMid meet"/);
    expect(svg).not.toContain('preserveAspectRatio="none"');
  });

  it('un icono que no esta para la compilacion en lugar de dejar un hueco', async () => {
    const root = await makeProject({
      'src/doc.md': DOC.replace('icon: server', 'icon: marca-que-no-existe'),
    });
    const result = await buildProject(root, { continueOnError: true });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toMatch(/icono desconocido/);
    expect(result.errors[0]?.code).toBe('DV109');
    // Y no se escribe una figura con el hueco vacio.
    expect(await listAssets(root)).toEqual([]);
  });
});
