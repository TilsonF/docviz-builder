/**
 * Pruebas del rasterizado a PNG.
 *
 * Ocho de los nueve motores solo emiten SVG, y para una diapositiva, un Word o
 * un correo hace falta PNG. Lo que se comprueba aqui es el envoltorio —cuando
 * delega, cuando convierte, que limites respeta— sin abrir un navegador: el
 * dibujo de verdad lo comprueban las pruebas de integracion.
 */

import { describe, expect, it, vi } from 'vitest';
import { conPng, Rasterizador } from '../../src/renderers/rasterizador.js';
import { RenderError } from '../../src/core/errors.js';
import { getTheme } from '../../src/themes/index.js';
import type { DiagramRenderer, OutputFormat, RenderOptions } from '../../src/core/types.js';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"></svg>';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const opciones = (format: OutputFormat, maxOutputBytes = 1024 * 1024): RenderOptions => ({
  format,
  theme: getTheme('default'),
  title: 'x',
  timeoutMs: 5000,
  maxOutputBytes,
});

/** Renderer de mentira que solo sabe SVG, como ocho de los nueve reales. */
function soloSvg(svg = SVG): DiagramRenderer & { llamadas: OutputFormat[] } {
  const llamadas: OutputFormat[] = [];
  return {
    type: 'falso',
    defaultFormat: 'svg',
    supportedFormats: ['svg'],
    llamadas,
    version: async () => 'falso-1',
    render: async (_source, options) => {
      llamadas.push(options.format);
      return { format: 'svg', content: Buffer.from(svg, 'utf8'), mimeType: 'image/svg+xml' };
    },
  };
}

/** Navegador de mentira que devuelve una captura fija. */
function navegadorFalso(captura: Uint8Array = PNG) {
  const vistas: Array<{ width: number; height: number; deviceScaleFactor: number }> = [];
  const modos: string[] = [];
  let paginasAbiertas = 0;
  const browser = {
    newPage: async () => {
      paginasAbiertas += 1;
      return {
        setContent: async () => undefined,
        setViewport: async (v: { width: number; height: number; deviceScaleFactor: number }) => void vistas.push(v),
        emulateMediaFeatures: async (f: Array<{ name: string; value: string }>) =>
          void modos.push(f[0]?.value ?? ''),
        screenshot: async () => captura,
        close: async () => void (paginasAbiertas -= 1),
      };
    },
    close: async () => undefined,
  };
  return { browser, vistas, modos, abiertas: () => paginasAbiertas };
}

const rasterizador = (falso: ReturnType<typeof navegadorFalso>, opts = {}) =>
  new Rasterizador({
    launch: async () => falso.browser,
    findExecutable: () => '/falso/chrome',
    ...opts,
  });

describe('el envoltorio', () => {
  it('anuncia PNG sobre un motor que solo sabe SVG', () => {
    const envuelto = conPng(soloSvg(), rasterizador(navegadorFalso()));
    expect(envuelto.supportedFormats).toEqual(['svg', 'png']);
    expect(envuelto.defaultFormat).toBe('svg');
  });

  it('no toca a un motor que ya sabe PNG', () => {
    const nativo: DiagramRenderer = {
      type: 'plantuml',
      defaultFormat: 'svg',
      supportedFormats: ['svg', 'png'],
      version: async () => 'x',
      render: async () => ({ format: 'png', content: PNG, mimeType: 'image/png' }),
    };
    expect(conPng(nativo, rasterizador(navegadorFalso()))).toBe(nativo);
  });

  it('para SVG delega sin abrir el navegador', async () => {
    const falso = navegadorFalso();
    const interno = soloSvg();
    const resultado = await conPng(interno, rasterizador(falso)).render('x', opciones('svg'));

    expect(resultado.format).toBe('svg');
    expect(falso.vistas).toEqual([]);
    expect(interno.llamadas).toEqual(['svg']);
  });

  it('para PNG pide el SVG al motor y lo convierte', async () => {
    const falso = navegadorFalso();
    const interno = soloSvg();
    const resultado = await conPng(interno, rasterizador(falso)).render('x', opciones('png'));

    // El motor nunca se entera: dibuja su SVG como siempre.
    expect(interno.llamadas).toEqual(['svg']);
    expect(resultado.format).toBe('png');
    expect(resultado.mimeType).toBe('image/png');
    expect(resultado.content.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('el lienzo sale de las dimensiones del propio SVG', async () => {
    const falso = navegadorFalso();
    await conPng(soloSvg(), rasterizador(falso, { scale: 3 })).render('x', opciones('png'));
    expect(falso.vistas[0]).toEqual({ width: 400, height: 200, deviceScaleFactor: 3 });
  });

  it('un SVG sin dimensiones no deja el lienzo a cero', async () => {
    const falso = navegadorFalso();
    await conPng(soloSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), rasterizador(falso)).render(
      'x',
      opciones('png'),
    );
    expect(falso.vistas[0]!.width).toBeGreaterThan(100);
    expect(falso.vistas[0]!.height).toBeGreaterThan(100);
  });

  it('un SVG gigante se acota antes de que el navegador recorte', async () => {
    const falso = navegadorFalso();
    const enorme = '<svg xmlns="http://www.w3.org/2000/svg" width="99999" height="99999"></svg>';
    await conPng(soloSvg(enorme), rasterizador(falso)).render('x', opciones('png'));
    expect(falso.vistas[0]!.width).toBeLessThanOrEqual(4000);
  });

  it('congela el modo del tema que se pida', async () => {
    // Un PNG es una sola imagen y no puede llevar las dos variantes como el SVG.
    for (const scheme of ['light', 'dark'] as const) {
      const falso = navegadorFalso();
      await conPng(soloSvg(), rasterizador(falso, { scheme })).render('x', opciones('png'));
      expect(falso.modos).toEqual([scheme]);
    }
  });

  it('cierra la pagina aunque la captura falle', async () => {
    const falso = navegadorFalso();
    const roto = {
      ...falso,
      browser: {
        ...falso.browser,
        newPage: async () => ({
          ...(await falso.browser.newPage()),
          screenshot: async () => {
            throw new Error('el navegador se cayo');
          },
        }),
      },
    };
    await expect(
      conPng(soloSvg(), rasterizador(roto as unknown as ReturnType<typeof navegadorFalso>)).render('x', opciones('png')),
    ).rejects.toThrow(/se cayo/);
    expect(falso.abiertas()).toBe(0);
  });

  it('un PNG por encima del limite se rechaza con la salida', async () => {
    const gordo = Buffer.alloc(4096, 1);
    const falso = navegadorFalso(gordo);
    await expect(
      conPng(soloSvg(), rasterizador(falso)).render('x', opciones('png', 1024)),
    ).rejects.toThrow(/png\.scale|limite/i);
  });

  it('sin navegador lo dice y explica como indicarle uno', async () => {
    const sinNavegador = new Rasterizador({ findExecutable: () => undefined });
    await expect(conPng(soloSvg(), sinNavegador).render('x', opciones('png'))).rejects.toThrow(RenderError);
    await expect(conPng(soloSvg(), sinNavegador).render('x', opciones('png'))).rejects.toThrow(
      /DOCVIZ_BROWSER_PATH|navegador/,
    );
  });

  it('el navegador se abre una vez y se reutiliza', async () => {
    const falso = navegadorFalso();
    const abrir = vi.fn(async () => falso.browser);
    const r = new Rasterizador({ launch: abrir, findExecutable: () => '/falso/chrome' });
    const envuelto = conPng(soloSvg(), r);

    await envuelto.render('x', opciones('png'));
    await envuelto.render('x', opciones('png'));
    expect(abrir).toHaveBeenCalledTimes(1);
    await r.dispose();
  });
});
