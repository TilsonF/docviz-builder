/**
 * Errores reales de cada motor.
 *
 * Se ejecutan contra los motores de verdad porque lo que se comprueba es
 * precisamente como se traduce su fallo a un mensaje util.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { D2Renderer } from '../../src/renderers/d2.js';
import { GraphvizRenderer } from '../../src/renderers/graphviz.js';
import { LikeC4Renderer } from '../../src/renderers/likec4.js';
import { MermaidRenderer } from '../../src/renderers/mermaid.js';
import { PlantUmlRenderer } from '../../src/renderers/plantuml.js';
import { VegaLiteRenderer } from '../../src/renderers/vega-lite.js';
import { RenderError } from '../../src/core/errors.js';
import { getTheme } from '../../src/themes/index.js';
import { findBrowser } from '../../src/renderers/browser.js';
import type { RenderOptions } from '../../src/core/types.js';

const options: RenderOptions = {
  format: 'svg',
  theme: getTheme('default'),
  title: 'Prueba',
  timeoutMs: 60_000,
  maxOutputBytes: 8 * 1024 * 1024,
};

const d2 = new D2Renderer();
const mermaid = new MermaidRenderer();
const hasBrowser = findBrowser() !== undefined;

afterAll(async () => {
  await d2.dispose();
  await mermaid.dispose();
});

describe('D2', () => {
  it('reporta un error de compilacion', async () => {
    await expect(d2.render('A -> ', options)).rejects.toThrow(RenderError);
  });

  it('renderiza correctamente un diagrama valido', async () => {
    const result = await d2.render('A -> B: hola', options);
    expect(result.content.toString()).toContain('<svg');
  });
});

describe('Graphviz', () => {
  it('reporta sintaxis DOT invalida', async () => {
    const renderer = new GraphvizRenderer();
    try {
      await renderer.render('digraph { A -> ][ }', options);
      throw new Error('deberia haber fallado');
    } catch (err) {
      expect(err).toBeInstanceOf(RenderError);
      expect((err as RenderError).format()).toContain('graphviz');
    }
  });
});

describe('PlantUML', () => {
  it('traduce el error de sintaxis a un motivo legible', async () => {
    const renderer = new PlantUmlRenderer();
    try {
      await renderer.render('@startuml\n?? esto no ?? es ?? valido\n@enduml', options);
      throw new Error('deberia haber fallado');
    } catch (err) {
      expect(err).toBeInstanceOf(RenderError);
      const text = (err as RenderError).format();
      expect(text).toContain('renderer: plantuml');
      // No basta con "exit code 200": debe decir que le pasa al diagrama.
      expect(text.toLowerCase()).toMatch(/syntax|error/);
    }
  });

  it('aborta al superar el tiempo maximo', async () => {
    const renderer = new PlantUmlRenderer();
    await expect(
      renderer.render('@startuml\nA -> B\n@enduml', { ...options, timeoutMs: 1 }),
    ).rejects.toThrow(/supero el limite/);
  });

  it('acepta un diagrama sin marcas de apertura envolviendolo', async () => {
    const renderer = new PlantUmlRenderer();
    const result = await renderer.render('A -> B: hola', options);
    expect(result.content.toString()).toContain('<svg');
  });

  it('genera PNG cuando se le pide', async () => {
    const renderer = new PlantUmlRenderer();
    const result = await renderer.render('@startuml\nA -> B\n@enduml', { ...options, format: 'png' });
    expect(result.format).toBe('png');
    expect(result.content.subarray(1, 4).toString()).toBe('PNG');
  });
});

describe('Vega-Lite', () => {
  it('reporta una especificacion que Vega rechaza', async () => {
    const renderer = new VegaLiteRenderer();
    await expect(renderer.render('{"mark": "inexistente"}', options)).rejects.toThrow(RenderError);
  });
});

describe('LikeC4', () => {
  it('reporta un modelo invalido', async () => {
    const renderer = new LikeC4Renderer();
    await expect(renderer.render('specification { element system;;; }', options)).rejects.toThrow(RenderError);
  });

  it('usa la vista indice implicita si el modelo no declara ninguna', async () => {
    // LikeC4 sintetiza una vista `index` cuando no hay bloque `views`; el
    // renderer se apoya en ella en lugar de exigir una declaracion explicita.
    const renderer = new LikeC4Renderer();
    const source = ['specification {', '  element system', '}', 'model {', "  a = system 'A'", '}'].join('\n');
    const result = await renderer.render(source, options);
    expect(result.content.toString()).toContain('<svg');
  });

  it('elige la vista cuyo titulo coincide con el del bloque', async () => {
    const renderer = new LikeC4Renderer();
    const source = [
      'specification {',
      '  element system',
      '}',
      'model {',
      "  a = system 'A'",
      "  b = system 'B'",
      "  a -> b 'usa'",
      '}',
      'views {',
      '  view index {',
      "    title 'General'",
      '    include *',
      '  }',
      '  view detalle {',
      "    title 'Detalle'",
      '    include *',
      '  }',
      '}',
    ].join('\n');
    const result = await renderer.render(source, { ...options, title: 'detalle' });
    expect(result.content.toString()).toContain('<svg');
  });
});

describe.skipIf(!hasBrowser)('Mermaid', () => {
  it('reporta un diagrama invalido con el detalle del motor', async () => {
    try {
      await mermaid.render('flowchart LR\n  A -->', options);
      throw new Error('deberia haber fallado');
    } catch (err) {
      expect(err).toBeInstanceOf(RenderError);
      expect((err as RenderError).format()).toContain('renderer: mermaid');
    }
  });

  it('produce el mismo SVG para la misma entrada', async () => {
    const a = await mermaid.render('flowchart LR\n  A --> B', options);
    const b = await mermaid.render('flowchart LR\n  A --> B', options);
    expect(a.content.equals(b.content)).toBe(true);
  });

  it('renderiza tambien secuencias y gantt', async () => {
    const seq = await mermaid.render('sequenceDiagram\n  A->>B: hola', options);
    expect(seq.content.toString()).toContain('<svg');
  });

  it('conserva la hoja de estilos apuntando al id real del svg', async () => {
    // Mermaid acota su CSS con `#<id> .clase`. Si el post-proceso renombra el
    // id sin actualizar los selectores, el diagrama pierde todos los estilos y
    // los rectangulos salen en negro: una regresion invisible para el compilador.
    const gantt = [
      'gantt',
      '    dateFormat  YYYY-MM-DD',
      '    section Fase',
      '    Tarea :done, t1, 2026-01-05, 5d',
    ].join('\n');
    const svg = (await mermaid.render(gantt, options)).content.toString();

    const rootId = /<svg[^>]*\bid="([^"]+)"/.exec(svg)?.[1];
    expect(rootId).toBeDefined();

    const selectors = svg.match(/#[\w-]+\s+\.[\w-]+\s*\{/g) ?? [];
    expect(selectors.length).toBeGreaterThan(5);
    for (const selector of selectors) {
      expect(selector.startsWith(`#${rootId} `)).toBe(true);
    }
    // Y el color del tema debe llegar de verdad a la hoja de estilos.
    expect(svg).toContain(options.theme.palette.primary);
  });
});
