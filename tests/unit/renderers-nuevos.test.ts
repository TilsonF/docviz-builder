/**
 * Renderers anadidos: arte ASCII (svgbob) y BPMN (bpmn-js).
 */

import { afterAll, describe, expect, it } from 'vitest';
import { SvgbobRenderer, applyTheme as svgbobTheme } from '../../src/renderers/svgbob.js';
import { BpmnRenderer, applyTheme as bpmnTheme } from '../../src/renderers/bpmn.js';
import { withPalette } from '../../src/renderers/d2.js';
import { RenderError } from '../../src/core/errors.js';
import { getTheme } from '../../src/themes/index.js';
import { findBrowser } from '../../src/renderers/browser.js';
import { compileDsl, findType } from '../../src/dsl/index.js';
import type { RenderOptions } from '../../src/core/types.js';

const theme = getTheme('corporate');
const options: RenderOptions = {
  format: 'svg',
  theme,
  title: 'Prueba',
  timeoutMs: 90_000,
  maxOutputBytes: 8 * 1024 * 1024,
};

const ART = ['  .-------.      .------.', '  | Front +----->| API  |', "  '-------'      '------'"].join('\n');

const svgbob = new SvgbobRenderer();
const bpmn = new BpmnRenderer();
const hasBrowser = findBrowser() !== undefined;

afterAll(async () => {
  await bpmn.dispose();
});

describe('svgbob', () => {
  it('convierte arte ASCII en SVG', async () => {
    const result = await svgbob.render(ART, options);
    const svg = result.content.toString();
    expect(svg).toContain('<svg');
    expect(svg).toContain('Front');
    expect(svg).toContain('API');
  });

  it('sustituye la hoja de estilos por la del tema', async () => {
    const svg = (await svgbob.render(ART, options)).content.toString();
    expect(svg).toContain(theme.palette.text);
    // El estilo por defecto de svgbob es negro puro.
    expect(svg).not.toContain('stroke:black');
  });

  it('la salida es dual: se adapta al visor claro y al oscuro', async () => {
    const svg = (await svgbob.render(ART, options)).content.toString();
    expect(svg).toContain('prefers-color-scheme');
  });

  it('rechaza un dibujo vacio', async () => {
    await expect(svgbob.render('   ', options)).rejects.toThrow(/esta vacio/);
  });

  it('rechaza PNG', async () => {
    await expect(svgbob.render(ART, { ...options, format: 'png' })).rejects.toThrow(RenderError);
  });

  it('la version incluye la del estilo propio', async () => {
    expect(await svgbob.version()).toContain('docviz-style');
  });

  it('applyTheme respeta el contenido grafico', () => {
    const original = '<svg><style>line{stroke:black}</style><path d="M0 0"/></svg>';
    const themed = svgbobTheme(original, theme);
    expect(themed).toContain('<path d="M0 0"/>');
    expect(themed).not.toContain('stroke:black}');
  });

  it('es determinista', async () => {
    const a = await svgbob.render(ART, options);
    const b = await svgbob.render(ART, options);
    expect(a.content.equals(b.content)).toBe(true);
  });
});

describe('bpmn', () => {
  it('rechaza contenido que no es BPMN y explica como generarlo', async () => {
    try {
      await bpmn.render('esto no es xml', options);
      throw new Error('deberia haber fallado');
    } catch (err) {
      expect((err as RenderError).format()).toContain('type: bpmn');
    }
  });

  it('rechaza PNG', async () => {
    await expect(
      bpmn.render('<bpmn:definitions></bpmn:definitions>', { ...options, format: 'png' }),
    ).rejects.toThrow(RenderError);
  });

  it('applyTheme anade fondo y colores sin tocar la notacion', () => {
    const themed = bpmnTheme('<svg><g class="djs-visual"><rect/></g></svg>', theme);
    expect(themed).toContain(theme.palette.background);
    expect(themed).toContain('.djs-visual');
    // Las figuras siguen siendo las mismas: en BPMN la forma es normativa.
    expect(themed).toContain('<rect/>');
  });
});

describe.skipIf(!hasBrowser)('bpmn con navegador', () => {
  it('dibuja el proceso compilado desde el DSL', async () => {
    const compiled = compileDsl('diagram', findType('bpmn')!.example);
    const svg = (await bpmn.render(compiled.source, options)).content.toString();
    expect(svg).toContain('<svg');
    expect(svg).toContain('Revisar');
    expect(svg).toContain('Aprobada');
  });

  it('reporta un XML invalido con el detalle del motor', async () => {
    const roto = '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><roto/></bpmn:definitions>';
    await expect(bpmn.render(roto, options)).rejects.toThrow(RenderError);
  });
});

describe('paleta del proyecto en D2', () => {
  it('antepone la configuracion de tema a la fuente', () => {
    const out = withPalette('a -> b', theme);
    expect(out).toContain('theme-overrides');
    expect(out).toContain('dark-theme-overrides');
    expect(out).toContain(theme.palette.primary);
    expect(out).toContain(theme.dark.palette.primary);
    expect(out.endsWith('a -> b')).toBe(true);
  });

  it('no toca un documento que ya trae su propia configuracion', () => {
    const source = 'vars: {\n  d2-config: {\n    theme-id: 4\n  }\n}\na -> b';
    expect(withPalette(source, theme)).toBe(source);
  });
});
