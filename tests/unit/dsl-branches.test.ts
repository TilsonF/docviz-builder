/**
 * Cobertura de las variantes del DSL que no aparecen en el camino feliz:
 * decisiones, ramas paralelas, hitos, formas cortas y errores de escritura.
 */

import { describe, expect, it } from 'vitest';
import { compileDsl } from '../../src/dsl/index.js';
import {
  IdFactory,
  asArrowShorthand,
  d2Label,
  dotLabel,
  likec4Label,
  mermaidLabel,
  nameOf,
  oneOf,
  optionalNumber,
  parseEdgeExpression,
  plantUmlText,
  toEdge,
} from '../../src/dsl/util.js';

const diagram = (yaml: string): string => compileDsl('diagram', yaml).source;
const chart = (yaml: string): Record<string, unknown> =>
  JSON.parse(compileDsl('chart', yaml).source) as Record<string, unknown>;

describe('activity', () => {
  it('emite decisiones con ramas si/no', () => {
    const source = diagram(
      [
        'type: activity',
        'flow:',
        '  - Recibir solicitud',
        '  - decision: Es valida?',
        '    yes:',
        '      - Procesar',
        '    no:',
        '      - Rechazar',
        '  - Notificar',
      ].join('\n'),
    );
    expect(source).toContain('if (Es valida?) then (si)');
    expect(source).toContain(':Procesar;');
    expect(source).toContain('else (no)');
    expect(source).toContain(':Rechazar;');
    expect(source).toContain('endif');
  });

  it('acepta "si" como sinonimo de "yes"', () => {
    const source = diagram('type: activity\nflow:\n  - decision: Continua?\n    si:\n      - Seguir');
    expect(source).toContain(':Seguir;');
  });

  it('emite ramas paralelas', () => {
    const source = diagram(
      ['type: activity', 'flow:', '  - parallel:', '      - [Enviar correo]', '      - [Registrar log]'].join('\n'),
    );
    expect(source).toContain('fork');
    expect(source).toContain('fork again');
    expect(source).toContain('end fork');
  });

  it('emite notas', () => {
    expect(diagram('type: activity\nflow:\n  - note: Revisar manual')).toContain('note right');
  });

  it('acepta pasos declarados como mapa con nombre', () => {
    expect(diagram('type: activity\nflow:\n  - name: Paso uno')).toContain(':Paso uno;');
  });
});

describe('state', () => {
  it('marca el estado inicial y los finales', () => {
    const source = diagram(
      [
        'type: state',
        'states:',
        '  - name: Borrador',
        '    description: Aun editable',
        '  - Publicado',
        'initial: Borrador',
        'transitions:',
        '  - Borrador -> Publicado: publicar',
        'finals:',
        '  - Publicado',
      ].join('\n'),
    );
    expect(source).toContain('[*] --> S1');
    expect(source).toContain('S1 : Aun editable');
    expect(source).toContain('S1 --> S2 : publicar');
    expect(source).toContain('S2 --> [*]');
  });

  it('admite [*] como extremo explicito de una transicion', () => {
    const source = diagram('type: state\nstates: [A]\ntransitions:\n  - "[*] -> A"');
    expect(source).toContain('[*] --> S1');
  });

  it('rechaza estados no declarados', () => {
    expect(() => diagram('type: state\nstates: [A]\ntransitions:\n  - A -> Z')).toThrow(
      /no esta declarado en states/,
    );
  });
});

describe('gantt', () => {
  it('acepta title, axisFormat, end y milestone', () => {
    const source = diagram(
      [
        'type: gantt',
        'title: "Plan: de trabajo"',
        'axisFormat: "%d/%m"',
        'sections:',
        '  - name: Fase',
        '    tasks:',
        '      - name: Analisis',
        '        start: 2026-01-01',
        '        end: 2026-01-10',
        '      - name: Entrega',
        '        start: 2026-01-11',
        '        status: milestone',
      ].join('\n'),
    );
    expect(source).toContain('axisFormat  %d/%m');
    expect(source).toContain('title       Plan de trabajo');
    expect(source).toContain('2026-01-01, 2026-01-10');
    // Mermaid necesita duracion tambien en los hitos.
    expect(source).toMatch(/milestone, t\d+, 2026-01-11, 0d/);
  });

  it('rechaza una dependencia hacia una tarea aun no declarada', () => {
    expect(() =>
      diagram('type: gantt\nsections:\n  - name: S\n    tasks:\n      - name: T\n        after: Fantasma\n        duration: 1d'),
    ).toThrow(/no existe todavia/);
  });

  it('exige duracion o fin salvo en hitos', () => {
    expect(() =>
      diagram('type: gantt\nsections:\n  - name: S\n    tasks:\n      - name: T\n        start: 2026-01-01'),
    ).toThrow(/"duration" o "end"/);
  });
});

describe('flow', () => {
  it('usa conectores discontinuos', () => {
    expect(diagram('type: flow\nflow:\n  - A --> B: quiza')).toContain('-. quiza .->');
    expect(diagram('type: flow\nflow:\n  - A --> B')).toContain('-.->');
  });

  it('declara nodos que no participan en ninguna relacion', () => {
    const source = diagram('type: flow\nnodes:\n  - Aislado\nflow:\n  - A -> B');
    expect(source).toContain('"Aislado"');
  });

  it('limpia caracteres que romperian la etiqueta de arista', () => {
    expect(diagram('type: flow\nflow:\n  - A -> B: con | tuberia')).not.toContain('|');
  });
});

describe('diagramas ejecutivos restantes', () => {
  it('strategy-pillars agrupa items bajo cada pilar', () => {
    const source = diagram(
      'type: strategy-pillars\nroot: Vision\npillars:\n  - name: Personas\n    children: [Formacion]\n  - Procesos',
    );
    expect(source).toContain('"Vision"');
    expect(source).toContain('"Formacion"');
  });

  it('capability-map usa rejilla por dominio', () => {
    const source = diagram('type: capability-map\ndomains:\n  - name: Ventas\n    capabilities: [Cotizar, Facturar]');
    expect(source).toContain('grid-columns');
    expect(source).toContain('"Cotizar"');
  });

  it('operating-model encadena capas', () => {
    const source = diagram(
      'type: operating-model\nlayers:\n  - name: Negocio\n    items: [A]\n  - name: Tecnologia\n    items: [B]',
    );
    expect(source).toMatch(/l\d+ -> l\d+/);
  });

  it('value-chain usa la forma step', () => {
    expect(diagram('type: value-chain\nstages: [Captar, Vender]')).toContain('shape: step');
  });

  it('before-after admite etiquetas propias', () => {
    const source = diagram(
      'type: before-after\nbeforeLabel: Hoy\nafterLabel: Manana\nbefore: [Manual]\nafter: [Automatico]',
    );
    expect(source).toContain('"Hoy"');
    expect(source).toContain('"Manana"');
  });

  it('matrix-2x2 escribe los ejes y admite cuadrantes con items', () => {
    const source = diagram(
      [
        'type: matrix-2x2',
        'axes:',
        '  x: Esfuerzo',
        '  y: Impacto',
        'quadrants:',
        '  - name: Ganar rapido',
        '    items: [A, B]',
        '  - Estrategico',
        '  - Descartar',
        '  - Revisar',
      ].join('\n'),
    );
    expect(source).toContain('Eje X: Esfuerzo');
    expect(source).toContain('shape: text');
  });

  it('roadmap admite fases con y sin items', () => {
    const source = diagram('type: roadmap\nphases:\n  - name: Q1\n    items: [A]\n  - Q2');
    expect(source).toMatch(/f\d+ -> f\d+/);
  });

  it('tree admite otra direccion', () => {
    expect(diagram('type: issue-tree\ndirection: down\nroot: R\nbranches: [A]')).toContain('direction: down');
  });

  it('tree rechaza una direccion inexistente', () => {
    expect(() => diagram('type: issue-tree\ndirection: diagonal\nroot: R\nbranches: [A]')).toThrow(/no admite/);
  });
});

describe('dependency-map', () => {
  it('declara nodos, aristas etiquetadas y discontinuas', () => {
    const source = diagram(
      'type: dependency-map\ndirection: tb\nnodes: [Core]\ndependencies:\n  - Core -> Auth: usa\n  - Core --> Cache',
    );
    expect(source).toContain('rankdir=TB');
    expect(source).toContain('label="usa"');
    expect(source).toContain('style=dashed');
  });
});

describe('chart — variantes', () => {
  it('pie y donut usan arcos', () => {
    expect((chart('type: pie\ndata:\n  - label: A\n    value: 1')['mark'] as Record<string, unknown>)['innerRadius']).toBe(0);
    expect((chart('type: donut\ndata:\n  - label: A\n    value: 1')['mark'] as Record<string, unknown>)['innerRadius']).toBe(60);
  });

  it('showValues anade una capa de texto', () => {
    const spec = chart('type: bar\nshowValues: true\ndata:\n  - label: A\n    value: 1');
    expect(spec['layer']).toBeDefined();
    expect(spec['mark']).toBeUndefined();
  });

  it('acepta x/y/name/category como sinonimos de label', () => {
    for (const key of ['x', 'name', 'category']) {
      expect(chart(`type: bar\ndata:\n  - ${key}: A\n    value: 1`)['data']).toBeDefined();
    }
  });

  it('acepta y como sinonimo de value', () => {
    expect(chart('type: bar\ndata:\n  - label: A\n    y: 7')['data']).toBeDefined();
  });

  it('scatter admite series y tamano', () => {
    const spec = chart('type: scatter\ndata:\n  - x: 1\n    y: 2\n    series: A\n    size: 5\n    label: P1');
    const encoding = spec['encoding'] as Record<string, unknown>;
    expect(encoding['color']).toBeDefined();
    expect(encoding['size']).toBeDefined();
    expect(encoding['tooltip']).toBeDefined();
  });

  it('acepta titulos de eje y leyenda', () => {
    const spec = chart('type: bar\nxTitle: Sprint\nyTitle: Bugs\ndata:\n  - label: A\n    value: 1');
    const encoding = spec['encoding'] as Record<string, Record<string, unknown>>;
    expect(encoding['x']!['title']).toBe('Sprint');
    expect(encoding['y']!['title']).toBe('Bugs');
  });
});

describe('utilidades del DSL', () => {
  it('parseEdgeExpression invierte las flechas hacia la izquierda', () => {
    expect(parseEdgeExpression('B <- A', 'x')).toMatchObject({ from: 'A', to: 'B', dashed: false });
    expect(parseEdgeExpression('B <-- A', 'x')).toMatchObject({ from: 'A', to: 'B', dashed: true });
  });

  it('parseEdgeExpression admite ..> y =>', () => {
    expect(parseEdgeExpression('A ..> B', 'x').dashed).toBe(true);
    expect(parseEdgeExpression('A => B', 'x').dashed).toBe(false);
  });

  it('parseEdgeExpression falla con un formato irreconocible', () => {
    expect(() => parseEdgeExpression('A y B', 'campo')).toThrow(/no se entiende la relacion/);
  });

  it('toEdge acepta el mapa explicito con estilo', () => {
    expect(toEdge({ from: 'A', to: 'B', style: 'dashed', text: 'x' }, 'c')).toMatchObject({
      from: 'A',
      to: 'B',
      dashed: true,
      label: 'x',
    });
  });

  it('asArrowShorthand solo reconoce mapas de una entrada con flecha', () => {
    expect(asArrowShorthand({ 'A -> B': 'x' })).toEqual({ expression: 'A -> B', label: 'x' });
    expect(asArrowShorthand({ 'A -> B': null })).toEqual({ expression: 'A -> B' });
    expect(asArrowShorthand({ from: 'A', to: 'B' })).toBeUndefined();
    expect(asArrowShorthand({ 'A -> B': { anidado: true } })).toBeUndefined();
    expect(asArrowShorthand('cadena')).toBeUndefined();
    expect(asArrowShorthand({ 'A -> B': 'x', otra: 1 })).toBeUndefined();
  });

  it('nameOf rechaza elementos vacios', () => {
    expect(() => nameOf('   ', 'campo')).toThrow(/contiene un elemento vacio/);
  });

  it('oneOf normaliza y valida', () => {
    expect(oneOf('  LR ', ['lr', 'tb'], 'c', 'tb')).toBe('lr');
    expect(oneOf(undefined, ['lr', 'tb'], 'c', 'tb')).toBe('tb');
    expect(() => oneOf('xx', ['lr'], 'c', 'lr')).toThrow(/no admite el valor/);
  });

  it('optionalNumber acepta cadenas numericas y rechaza texto', () => {
    expect(optionalNumber({ v: '3.5' }, 'v', 'c')).toBe(3.5);
    expect(optionalNumber({}, 'v', 'c')).toBeUndefined();
    expect(() => optionalNumber({ v: 'tres' }, 'v', 'c')).toThrow(/numerico/);
  });

  it('los escapes por motor neutralizan los delimitadores', () => {
    expect(d2Label('con "comillas"')).toBe('"con \\"comillas\\""');
    expect(likec4Label("con 'comilla'")).toBe("'con \\'comilla\\''");
    expect(mermaidLabel('con "comillas"')).toBe('"con \'comillas\'"');
    expect(dotLabel('con "comillas"')).toBe('"con \\"comillas\\""');
    expect(plantUmlText('dos\nlineas')).toBe('dos\\nlineas');
  });

  it('IdFactory reutiliza el id de una misma clave', () => {
    const ids = new IdFactory('x');
    expect(ids.id('a')).toBe('x1');
    expect(ids.id('a')).toBe('x1');
    expect(ids.id('b')).toBe('x2');
    expect(ids.has('a')).toBe(true);
    expect(ids.keys()).toEqual(['a', 'b']);
    expect(ids.get('z')).toBeUndefined();
  });
});
