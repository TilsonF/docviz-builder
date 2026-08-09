/**
 * Pruebas del DSL de alto nivel: `diagram`, `chart` y `architecture`.
 *
 * El objetivo del DSL es que un agente no tenga que elegir tecnologia, asi que
 * lo que se comprueba aqui es doble: que la eleccion de motor sea la esperada y
 * que un error del agente produzca un mensaje que le permita corregirse.
 */

import { describe, expect, it } from 'vitest';
import { compileDsl, dslCatalog, isDslLanguage } from '../../src/dsl/index.js';
import { DslValidationError } from '../../src/core/errors.js';

function compile(lang: 'diagram' | 'chart' | 'architecture', yaml: string) {
  return compileDsl(lang, yaml);
}

describe('catalogo del DSL', () => {
  it('expone las tres vallas', () => {
    expect(isDslLanguage('diagram')).toBe(true);
    expect(isDslLanguage('chart')).toBe(true);
    expect(isDslLanguage('architecture')).toBe(true);
    expect(isDslLanguage('plantuml')).toBe(false);
  });

  it('publica los tipos disponibles', () => {
    const catalog = dslCatalog();
    expect(catalog.diagram).toContain('sequence');
    expect(catalog.diagram).toContain('strategy-tree');
    expect(catalog.chart).toContain('bar');
    expect(catalog.architecture).toContain('c4-context');
  });
});

describe('diagram — eleccion automatica de motor', () => {
  const cases: Array<[string, string, string]> = [
    ['sequence', 'plantuml', 'type: sequence\nparticipants: [A, B]\nflow:\n  - A -> B: hola'],
    ['class', 'plantuml', 'type: class\nclasses:\n  - name: Pedido\n  - name: Linea'],
    ['state', 'plantuml', 'type: state\nstates: [Nuevo, Listo]\ntransitions:\n  - Nuevo -> Listo: ok'],
    ['activity', 'plantuml', 'type: activity\nflow:\n  - Recibir\n  - Procesar'],
    ['flow', 'mermaid', 'type: flow\nflow:\n  - A -> B'],
    ['gantt', 'mermaid', 'type: gantt\nsections:\n  - name: S1\n    tasks:\n      - name: T1\n        start: 2026-01-01\n        duration: 5d'],
    ['strategy-tree', 'd2', 'type: strategy-tree\nroot: R\nbranches: [A, B]'],
    ['issue-tree', 'd2', 'type: issue-tree\nroot: R\nbranches: [A]'],
    ['capability-map', 'd2', 'type: capability-map\ndomains:\n  - name: D\n    capabilities: [C1, C2]'],
    ['operating-model', 'd2', 'type: operating-model\nlayers:\n  - name: L1\n    items: [A]'],
    ['value-chain', 'd2', 'type: value-chain\nstages: [Uno, Dos]'],
    ['before-after', 'd2', 'type: before-after\nbefore: [A]\nafter: [B]'],
    ['timeline', 'd2', 'type: timeline\nphases:\n  - name: Q1\n    items: [A]'],
    ['roadmap', 'd2', 'type: roadmap\nphases: [Q1, Q2]'],
    ['dependency-map', 'graphviz', 'type: dependency-map\ndependencies:\n  - A -> B'],
  ];

  for (const [type, engine, yaml] of cases) {
    it(`\`${type}\` se resuelve con ${engine}`, () => {
      expect(compile('diagram', yaml).rendererType).toBe(engine);
    });
  }

  it('matrix-2x2 exige exactamente cuatro cuadrantes', () => {
    const ok = 'type: matrix-2x2\naxes:\n  x: Esfuerzo\n  y: Impacto\nquadrants: [A, B, C, D]';
    expect(compile('diagram', ok).rendererType).toBe('d2');
    const bad = 'type: matrix-2x2\naxes:\n  x: Esfuerzo\n  y: Impacto\nquadrants: [A, B, C]';
    expect(() => compile('diagram', bad)).toThrow(/exactamente 4 cuadrantes/);
  });
});

describe('diagram — sequence', () => {
  const yaml = [
    'type: sequence',
    'title: Autenticacion de usuario',
    'participants:',
    '  - Usuario',
    '  - Frontend',
    '  - Entra ID',
    '  - API',
    'flow:',
    '  - Usuario -> Frontend: Login',
    '  - Frontend -> Entra ID: Authenticate',
    '  - Entra ID --> Frontend: Token',
    '  - Frontend -> API: Request + Token',
  ].join('\n');

  it('produce PlantUML valido y conserva el titulo', () => {
    const result = compile('diagram', yaml);
    expect(result.rendererType).toBe('plantuml');
    expect(result.title).toBe('Autenticacion de usuario');
    expect(result.source).toMatch(/^@startuml/);
    expect(result.source).toMatch(/@enduml$/);
  });

  it('declara cada participante una sola vez', () => {
    const source = compile('diagram', yaml).source;
    const declarations = source.split('\n').filter((l) => /^participant /.test(l));
    expect(declarations).toHaveLength(4);
  });

  it('distingue mensaje solido de respuesta discontinua', () => {
    const source = compile('diagram', yaml).source;
    expect(source).toMatch(/P1 -> P2: Login/);
    expect(source).toMatch(/P3 --> P2: Token/);
  });

  it('acepta el tipo de participante', () => {
    const source = compile(
      'diagram',
      'type: sequence\nparticipants:\n  - name: Usuario\n    type: actor\n  - name: BD\n    type: database\nflow:\n  - Usuario -> BD: consulta',
    ).source;
    expect(source).toContain('actor "Usuario"');
    expect(source).toContain('database "BD"');
  });

  it('rechaza un participante no declarado con un mensaje accionable', () => {
    const bad = 'type: sequence\nparticipants: [A]\nflow:\n  - A -> Fantasma: hola';
    try {
      compile('diagram', bad);
      throw new Error('deberia haber fallado');
    } catch (err) {
      expect(err).toBeInstanceOf(DslValidationError);
      const text = (err as DslValidationError).format();
      expect(text).toContain('Fantasma');
      expect(text).toContain('participants');
    }
  });

  it('admite notas', () => {
    const source = compile(
      'diagram',
      'type: sequence\nparticipants: [A, B]\nflow:\n  - A -> B: hola\n  - note: Se valida el token\n    over: B',
    ).source;
    expect(source).toContain('note over P2: Se valida el token');
  });
});

describe('diagram — class', () => {
  it('emite atributos, metodos y relaciones', () => {
    const source = compile(
      'diagram',
      [
        'type: class',
        'classes:',
        '  - name: Pedido',
        '    attributes: [id, total]',
        '    methods: [confirmar, cancelar]',
        '  - name: Linea',
        '  - name: PedidoBase',
        '    abstract: true',
        'relations:',
        '  - from: Pedido',
        '    to: Linea',
        '    type: composition',
        '    label: contiene',
        '  - from: Pedido',
        '    to: PedidoBase',
        '    type: extends',
      ].join('\n'),
    ).source;
    expect(source).toContain('class "Pedido" {');
    expect(source).toContain('  id');
    expect(source).toContain('  confirmar()');
    expect(source).toContain('abstract class "PedidoBase"');
    expect(source).toContain('"Pedido" *-- "Linea" : contiene');
    // `extends` se lee hijo->padre, PlantUML dibuja padre<|--hijo.
    expect(source).toContain('"PedidoBase" <|-- "Pedido"');
  });

  it('rechaza relaciones hacia clases no declaradas', () => {
    expect(() =>
      compile('diagram', 'type: class\nclasses:\n  - name: A\nrelations:\n  - from: A\n    to: Z'),
    ).toThrow(/no esta declarado en classes/);
  });

  it('rechaza un tipo de relacion inexistente', () => {
    expect(() =>
      compile(
        'diagram',
        'type: class\nclasses:\n  - name: A\n  - name: B\nrelations:\n  - from: A\n    to: B\n    type: teletransporta',
      ),
    ).toThrow(/no existe/);
  });
});

describe('diagram — flow y gantt', () => {
  it('genera Mermaid con ids sinteticos y etiquetas entrecomilladas', () => {
    const source = compile(
      'diagram',
      'type: flow\ndirection: lr\nflow:\n  - Usuario -> Frontend: abre\n  - Frontend -> API',
    ).source;
    expect(source.startsWith('flowchart LR')).toBe(true);
    expect(source).toContain('N1["Usuario"]');
    expect(source).toContain('-- abre -->');
  });

  it('admite formas declaradas', () => {
    const source = compile(
      'diagram',
      'type: flow\nnodes:\n  - name: Decidir\n    shape: decision\nflow:\n  - Decidir -> Fin',
    ).source;
    expect(source).toContain('N1{"Decidir"}');
  });

  it('rechaza una forma inexistente', () => {
    expect(() =>
      compile('diagram', 'type: flow\nnodes:\n  - name: X\n    shape: triangulo\nflow:\n  - X -> Y'),
    ).toThrow(/la forma "triangulo" no existe/);
  });

  it('genera un gantt con secciones y dependencias', () => {
    const source = compile(
      'diagram',
      [
        'type: gantt',
        'sections:',
        '  - name: Fase 1',
        '    tasks:',
        '      - name: Analisis',
        '        start: 2026-01-05',
        '        duration: 10d',
        '        status: done',
        '      - name: Diseno',
        '        after: Analisis',
        '        duration: 5d',
      ].join('\n'),
    ).source;
    expect(source.startsWith('gantt')).toBe(true);
    expect(source).toContain('section Fase 1');
    expect(source).toContain('done, t1, 2026-01-05, 10d');
    expect(source).toContain('after t1');
  });

  it('exige start o after en cada tarea', () => {
    expect(() =>
      compile('diagram', 'type: gantt\nsections:\n  - name: S\n    tasks:\n      - name: T\n        duration: 2d'),
    ).toThrow(/necesita "start" o "after"/);
  });
});

describe('diagram — arboles ejecutivos', () => {
  it('anida ramas de varios niveles', () => {
    const source = compile(
      'diagram',
      [
        'type: strategy-tree',
        'root: Reducir defectos',
        'branches:',
        '  - name: Calidad',
        '    children:',
        '      - Automatizacion',
        '      - Code Review',
        '  - name: Proceso',
        '    children:',
        '      - Refinamiento',
      ].join('\n'),
    ).source;
    expect(source).toContain('direction: right');
    expect(source).toContain('"Reducir defectos"');
    expect(source).toContain('"Automatizacion"');
    // Cada arista se declara entre ids sinteticos.
    expect(source.match(/^n\d+ -> n\d+$/gm)!.length).toBe(5);
  });

  it('acepta la forma corta de ramas sin hijos', () => {
    const source = compile('diagram', 'type: strategy-tree\nroot: Mejorar calidad\nbranches:\n  - Automatizacion\n  - Arquitectura\n  - Proceso').source;
    expect(source.match(/^n\d+ -> n\d+$/gm)!.length).toBe(3);
  });
});

describe('chart', () => {
  it('bar produce una especificacion Vega-Lite con los datos incrustados', () => {
    const result = compile(
      'chart',
      'type: bar\ntitle: Defectos por Sprint\ndata:\n  - label: SP1\n    value: 42\n  - label: SP2\n    value: 28\n  - label: SP3\n    value: 15',
    );
    expect(result.rendererType).toBe('vega-lite');
    const spec = JSON.parse(result.source) as Record<string, any>;
    expect(spec['title']).toBe('Defectos por Sprint');
    expect(spec['mark'].type).toBe('bar');
    expect(spec['data'].values).toHaveLength(3);
    expect(spec['data'].values[0]).toEqual({ label: 'SP1', value: 42 });
  });

  it('line y area cambian la marca', () => {
    expect(JSON.parse(compile('chart', 'type: line\ndata:\n  - label: A\n    value: 1').source).mark.type).toBe('line');
    expect(JSON.parse(compile('chart', 'type: area\ndata:\n  - label: A\n    value: 1').source).mark.type).toBe('area');
  });

  it('horizontal-bar intercambia los ejes', () => {
    const spec = JSON.parse(compile('chart', 'type: horizontal-bar\ndata:\n  - label: A\n    value: 3').source);
    expect(spec.encoding.y.field).toBe('label');
    expect(spec.encoding.x.field).toBe('value');
  });

  it('series multiples anaden color y apilado', () => {
    const spec = JSON.parse(
      compile(
        'chart',
        [
          'type: stacked-bar',
          'series:',
          '  - name: Backend',
          '    data:',
          '      - label: SP1',
          '        value: 10',
          '  - name: Frontend',
          '    data:',
          '      - label: SP1',
          '        value: 6',
        ].join('\n'),
      ).source,
    );
    expect(spec.encoding.color.field).toBe('series');
    expect(spec.encoding.y.stack).toBe('zero');
    expect(spec.data.values).toHaveLength(2);
  });

  it('grouped-bar usa xOffset en lugar de apilar', () => {
    const spec = JSON.parse(
      compile(
        'chart',
        'type: grouped-bar\nseries:\n  - name: A\n    data:\n      - label: S1\n        value: 1\n  - name: B\n    data:\n      - label: S1\n        value: 2',
      ).source,
    );
    expect(spec.encoding.xOffset.field).toBe('series');
    expect(spec.encoding.y.stack).toBeNull();
  });

  it('scatter exige x e y numericos', () => {
    const spec = JSON.parse(compile('chart', 'type: scatter\ndata:\n  - x: 1\n    y: 2\n  - x: 3\n    y: 4').source);
    expect(spec.encoding.x.type).toBe('quantitative');
    expect(() => compile('chart', 'type: scatter\ndata:\n  - x: uno\n    y: 2')).toThrow(/numerico/);
  });

  it('heatmap usa x, y y valor', () => {
    const spec = JSON.parse(
      compile('chart', 'type: heatmap\ndata:\n  - x: Lun\n    y: Backend\n    value: 3').source,
    );
    expect(spec.mark.type).toBe('rect');
    expect(spec.encoding.color.field).toBe('value');
  });

  it('waterfall calcula los acumulados en el compilador', () => {
    const spec = JSON.parse(
      compile('chart', 'type: waterfall\ndata:\n  - label: Inicio\n    value: 100\n  - label: Bajas\n    value: -30').source,
    );
    const values = spec.data.values as Array<{ start: number; end: number }>;
    expect(values[0]).toMatchObject({ start: 0, end: 100 });
    expect(values[1]).toMatchObject({ start: 100, end: 70 });
  });

  it('rechaza un tipo de grafico inexistente', () => {
    expect(() => compile('chart', 'type: radar\ndata: []')).toThrow(/el tipo de grafico "radar" no existe/);
  });

  it('exige label y value en cada punto', () => {
    expect(() => compile('chart', 'type: bar\ndata:\n  - valor: 3')).toThrow(/necesita "label"/);
    expect(() => compile('chart', 'type: bar\ndata:\n  - label: A')).toThrow(/necesita "value"/);
  });
});

describe('architecture', () => {
  const yaml = [
    'type: c4-container',
    'title: Contenedores',
    'elements:',
    '  - id: usuario',
    '    kind: person',
    '    name: Usuario',
    '    description: Cliente final',
    '  - id: plataforma',
    '    kind: system',
    '    name: Plataforma',
    '  - id: api',
    '    kind: container',
    '    name: API',
    '    technology: NestJS',
    '    parent: plataforma',
    '  - id: bd',
    '    kind: database',
    '    name: Base de datos',
    '    parent: plataforma',
    'relations:',
    '  - from: usuario',
    '    to: api',
    '    label: Consulta',
    '  - from: api',
    '    to: bd',
    '    label: Lee y escribe',
    '    technology: SQL',
  ].join('\n');

  it('genera un modelo LikeC4 con especificacion, modelo y vista', () => {
    const result = compile('architecture', yaml);
    expect(result.rendererType).toBe('likec4');
    expect(result.source).toContain('specification {');
    expect(result.source).toContain('model {');
    expect(result.source).toContain('views {');
    expect(result.source).toContain("title 'Contenedores'");
  });

  it('anida los hijos dentro del padre y usa el nombre cualificado', () => {
    const source = compile('architecture', yaml).source;
    expect(source).toMatch(/plataforma = system 'Plataforma' \{[\s\S]*api = container 'API'/);
    expect(source).toContain('usuario -> plataforma.api');
  });

  it('mapea la clase a su forma LikeC4', () => {
    const source = compile('architecture', yaml).source;
    expect(source).toContain('shape person');
    expect(source).toContain('shape cylinder');
  });

  it('acepta alias de clase en espanol', () => {
    const source = compile(
      'architecture',
      'elements:\n  - id: u\n    kind: usuario\n    name: U\n  - id: d\n    kind: bd\n    name: D',
    ).source;
    expect(source).toContain('shape person');
    expect(source).toContain('shape cylinder');
  });

  it('acepta la forma corta de relacion', () => {
    const source = compile(
      'architecture',
      'elements:\n  - id: a\n    name: A\n  - id: b\n    name: B\nrelations:\n  - A -> B: usa',
    ).source;
    expect(source).toContain("a -> b 'usa'");
  });

  it('rechaza referencias a elementos inexistentes', () => {
    expect(() =>
      compile('architecture', 'elements:\n  - id: a\n    name: A\nrelations:\n  - from: a\n    to: z'),
    ).toThrow(/no corresponde a ningun elemento/);
  });

  it('rechaza un padre inexistente', () => {
    expect(() =>
      compile('architecture', 'elements:\n  - id: a\n    name: A\n    parent: fantasma'),
    ).toThrow(/elemento padre "fantasma"/);
  });

  it('rechaza una clase de elemento inexistente', () => {
    expect(() => compile('architecture', 'elements:\n  - id: a\n    name: A\n    kind: dragon')).toThrow(
      /la clase de elemento "dragon" no existe/,
    );
  });

  it('sanea identificadores no validos en LikeC4', () => {
    const source = compile('architecture', 'elements:\n  - name: Portal de Pagos (v2)').source;
    expect(source).toMatch(/^\s*Portal_de_Pagos_v2 = system/m);
  });
});

describe('errores generales del DSL', () => {
  it('rechaza YAML invalido con un mensaje claro', () => {
    expect(() => compile('diagram', 'type: [sin cerrar')).toThrow(/no es YAML valido/);
  });

  it('rechaza un bloque vacio y sugiere un ejemplo', () => {
    try {
      compile('chart', '   ');
      throw new Error('deberia haber fallado');
    } catch (err) {
      expect((err as DslValidationError).format()).toContain('type: bar');
    }
  });

  it('rechaza un tipo de diagrama inexistente listando los validos', () => {
    try {
      compile('diagram', 'type: mandala');
      throw new Error('deberia haber fallado');
    } catch (err) {
      const text = (err as DslValidationError).format();
      expect(text).toContain('mandala');
      expect(text).toContain('sequence');
    }
  });

  it('rechaza un lenguaje que no es DSL', () => {
    expect(() => compileDsl('plantuml', 'x')).toThrow(/no es un lenguaje de DSL/);
  });
});
