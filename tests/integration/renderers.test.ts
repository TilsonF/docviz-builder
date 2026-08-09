/**
 * Pruebas de integracion (seccion 20).
 *
 * Casos 1 a 7: documentos reales que se compilan de verdad con cada motor y se
 * verifican sobre el resultado escrito en disco.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { verify } from '../../src/build/verify.js';
import { BuildFailedError } from '../../src/core/errors.js';
import path from 'node:path';
import {
  altTexts,
  assertUsableSvg,
  buildProject,
  cleanupProjects,
  imagePaths,
  listAssets,
  makeProject,
  readAsset,
  readOutput,
  svgSize,
} from './helpers.js';

afterAll(cleanupProjects);

describe('Caso 1 — PlantUML (Sequence)', () => {
  it('genera y valida un diagrama de secuencia', async () => {
    const root = await makeProject({
      'arquitectura.md': [
        '# Arquitectura',
        '',
        '## Flujo de autenticacion',
        '',
        '```plantuml',
        '@startuml',
        'actor Usuario',
        'participant Frontend',
        'participant API',
        '',
        'Usuario -> Frontend: Login',
        'Frontend -> API: POST /login',
        'API --> Frontend: Token',
        '@enduml',
        '```',
        '',
      ].join('\n'),
    });

    const result = await buildProject(root);
    expect(result.errors).toEqual([]);
    expect(result.stats.blocks).toBe(1);
    expect(result.stats.generated).toBe(1);

    const markdown = await readOutput(root, 'arquitectura.md');
    expect(markdown).toContain('# Arquitectura');
    expect(markdown).not.toContain('@startuml');
    expect(altTexts(markdown)).toEqual(['Flujo de autenticacion']);

    const [asset] = await listAssets(root);
    expect(asset).toMatch(/^flujo-de-autenticacion-[0-9a-f]{12}\.svg$/);

    const svg = await readAsset(root, asset!);
    assertUsableSvg(svg);
    // El contenido del diagrama debe estar realmente dibujado.
    expect(svg).toContain('Usuario');
    expect(svg).toContain('POST /login');
    expect(svgSize(svg).width).toBeGreaterThan(100);
  });
});

describe('Caso 2 — Mermaid (Flowchart)', () => {
  it('genera y valida un flowchart', async () => {
    const root = await makeProject({
      'flujos.md': [
        '## Flujo de datos',
        '',
        '```mermaid',
        'flowchart LR',
        '    User --> Frontend',
        '    Frontend --> API',
        '    API --> Database',
        '```',
        '',
      ].join('\n'),
    });

    const result = await buildProject(root);
    expect(result.errors).toEqual([]);

    const svg = await readAsset(root, (await listAssets(root))[0]!);
    assertUsableSvg(svg);
    expect(svg).toContain('Database');
    // Mermaid emite width="100%": si no se normaliza, la imagen se rompe.
    const { width, height } = svgSize(svg);
    expect(width).toBeGreaterThan(200);
    expect(height).toBeGreaterThan(20);
  });
});

describe('Caso 3 — D2 (Strategy Tree)', () => {
  it('genera y valida un arbol de estrategia', async () => {
    const root = await makeProject({
      'estrategia.md': [
        '## Reduccion de defectos',
        '',
        '```d2',
        'direction: right',
        '',
        'Objetivo: Reducir defectos',
        '',
        'Objetivo -> Calidad',
        'Objetivo -> Procesos',
        'Objetivo -> Arquitectura',
        '',
        'Calidad -> Automatizacion',
        'Procesos -> Refinamiento',
        'Arquitectura -> Observabilidad',
        '```',
        '',
      ].join('\n'),
    });

    const result = await buildProject(root);
    expect(result.errors).toEqual([]);

    const svg = await readAsset(root, (await listAssets(root))[0]!);
    assertUsableSvg(svg);
    expect(svg).toContain('Reducir defectos');
    expect(svg).toContain('Observabilidad');
  });
});

describe('Caso 4 — Vega-Lite (Bar Chart)', () => {
  it('genera y valida un grafico de barras', async () => {
    const root = await makeProject({
      'indicadores.md': [
        '## Defectos por sprint',
        '',
        '```vega-lite',
        '{',
        '  "data": {',
        '    "values": [',
        '      {"sprint": "SP1", "bugs": 42},',
        '      {"sprint": "SP2", "bugs": 31},',
        '      {"sprint": "SP3", "bugs": 18}',
        '    ]',
        '  },',
        '  "mark": "bar",',
        '  "encoding": {',
        '    "x": {"field": "sprint", "type": "nominal"},',
        '    "y": {"field": "bugs", "type": "quantitative"}',
        '  }',
        '}',
        '```',
        '',
      ].join('\n'),
    });

    const result = await buildProject(root);
    expect(result.errors).toEqual([]);

    const svg = await readAsset(root, (await listAssets(root))[0]!);
    assertUsableSvg(svg);
    expect(svg).toContain('SP1');
    expect(svg).toContain('SP3');
    // Tres barras dibujadas como paths o rects.
    expect((svg.match(/<path|<rect/g) ?? []).length).toBeGreaterThan(3);
  });

  it('rechaza la carga remota de datos', async () => {
    const root = await makeProject({
      'remoto.md': [
        '## Datos remotos',
        '',
        '```vega-lite',
        '{"data": {"url": "https://ejemplo.test/datos.json"}, "mark": "bar"}',
        '```',
        '',
      ].join('\n'),
    });
    await expect(buildProject(root)).rejects.toThrow(BuildFailedError);
  });
});

describe('Caso 5 — Graphviz (grafo de dependencias)', () => {
  it('genera y valida un grafo de dependencias', async () => {
    const root = await makeProject({
      'dependencias.md': [
        '## Dependencias entre modulos',
        '',
        '```graphviz',
        'digraph G {',
        '  Frontend -> API;',
        '  API -> Database;',
        '  API -> Cache;',
        '}',
        '```',
        '',
      ].join('\n'),
    });

    const result = await buildProject(root);
    expect(result.errors).toEqual([]);

    const svg = await readAsset(root, (await listAssets(root))[0]!);
    assertUsableSvg(svg);
    expect(svg).toContain('Frontend');
    expect(svg).toContain('Cache');
  });
});

describe('Caso 6 — Multiples diagramas en un mismo documento', () => {
  it('renderiza PlantUML, D2, Vega-Lite, Mermaid y LikeC4 en el mismo Markdown', async () => {
    const root = await makeProject({
      'completo.md': [
        '---',
        'title: Documento completo',
        '---',
        '',
        '# Documento completo',
        '',
        'Texto introductorio que debe sobrevivir.',
        '',
        '## Secuencia',
        '',
        '```plantuml',
        '@startuml',
        'actor A',
        'participant B',
        'A -> B: hola',
        '@enduml',
        '```',
        '',
        '## Estrategia',
        '',
        '```d2',
        'Raiz -> Rama1',
        'Raiz -> Rama2',
        '```',
        '',
        '## Indicadores',
        '',
        '```vega-lite',
        '{"data": {"values": [{"a": "X", "b": 5}, {"a": "Y", "b": 9}]},',
        ' "mark": "bar",',
        ' "encoding": {"x": {"field": "a", "type": "nominal"},',
        '              "y": {"field": "b", "type": "quantitative"}}}',
        '```',
        '',
        '## Flujo',
        '',
        '```mermaid',
        'flowchart TD',
        '    Inicio --> Fin',
        '```',
        '',
        '## Contexto',
        '',
        '```likec4',
        'specification {',
        '  element system',
        '}',
        'model {',
        '  a = system "Sistema A"',
        '  b = system "Sistema B"',
        '  a -> b "invoca"',
        '}',
        'views {',
        '  view index {',
        '    include *',
        '  }',
        '}',
        '```',
        '',
        '## Codigo que no se toca',
        '',
        '```typescript',
        'const x: number = 1;',
        '```',
        '',
        '| Motor | Estado |',
        '|---|---|',
        '| todos | ok |',
        '',
      ].join('\n'),
    });

    const result = await buildProject(root);
    expect(result.errors).toEqual([]);
    expect(result.stats.blocks).toBe(5);
    expect(result.stats.generated).toBe(5);

    const markdown = await readOutput(root, 'completo.md');
    expect(imagePaths(markdown)).toHaveLength(5);
    expect(altTexts(markdown)).toEqual(['Secuencia', 'Estrategia', 'Indicadores', 'Flujo', 'Contexto']);

    // El resto del documento queda intacto.
    expect(markdown).toContain('title: Documento completo');
    expect(markdown).toContain('Texto introductorio que debe sobrevivir.');
    expect(markdown).toContain('```typescript\nconst x: number = 1;\n```');
    expect(markdown).toContain('| Motor | Estado |');

    // Todas las rutas son relativas y todos los recursos existen y son validos.
    for (const p of imagePaths(markdown)) {
      expect(p.startsWith('./')).toBe(true);
      expect(path.isAbsolute(p)).toBe(false);
    }
    const assets = await listAssets(root);
    expect(assets).toHaveLength(5);
    for (const asset of assets) assertUsableSvg(await readAsset(root, asset));

    const report = await verify(path.join(root, 'docs'));
    expect(report.issues).toEqual([]);
    expect(report.residualBlocks).toEqual([]);
    expect(report.images).toBe(5);
  });
});

describe('Caso 7 — Error de sintaxis', () => {
  it('falla el build y reporta archivo, linea, renderer y motivo', async () => {
    const root = await makeProject({
      'roto.md': [
        '# Documento con error',
        '',
        '## Diagrama invalido',
        '',
        '```plantuml',
        '@startuml',
        'esto no es plantuml valido !!!! ???',
        'Usuario ->>>> :::: ???',
        '@enduml',
        '```',
        '',
      ].join('\n'),
    });

    let error: BuildFailedError | undefined;
    try {
      await buildProject(root);
    } catch (err) {
      error = err as BuildFailedError;
    }

    expect(error).toBeInstanceOf(BuildFailedError);
    const text = error!.format();
    expect(text).toContain('ERROR');
    expect(text).toContain('roto.md');
    expect(text).toContain('linea: 5');
    expect(text).toContain('renderer: plantuml');
    expect(text.toLowerCase()).toContain('motivo:');

    // Sin --continue-on-error el documento no se escribe: nada de salida a medias.
    await expect(readOutput(root, 'roto.md')).rejects.toThrow();
  });

  it('con --continue-on-error conserva el bloque original y sigue', async () => {
    const root = await makeProject({
      'mixto.md': [
        '## Bueno',
        '',
        '```d2',
        'A -> B',
        '```',
        '',
        '## Malo',
        '',
        '```graphviz',
        'digraph { esto -> no ->> es valido ][',
        '```',
        '',
      ].join('\n'),
    });

    const result = await buildProject(root, { continueOnError: true });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.location.renderer).toBe('graphviz');

    const markdown = await readOutput(root, 'mixto.md');
    expect(imagePaths(markdown)).toHaveLength(1);
    // El bloque que fallo permanece como codigo: el documento no miente.
    expect(markdown).toContain('```graphviz');
  });

  it('reporta un lenguaje de DSL mal escrito antes de renderizar', async () => {
    const root = await makeProject({
      'dsl-roto.md': ['## Grafico', '', '```chart', 'type: radar', 'data: []', '```', ''].join('\n'),
    });
    let error: BuildFailedError | undefined;
    try {
      await buildProject(root);
    } catch (err) {
      error = err as BuildFailedError;
    }
    expect(error).toBeInstanceOf(BuildFailedError);
    expect(error!.format()).toContain('radar');
  });
});
