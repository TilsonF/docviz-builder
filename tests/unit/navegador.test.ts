/**
 * Caminos de error de los renderers que dependen de un navegador.
 *
 * Sin inyectar el lanzador habria que provocar fallos reales del sistema —quitar
 * Chromium, agotar la memoria— para llegar a este codigo, asi que no se probaba
 * nunca. Con un lanzador simulado se recorren en milisegundos y sin efectos.
 */

import { describe, expect, it } from 'vitest';
import { MermaidRenderer, type Browser as MermaidBrowser } from '../../src/renderers/mermaid.js';
import { BpmnRenderer } from '../../src/renderers/bpmn.js';
import { RenderError } from '../../src/core/errors.js';
import { getTheme } from '../../src/themes/index.js';
import { findType } from '../../src/dsl/index.js';
import { compileDsl } from '../../src/dsl/index.js';
import type { RenderOptions } from '../../src/core/types.js';

const options: RenderOptions = {
  format: 'svg',
  theme: getTheme('corporate'),
  title: 'Prueba',
  timeoutMs: 5_000,
  maxOutputBytes: 8 * 1024 * 1024,
};

const FLOW = 'flowchart LR\n  A --> B';
const PROCESO = compileDsl('diagram', findType('bpmn')!.example).source;

/** Navegador simulado: una pagina cuyo `evaluate` devuelve lo que se le diga. */
function navegadorFalso(resultado: unknown, opciones: { alCerrarPagina?: () => void } = {}) {
  const cerradas: string[] = [];
  const browser = {
    async newPage() {
      return {
        async setContent() {},
        async addScriptTag() {},
        async evaluate() {
          return resultado;
        },
        async setRequestInterception() {},
        on() {},
        async close() {
          cerradas.push('pagina');
          opciones.alCerrarPagina?.();
        },
      };
    },
    async close() {
      cerradas.push('navegador');
    },
  } as unknown as MermaidBrowser;
  return { browser, cerradas };
}

describe('Mermaid — frontera con el navegador', () => {
  it('avisa con instrucciones si no hay ningun Chromium', async () => {
    const renderer = new MermaidRenderer({
      findExecutable: () => undefined,
      launch: async () => {
        throw new Error('no deberia llegar aqui');
      },
    });
    try {
      await renderer.render(FLOW, options);
      throw new Error('deberia haber fallado');
    } catch (err) {
      const texto = (err as RenderError).format();
      expect(texto).toContain('no se encontro un navegador');
      // El mensaje debe decir como resolverlo, no solo que fallo.
      expect(texto).toContain('DOCVIZ_BROWSER_PATH');
    }
  });

  it('explica que no pudo lanzar el navegador y donde', async () => {
    const renderer = new MermaidRenderer({
      launch: async () => {
        throw new Error('ELIBBAD: falta una biblioteca del sistema');
      },
    });
    try {
      await renderer.render(FLOW, options);
      throw new Error('deberia haber fallado');
    } catch (err) {
      const texto = (err as RenderError).format();
      expect(texto).toContain('no se pudo lanzar el navegador');
      expect(texto).toContain('ELIBBAD');
    }
  });

  it('traslada el error que devuelve Mermaid dentro de la pagina', async () => {
    const { browser } = navegadorFalso({ error: 'Parse error on line 2' });
    const renderer = new MermaidRenderer({ launch: async () => browser });
    try {
      await renderer.render(FLOW, options);
      throw new Error('deberia haber fallado');
    } catch (err) {
      expect((err as RenderError).format()).toContain('Parse error on line 2');
    }
  });

  it('rechaza una respuesta que no es un SVG', async () => {
    const { browser } = navegadorFalso({ svg: 'esto no es un svg' });
    const renderer = new MermaidRenderer({ launch: async () => browser });
    await expect(renderer.render(FLOW, options)).rejects.toThrow(/no produjo un SVG valido/);
  });

  it('cierra la pagina aunque el render falle', async () => {
    const { browser, cerradas } = navegadorFalso({ error: 'algo salio mal' });
    const renderer = new MermaidRenderer({ launch: async () => browser });
    await renderer.render(FLOW, options).catch(() => undefined);
    expect(cerradas).toContain('pagina');
  });

  it('un fallo al cerrar la pagina no enmascara el resultado', async () => {
    const { browser } = navegadorFalso(
      { svg: '<svg width="10" height="10"></svg>' },
      {
        alCerrarPagina: () => {
          throw new Error('la pagina ya estaba cerrada');
        },
      },
    );
    const renderer = new MermaidRenderer({ launch: async () => browser });
    const result = await renderer.render(FLOW, options);
    expect(result.content.toString()).toContain('<svg');
  });

  it('reutiliza el mismo navegador entre renders', async () => {
    let lanzamientos = 0;
    const { browser } = navegadorFalso({ svg: '<svg width="10" height="10"></svg>' });
    const renderer = new MermaidRenderer({
      launch: async () => {
        lanzamientos += 1;
        return browser;
      },
    });
    await renderer.render(FLOW, options);
    await renderer.render(FLOW, options);
    expect(lanzamientos).toBe(1);
  });

  it('dispose cierra el navegador y permite volver a abrirlo', async () => {
    const { browser, cerradas } = navegadorFalso({ svg: '<svg width="10" height="10"></svg>' });
    let lanzamientos = 0;
    const renderer = new MermaidRenderer({
      launch: async () => {
        lanzamientos += 1;
        return browser;
      },
    });
    await renderer.render(FLOW, options);
    await renderer.dispose();
    expect(cerradas).toContain('navegador');
    await renderer.render(FLOW, options);
    expect(lanzamientos).toBe(2);
  });

  it('aborta si la pagina no responde a tiempo', async () => {
    const browser = {
      async newPage() {
        return {
          async setContent() {},
          async addScriptTag() {},
          evaluate: () => new Promise(() => undefined),
          async setRequestInterception() {},
          on() {},
          async close() {},
        };
      },
      async close() {},
    } as unknown as MermaidBrowser;
    const renderer = new MermaidRenderer({ launch: async () => browser });
    await expect(renderer.render(FLOW, { ...options, timeoutMs: 30 })).rejects.toThrow(/supero el limite/);
  });
});

describe('BPMN — frontera con el navegador', () => {
  it('traslada el error de bpmn-js', async () => {
    const { browser } = navegadorFalso({ error: 'unparsable content detected' });
    const renderer = new BpmnRenderer({ launch: async () => browser as never });
    try {
      await renderer.render(PROCESO, options);
      throw new Error('deberia haber fallado');
    } catch (err) {
      expect((err as RenderError).format()).toContain('unparsable content');
    }
  });

  it('rechaza una respuesta que no es un SVG', async () => {
    const { browser } = navegadorFalso({ svg: 'nada' });
    const renderer = new BpmnRenderer({ launch: async () => browser as never });
    await expect(renderer.render(PROCESO, options)).rejects.toThrow(/no produjo un SVG valido/);
  });

  it('explica que no pudo lanzar el navegador', async () => {
    const renderer = new BpmnRenderer({
      launch: async () => {
        throw new Error('sin memoria');
      },
    });
    await expect(renderer.render(PROCESO, options)).rejects.toThrow(/no se pudo lanzar/);
  });

  it('aplica el tema al SVG que devuelve la pagina', async () => {
    const { browser } = navegadorFalso({
      svg: '<svg width="10" height="10"><g class="djs-visual"><rect/></g></svg>',
    });
    const renderer = new BpmnRenderer({ launch: async () => browser as never });
    const svg = (await renderer.render(PROCESO, options)).content.toString();
    expect(svg).toContain('.djs-visual');
    expect(svg).toContain(options.theme.palette.background);
  });

  it('aborta si la pagina no responde a tiempo', async () => {
    const browser = {
      async newPage() {
        return {
          async setContent() {},
          async addScriptTag() {},
          evaluate: () => new Promise(() => undefined),
          async setRequestInterception() {},
          on() {},
          async close() {},
        };
      },
      async close() {},
    };
    const renderer = new BpmnRenderer({ launch: async () => browser as never });
    await expect(renderer.render(PROCESO, { ...options, timeoutMs: 30 })).rejects.toThrow(/supero el limite/);
  });
});
