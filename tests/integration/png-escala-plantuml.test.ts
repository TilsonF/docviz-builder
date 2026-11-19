/**
 * `renderers.png.scale` tambien vale para PlantUML.
 *
 * PlantUML dibuja su PNG nativo y no pasa por el rasterizador, asi que hasta
 * ahora salia siempre a 96 ppp: con `scale: 2`, las secuencias y actividades de
 * un documento quedaban a la mitad de resolucion que los C4 o los d2 de al
 * lado. Se compila el mismo diagrama a dos escalas y se mide el PNG escrito.
 */

import { afterAll, describe, expect, it } from 'vitest';
import {
  buildProject,
  cleanupProjects,
  configFor,
  listAssets,
  makeProject,
  readAssetBytes,
} from './helpers.js';

afterAll(cleanupProjects);

const DOC = [
  '```plantuml',
  '@startuml',
  'actor Usuario',
  'participant API',
  'Usuario -> API: POST /login',
  'API --> Usuario: Token',
  '@enduml',
  '```',
  '',
].join('\n');

/** Ancho y alto del PNG, leidos de su cabecera IHDR. */
function pngSize(png: Buffer): { width: number; height: number } {
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

async function pngAt(scale: number): Promise<{ name: string; width: number; height: number }> {
  const root = await makeProject({ 'src/doc.md': DOC });
  const base = configFor(root);
  const result = await buildProject(
    root,
    {},
    {
      formats: { ...base.formats, plantuml: 'png' },
      renderers: { ...base.renderers, png: { ...base.renderers.png, scale } },
    },
  );
  expect(result.errors).toEqual([]);
  const assets = await listAssets(root);
  expect(assets).toHaveLength(1);
  return { name: assets[0]!, ...pngSize(await readAssetBytes(root, assets[0]!)) };
}

describe('renderers.png.scale con PlantUML', () => {
  it('a escala 2 el PNG sale al doble que a escala 1', async () => {
    const uno = await pngAt(1);
    const dos = await pngAt(2);

    // PlantUML redondea cada medida al aplicar los ppp: se admite un margen de
    // un par de pixeles sobre el doble exacto.
    expect(Math.abs(dos.width - 2 * uno.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(dos.height - 2 * uno.height)).toBeLessThanOrEqual(2);
  });

  it('la escala entra en el nombre del recurso', async () => {
    // El mismo diagrama a otra densidad son bytes distintos: compartir nombre
    // haria que el cache sirviera la densidad anterior.
    const uno = await pngAt(1);
    const dos = await pngAt(2);
    expect(dos.name).not.toBe(uno.name);
  });
});
