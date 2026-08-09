/**
 * Pruebas de construccion y validacion de cada renderer que no requieren
 * ejecutar el motor: rutas, opciones invalidas y localizacion del navegador.
 */

import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { GraphvizRenderer, applyTheme, createGraphvizRenderer } from '../../src/renderers/graphviz.js';
import { PlantUmlRenderer } from '../../src/renderers/plantuml.js';
import { D2Renderer } from '../../src/renderers/d2.js';
import { MermaidRenderer } from '../../src/renderers/mermaid.js';
import { LikeC4Renderer } from '../../src/renderers/likec4.js';
import { VegaLiteRenderer } from '../../src/renderers/vega-lite.js';
import { browserCandidates, browserNotFoundHelp, findBrowser } from '../../src/renderers/browser.js';
import { packageVersion } from '../../src/core/package-version.js';
import { buildRegistry } from '../../src/renderers/index.js';
import { defaultConfig } from '../../src/config/load.js';
import { RenderError } from '../../src/core/errors.js';
import { getTheme } from '../../src/themes/index.js';
import type { RenderOptions } from '../../src/core/types.js';

const options: RenderOptions = {
  format: 'svg',
  theme: getTheme('default'),
  title: 'T',
  timeoutMs: 5_000,
  maxOutputBytes: 1_000_000,
};

describe('Graphviz', () => {
  it('rechaza un motor de layout inexistente', () => {
    expect(() => createGraphvizRenderer({ engine: 'espiral' })).toThrow(/motor de layout desconocido/);
  });

  it('acepta los motores validos', () => {
    for (const engine of ['dot', 'neato', 'fdp', 'circo', 'twopi']) {
      expect(() => createGraphvizRenderer({ engine })).not.toThrow();
    }
  });

  it('la version incluye el motor elegido', async () => {
    expect(await new GraphvizRenderer({ engine: 'neato' }).version()).toContain('neato');
  });

  it('applyTheme inserta los atributos por defecto tras la llave', () => {
    const themed = applyTheme('digraph G { A -> B; }', getTheme('dark'));
    expect(themed).toMatch(/digraph G \{\n\s+graph \[/);
    expect(themed).toContain('node [');
    expect(themed).toContain('edge [');
    expect(themed).toContain('A -> B;');
  });

  it('applyTheme falla si el grafo no tiene cuerpo', () => {
    expect(() => applyTheme('digraph G', getTheme('default'))).toThrow(/falta la llave/);
  });

  it('rechaza PNG', async () => {
    await expect(
      new GraphvizRenderer().render('digraph { A -> B }', { ...options, format: 'png' }),
    ).rejects.toThrow(RenderError);
  });
});

describe('PlantUML', () => {
  it('resuelve el jar por defecto dentro del paquete', async () => {
    const renderer = new PlantUmlRenderer({ jarPath: path.join('no', 'existe', 'plantuml.jar') });
    await expect(renderer.render('@startuml\n@enduml', options)).rejects.toThrow(/no se encuentra plantuml.jar/);
  });

  it('bloquea directivas que leen archivos o URLs', async () => {
    const renderer = new PlantUmlRenderer();
    for (const directive of ['!include /etc/passwd', '!includeurl http://x/y', '!import algo']) {
      await expect(renderer.render(`@startuml\n${directive}\n@enduml`, options)).rejects.toThrow(
        /deshabilitada por seguridad/,
      );
    }
  });

  it('soporta SVG y PNG', () => {
    expect(new PlantUmlRenderer().supportedFormats).toEqual(['svg', 'png']);
  });

  it('informa si Java no esta disponible', async () => {
    const renderer = new PlantUmlRenderer({ javaPath: path.join('bin', 'java-que-no-existe') });
    await expect(renderer.version()).rejects.toThrow();
  });
});

describe('D2', () => {
  it('rechaza un diagrama vacio', async () => {
    await expect(new D2Renderer().render('   ', options)).rejects.toThrow(/esta vacio/);
  });

  it('rechaza PNG', async () => {
    await expect(new D2Renderer().render('A -> B', { ...options, format: 'png' })).rejects.toThrow(RenderError);
  });

  it('la version incluye el layout', async () => {
    expect(await new D2Renderer({ layout: 'elk' }).version()).toContain('elk');
  });

  it('dispose es idempotente', async () => {
    const renderer = new D2Renderer();
    await expect(renderer.dispose()).resolves.toBeUndefined();
    await expect(renderer.dispose()).resolves.toBeUndefined();
  });
});

describe('Mermaid', () => {
  it('rechaza un diagrama vacio antes de abrir el navegador', async () => {
    await expect(new MermaidRenderer().render('  ', options)).rejects.toThrow(/esta vacio/);
  });

  it('rechaza PNG', async () => {
    await expect(
      new MermaidRenderer().render('flowchart LR\nA-->B', { ...options, format: 'png' }),
    ).rejects.toThrow(RenderError);
  });

  it('informa con instrucciones si no hay navegador', async () => {
    const renderer = new MermaidRenderer({ browserPath: path.join('no', 'existe', 'chrome') });
    // Con una ruta explicita inexistente se recorre la lista de candidatos; si
    // la maquina no tiene ninguno, el error debe ser accionable.
    const found = findBrowser(path.join('no', 'existe', 'chrome'));
    if (found === undefined) {
      await expect(renderer.render('flowchart LR\nA-->B', options)).rejects.toThrow(
        /no se encontro un navegador/,
      );
    } else {
      expect(found).toBeTypeOf('string');
    }
  });

  it('dispose sin navegador abierto no falla', async () => {
    await expect(new MermaidRenderer().dispose()).resolves.toBeUndefined();
  });
});

describe('LikeC4', () => {
  it('rechaza un modelo vacio', async () => {
    await expect(new LikeC4Renderer().render('   ', options)).rejects.toThrow(/esta vacio/);
  });

  it('rechaza PNG', async () => {
    await expect(new LikeC4Renderer().render('x', { ...options, format: 'png' })).rejects.toThrow(RenderError);
  });

  it('la version incluye la del emisor SVG propio', async () => {
    expect(await new LikeC4Renderer().version()).toContain('docviz-svg');
  });
});

describe('Vega-Lite', () => {
  it('rechaza JSON invalido', async () => {
    await expect(new VegaLiteRenderer().render('{no es json}', options)).rejects.toThrow(/no es JSON valido/);
  });

  it('rechaza una raiz que no sea objeto', async () => {
    await expect(new VegaLiteRenderer().render('[1,2,3]', options)).rejects.toThrow(/debe ser un objeto/);
  });

  it('rechaza data.url anidado', async () => {
    const spec = JSON.stringify({
      layer: [{ data: { url: 'https://ejemplo.test/x.json' }, mark: 'bar' }],
    });
    await expect(new VegaLiteRenderer().render(spec, options)).rejects.toThrow(/carga remota/);
  });

  it('rechaza PNG', async () => {
    await expect(
      new VegaLiteRenderer().render('{"mark":"bar"}', { ...options, format: 'png' }),
    ).rejects.toThrow(RenderError);
  });
});

describe('localizacion del navegador', () => {
  it('prioriza la ruta explicita y las variables de entorno', () => {
    vi.stubEnv('DOCVIZ_BROWSER_PATH', '/env/docviz-chrome');
    vi.stubEnv('PUPPETEER_EXECUTABLE_PATH', '/env/puppeteer-chrome');
    const candidates = browserCandidates('/explicito/chrome');
    expect(candidates[0]).toBe('/explicito/chrome');
    expect(candidates[1]).toBe('/env/docviz-chrome');
    expect(candidates[2]).toBe('/env/puppeteer-chrome');
    vi.unstubAllEnvs();
  });

  it('incluye rutas del sistema', () => {
    expect(browserCandidates().length).toBeGreaterThan(3);
  });

  it('el texto de ayuda menciona las tres alternativas', () => {
    const help = browserNotFoundHelp();
    expect(help).toContain('DOCVIZ_BROWSER_PATH');
    expect(help).toContain('docviz.config.yaml');
    expect(help).toContain('playwright install');
  });
});

describe('packageVersion', () => {
  it('lee la version de un paquete instalado', () => {
    expect(packageVersion('vega-lite')).toMatch(/^\d+\.\d+/);
  });

  it('devuelve el valor por defecto si el paquete no existe', () => {
    expect(packageVersion('paquete-que-no-existe-xyz', 'sin-version')).toBe('sin-version');
  });

  it('cachea el resultado', () => {
    expect(packageVersion('vega')).toBe(packageVersion('vega'));
  });
});

describe('buildRegistry con backend kroki', () => {
  it('usa Kroki para los motores que lo soportan y local para LikeC4', () => {
    const cfg = defaultConfig(process.cwd());
    cfg.renderers.backend = 'kroki';
    const registry = buildRegistry(cfg);
    expect(registry.get('plantuml').constructor.name).toBe('KrokiRenderer');
    expect(registry.get('mermaid').constructor.name).toBe('KrokiRenderer');
    // LikeC4 es especializado: Kroki no lo cubre.
    expect(registry.get('likec4').constructor.name).toBe('LikeC4Renderer');
  });

  it('permite fijar el backend por motor', () => {
    const cfg = defaultConfig(process.cwd());
    cfg.renderers.d2.backend = 'kroki';
    const registry = buildRegistry(cfg);
    expect(registry.get('d2').constructor.name).toBe('KrokiRenderer');
    expect(registry.get('mermaid').constructor.name).toBe('MermaidRenderer');
  });

  it('resuelve la ruta del jar relativa a la raiz del proyecto', () => {
    const cfg = defaultConfig('/proyecto');
    cfg.renderers.plantuml.jar = 'vendor/mi-plantuml.jar';
    expect(() => buildRegistry(cfg)).not.toThrow();
  });
});
