/**
 * La compresion del PNG, en un build de verdad.
 *
 * Las pruebas unitarias comprueban la funcion sobre un PNG armado a mano. Lo
 * que solo se puede comprobar compilando es que el builder la aplique **antes**
 * de escribir y de cachear: si se colara despues, el archivo del disco y los
 * bytes del cache no serian los mismos y el primer acierto de cache
 * reintroduciria el PNG sin comprimir sin que nada lo dijera.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { findBrowser } from '../../src/renderers/browser.js';
import { optimizarPng } from '../../src/core/png.js';
import {
  buildProject,
  cleanupProjects,
  configFor,
  listAssets,
  makeProject,
  readAssetBytes,
} from './helpers.js';

afterAll(cleanupProjects);

const DOC = ['```d2', 'Cliente -> Servicio: consulta', 'Servicio -> Base: lee', '```', ''].join('\n');

describe('renderers.png.optimize de extremo a extremo', () => {
  it.skipIf(findBrowser() === undefined)('escribe el PNG ya comprimido', async () => {
    const root = await makeProject({ 'src/doc.md': DOC });
    const base = configFor(root);
    await buildProject(
      root,
      {},
      {
        formats: { ...base.formats, d2: 'png' },
        renderers: { ...base.renderers, png: { ...base.renderers.png, optimize: true } },
      },
    );

    const assets = await listAssets(root);
    expect(assets).toHaveLength(1);
    const png = await readAssetBytes(root, assets[0]!);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

    // Si el builder ya la aplico, volver a pasarla no gana nada. Es la unica
    // forma de comprobarlo con un solo render.
    expect((await optimizarPng(png)).byteLength).toBe(png.byteLength);
  });
});
