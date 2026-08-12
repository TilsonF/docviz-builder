/**
 * Variantes opcionales de los compiladores.
 *
 * Cada campo opcional y cada alias es un camino que alguien acabara usando; si
 * no se prueba, se rompe sin que nadie lo note hasta que falla un build ajeno.
 */

import { describe, expect, it } from 'vitest';
import { compileDsl } from '../../src/dsl/index.js';
import { architectureLikeC4 } from '../../src/dsl/architecture.js';
import { DslValidationError } from '../../src/core/errors.js';
import { parse as parseYaml } from 'yaml';

/** El detalle del error es donde va la lista de valores validos. */
function expectReport(fn: () => unknown, pattern: RegExp): void {
  try {
    fn();
    throw new Error('deberia haber fallado');
  } catch (err) {
    expect(err).toBeInstanceOf(DslValidationError);
    expect((err as DslValidationError).format()).toMatch(pattern);
  }
}

const src = (yaml: string): string => compileDsl('diagram', yaml).source;
const arch = (yaml: string): string => architectureLikeC4(parseYaml(yaml) as Record<string, unknown>);

describe('alias de campo en espanol', () => {
  const casos: Array<[string, string]> = [
    ['type: erd\nentidades:\n  - name: A', 'entity "A"'],
    ['type: use-case\nactores: [Cliente]\ncasos:\n  - name: Pagar', 'usecase "Pagar"'],
    ['type: component\ncomponentes: [UI]', 'component "UI"'],
    ['type: deployment\nnodos:\n  - name: Servidor', 'node "Servidor"'],
    ['type: wireframe\nfilas:\n  - text: Hola', '@startsalt'],
    ['type: json\ndatos:\n  a: 1', '@startjson'],
    ['type: journey\nsecciones:\n  - name: S\n    pasos: [Uno]', 'section S'],
    ['type: kanban\ncolumnas:\n  - name: C\n    tarjetas: [T]', 'kanban'],
    ['type: sankey\nflujos:\n  - from: A\n    to: B\n    value: 1', 'sankey-beta'],
    ['type: radar\nejes: [A, B, C]\nvalores: [1, 2, 3]', 'radar-beta'],
    ['type: block\nfilas:\n  - [A]', 'block-beta'],
    ['type: bpmn\npasos:\n  - task: Revisar', '<bpmn:task'],
    ['type: ascii\narte: |\n  .-.', '.-.'],
  ];

  for (const [yaml, expected] of casos) {
    it(`admite ${yaml.split('\n')[0]!.replace('type: ', '')} con campos en espanol`, () => {
      expect(src(yaml)).toContain(expected);
    });
  }
});

describe('campos opcionales', () => {
  it('erd admite campos como texto suelto', () => {
    expect(src('type: erd\nentities:\n  - name: A\n    fields: [id, nombre]')).toContain('  id');
  });

  it('erd admite campos sin tipo', () => {
    expect(src('type: erd\nentities:\n  - name: A\n    fields:\n      - name: id')).toContain('  id');
  });

  it('use-case funciona sin sistema envolvente', () => {
    const out = src('type: use-case\nactors: [A]\nuseCases:\n  - name: Hacer algo');
    expect(out).not.toMatch(/^rectangle "/m);
    expect(out).toContain('usecase "Hacer algo"');
  });

  it('component admite componentes sueltos y relaciones discontinuas', () => {
    const out = src('type: component\ncomponents: [A, B]\nrelations:\n  - A --> B');
    expect(out).toContain('..>');
  });

  it('deployment admite nodos sin artefactos y todas las clases', () => {
    for (const kind of ['node', 'database', 'cloud', 'queue', 'storage', 'component', 'folder']) {
      expect(src(`type: deployment\nnodes:\n  - name: X\n    kind: ${kind}`)).toContain(`${kind} "X"`);
    }
  });

  it('wireframe admite todos los tipos de campo', () => {
    const out = src(
      [
        'type: wireframe',
        'rows:',
        '  - fields:',
        '      - input: checkbox',
        '        value: checked',
        '      - input: radio',
        '        value: selected',
        '      - input: select',
        '        value: Uno',
        '      - input: area',
        '      - input: label',
        '        value: Texto',
      ].join('\n'),
    );
    expect(out).toContain('[X]');
    expect(out).toContain('(X)');
    expect(out).toContain('^Uno^');
  });

  it('yaml serializa listas de objetos y valores vacios', () => {
    const out = src('type: yaml\ndata:\n  items:\n    - name: a\n      valor: 1\n  vacio: []\n  nulo: null');
    expect(out).toContain('items:');
    expect(out).toContain('[]');
    expect(out).toContain('null');
  });

  it('wbs y mindmap anidan tres niveles', () => {
    const wbs = src('type: wbs\nroot: R\nbranches:\n  - name: A\n    children:\n      - name: B\n        children: [C]');
    expect(wbs).toContain('**** C');
    const mm = src('type: mindmap\nroot: R\nbranches:\n  - name: A\n    children:\n      - name: B\n        children: [C]');
    expect(mm).toContain('        C');
  });

  it('git-graph admite etiquetas de version', () => {
    expect(src('type: git-graph\ncommits:\n  - tag: v1.0')).toContain('tag: "v1.0"');
  });

  it('treemap admite datos planos', () => {
    expect(src('type: treemap\ndata:\n  - name: A\n    value: 5')).toContain('"A": 5');
  });

  it('treemap rechaza valores no positivos', () => {
    expect(() => src('type: treemap\ndata:\n  - name: A\n    value: 0')).toThrow(/debe ser positivo/);
  });

  it('radar admite minimo y nombre de serie', () => {
    const out = src('type: radar\naxes: [A, B, C]\nvalues: [1, 2, 3]\nmin: 0\nseriesName: Equipo');
    expect(out).toContain('min 0');
    expect(out).toContain('"Equipo"');
  });

  it('radar rechaza valores no numericos', () => {
    expect(() => src('type: radar\naxes: [A, B, C]\nvalues: [1, dos, 3]')).toThrow(/numericos/);
  });

  it('quadrant funciona sin elementos situados', () => {
    const out = src('type: quadrant\nxAxis: [a, b]\nyAxis: [c, d]\nquadrants: [1, 2, 3, 4]');
    expect(out).toContain('quadrant-4 4');
  });

  it('quadrant exige dos extremos por eje', () => {
    expect(() => src('type: quadrant\nxAxis: [solo]\nyAxis: [c, d]\nquadrants: [1,2,3,4]')).toThrow(
      /dos extremos/,
    );
  });

  it('block rechaza filas vacias', () => {
    expect(() => src('type: block\nrows:\n  - []')).toThrow();
  });

  it('bpmn admite un paso escrito como texto suelto', () => {
    expect(src('type: bpmn\nflow:\n  - Revisar solicitud')).toContain('Revisar solicitud');
  });

  it('bpmn admite etiquetas propias en las ramas', () => {
    const out = src(
      [
        'type: bpmn',
        'flow:',
        '  - gateway: Continua?',
        '    yesLabel: sigue',
        '    noLabel: para',
        '    yes: [{end: Fin}]',
        '    no: [{end: Alto}]',
      ].join('\n'),
    );
    expect(out).toContain('name="sigue"');
    expect(out).toContain('name="para"');
  });

  it('bpmn admite la rama si escrita en espanol', () => {
    expect(src('type: bpmn\nflow:\n  - gateway: X\n    si: [{end: Fin}]')).toContain('<bpmn:endEvent');
  });
});

describe('architecture — variantes', () => {
  it('acepta relationships como sinonimo de relations', () => {
    const out = arch('elements: [{id: a, name: A}, {id: b, name: B}]\nrelationships:\n  - from: a\n    to: b');
    expect(out).toContain('a -> b');
  });

  it('acepta nodes como sinonimo de elements', () => {
    expect(arch('nodes: [{id: a, name: A}]')).toContain("a = system 'A'");
  });

  it('aplica el color declarado', () => {
    expect(arch('elements:\n  - id: a\n    name: A\n    color: green')).toContain('color green');
  });

  it('rechaza un color inexistente', () => {
    expectReport(() => arch('elements:\n  - id: a\n    name: A\n    color: fucsia'), /colores validos/);
  });

  it('acepta la direccion de la vista', () => {
    expect(arch('elements: [{id: a, name: A}]\ndirection: left-right')).toContain('autoLayout LeftRight');
  });

  it('rechaza una direccion inexistente', () => {
    expectReport(() => arch('elements: [{id: a, name: A}]\ndirection: diagonal'), /direcciones validas/);
  });

  it('acepta tech como sinonimo de technology', () => {
    expect(arch('elements:\n  - id: a\n    name: A\n    tech: NestJS')).toContain("technology 'NestJS'");
  });

  it('rechaza que un elemento sea su propio padre', () => {
    expect(() => arch('elements:\n  - id: a\n    name: A\n    parent: a')).toThrow(/su propio padre/);
  });

  it('rechaza un tipo de arquitectura inexistente', () => {
    expectReport(() => arch('type: c4-galaxia\nelements: [{id: a, name: A}]'), /tipos disponibles/);
  });

  it('resuelve el padre tanto por id como por nombre', () => {
    const porId = arch('elements:\n  - id: p\n    name: Padre\n  - id: h\n    name: Hijo\n    parent: p');
    const porNombre = arch('elements:\n  - id: p\n    name: Padre\n  - id: h\n    name: Hijo\n    parent: Padre');
    expect(porId).toContain('h = system');
    expect(porNombre).toContain('h = system');
  });
});
