/**
 * Compiladores anadidos: tipos tecnicos, de producto, BPMN y arte ASCII.
 */

import { describe, expect, it } from 'vitest';
import { compileDsl } from '../../src/dsl/index.js';
import { DslValidationError } from '../../src/core/errors.js';

/**
 * Comprueba el reporte completo, no solo el mensaje: la lista de valores
 * validos viaja en el detalle, y es justo lo que permite corregirse.
 */
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
const chart = (yaml: string): Record<string, unknown> =>
  JSON.parse(compileDsl('chart', yaml).source) as Record<string, unknown>;

describe('erd', () => {
  const yaml = [
    'type: erd',
    'entities:',
    '  - name: Pedido',
    '    fields:',
    '      - name: id',
    '        type: uuid',
    '        key: true',
    '      - name: total',
    '        type: decimal',
    '  - name: Linea',
    'relations:',
    '  - from: Pedido',
    '    to: Linea',
    '    cardinality: one-to-many',
    '    label: contiene',
  ].join('\n');

  it('separa las claves del resto de campos', () => {
    const out = src(yaml);
    expect(out).toContain('* id : uuid');
    expect(out).toContain('  --');
    expect(out).toContain('  total : decimal');
  });

  it('traduce la cardinalidad a la notacion de PlantUML', () => {
    expect(src(yaml)).toMatch(/E_Pedido \|\|--o\{ E_Linea : contiene/);
  });

  it('acepta las cardinalidades en espanol', () => {
    const out = src(
      'type: erd\nentities: [{name: A}, {name: B}]\nrelations:\n  - from: A\n    to: B\n    cardinality: muchos-a-muchos',
    );
    expect(out).toContain('}o--o{');
  });

  it('rechaza una cardinalidad inexistente listando las validas', () => {
    expectReport(
      () => src('type: erd\nentities: [{name: A}, {name: B}]\nrelations:\n  - from: A\n    to: B\n    cardinality: alguna'),
      /cardinalidades validas/,
    );
  });

  it('rechaza relaciones hacia entidades no declaradas', () => {
    expect(() => src('type: erd\nentities: [{name: A}]\nrelations:\n  - from: A\n    to: Z')).toThrow(
      /no esta declarado en entities/,
    );
  });
});

describe('use-case', () => {
  it('encierra los casos en el sistema y los une a sus actores', () => {
    const out = src(
      [
        'type: use-case',
        'system: Portal',
        'actors: [Cliente, Operador]',
        'useCases:',
        '  - name: Pagar',
        '    actors: [Cliente]',
      ].join('\n'),
    );
    expect(out).toContain('rectangle "Portal" {');
    expect(out).toContain('usecase "Pagar"');
    expect(out).toMatch(/A1 --> U1/);
  });

  it('rechaza un actor no declarado', () => {
    expect(() =>
      src('type: use-case\nactors: [Cliente]\nuseCases:\n  - name: Pagar\n    actors: [Fantasma]'),
    ).toThrow(/no esta declarado/);
  });
});

describe('component y deployment', () => {
  it('agrupa componentes en paquetes', () => {
    const out = src(
      'type: component\ngroups:\n  - name: Backend\n    components: [API, Servicio]\nrelations:\n  - API -> Servicio',
    );
    expect(out).toContain('package "Backend" {');
    expect(out).toMatch(/C1 --> C2/);
  });

  it('rechaza relaciones hacia componentes no declarados', () => {
    expect(() => src('type: component\ncomponents: [A]\nrelations:\n  - A -> Z')).toThrow(
      /no esta declarado como componente/,
    );
  });

  it('despliega nodos con sus artefactos', () => {
    const out = src(
      [
        'type: deployment',
        'nodes:',
        '  - name: Servidor',
        '    kind: node',
        '    contains: [app.jar]',
        '  - name: BD',
        '    kind: database',
        'relations:',
        '  - Servidor -> BD: JDBC',
      ].join('\n'),
    );
    expect(out).toContain('node "Servidor"');
    expect(out).toContain('artifact "app.jar"');
    expect(out).toContain('database "BD"');
    expect(out).toMatch(/N1 --> N3 : JDBC/);
  });

  it('rechaza una clase de nodo inexistente', () => {
    expect(() => src('type: deployment\nnodes:\n  - name: X\n    kind: nave')).toThrow(/no admite el valor/);
  });
});

describe('wireframe', () => {
  it('maqueta campos y botones en filas', () => {
    const out = src(
      [
        'type: wireframe',
        'rows:',
        '  - fields:',
        '      - label: Usuario',
        '        input: text',
        '  - fields:',
        '      - label: Clave',
        '        input: password',
        '  - buttons: [Cancelar, Entrar]',
      ].join('\n'),
    );
    expect(out.startsWith('@startsalt')).toBe(true);
    expect(out).toContain('Usuario |');
    expect(out).toContain('****');
    expect(out).toContain('[ Entrar ]');
  });

  it('admite separadores', () => {
    expect(src('type: wireframe\nrows:\n  - separator: true\n  - text: Fin')).toContain('  ..');
  });

  it('neutraliza los caracteres que son sintaxis de Salt', () => {
    const out = src('type: wireframe\nrows:\n  - text: "usa | y { llaves }"');
    expect(out).not.toMatch(/usa \|/);
  });

  it('rechaza un tipo de campo inexistente', () => {
    expectReport(
      () => src('type: wireframe\nrows:\n  - fields:\n      - label: X\n        input: holograma'),
      /tipos validos/,
    );
  });

  it('rechaza una fila sin contenido', () => {
    expect(() => src('type: wireframe\nrows:\n  - {}')).toThrow(/necesita fields, buttons o text/);
  });
});

describe('json y yaml', () => {
  it('json emite la estructura entre las marcas de PlantUML', () => {
    const out = src('type: json\ndata:\n  id: 1\n  estado: ok');
    expect(out.startsWith('@startjson')).toBe(true);
    expect(out).toContain('"estado": "ok"');
  });

  it('yaml conserva la anidacion y las listas', () => {
    const out = src('type: yaml\ndata:\n  replicas: 3\n  puertos:\n    - 8080\n    - 8443');
    expect(out).toContain('replicas: 3');
    expect(out).toContain('- 8080');
  });

  it('exige el campo data', () => {
    expect(() => src('type: json\ntitle: X')).toThrow(/debe contener la estructura/);
  });
});

describe('wbs', () => {
  it('anida el trabajo por niveles', () => {
    const out = src(
      'type: wbs\nroot: Proyecto\nbranches:\n  - name: Analisis\n    children: [Requisitos]\n  - Construccion',
    );
    expect(out).toContain('* Proyecto');
    expect(out).toContain('** Analisis');
    expect(out).toContain('*** Requisitos');
  });
});

describe('journey', () => {
  it('escribe secciones, puntuacion y actores', () => {
    const out = src(
      [
        'type: journey',
        'sections:',
        '  - name: Registro',
        '    steps:',
        '      - name: Formulario',
        '        score: 3',
        '        actors: [Cliente, Soporte]',
      ].join('\n'),
    );
    expect(out.startsWith('journey')).toBe(true);
    expect(out).toContain('section Registro');
    expect(out).toContain('Formulario: 3: Cliente, Soporte');
  });

  it('usa Usuario cuando no se declaran actores', () => {
    expect(src('type: journey\nsections:\n  - name: S\n    steps: [Paso]')).toContain(': 3: Usuario');
  });

  it('rechaza una puntuacion fuera de rango', () => {
    expect(() =>
      src('type: journey\nsections:\n  - name: S\n    steps:\n      - name: P\n        score: 9'),
    ).toThrow(/entre 1 y 5/);
  });
});

describe('git-graph', () => {
  it('emite ramas, commits y fusiones', () => {
    const out = src(
      [
        'type: git-graph',
        'commits:',
        '  - commit: inicial',
        '  - branch: develop',
        '  - commit: funcionalidad',
        '  - checkout: main',
        '  - merge: develop',
      ].join('\n'),
    );
    expect(out.startsWith('gitGraph')).toBe(true);
    expect(out).toContain('branch develop');
    expect(out).toContain('merge develop');
  });

  it('rechaza fusionar una rama que aun no existe', () => {
    expect(() => src('type: git-graph\ncommits:\n  - merge: fantasma')).toThrow(/no se ha creado todavia/);
  });

  it('convierte los nombres con espacios en identificadores validos', () => {
    expect(src('type: git-graph\ncommits:\n  - branch: mi rama')).toContain('branch mi-rama');
  });
});

describe('kanban, sankey y treemap', () => {
  it('kanban reparte tarjetas por columna', () => {
    const out = src('type: kanban\ncolumns:\n  - name: En curso\n    items:\n      - name: Tarea\n        assignee: Ana');
    expect(out.startsWith('kanban')).toBe(true);
    expect(out).toContain('[Tarea]');
    expect(out).toContain("assigned: 'Ana'");
  });

  it('sankey emite el CSV que espera Mermaid', () => {
    const out = src('type: sankey\nflows:\n  - from: Origen\n    to: Destino\n    value: 5');
    expect(out).toContain('sankey-beta');
    expect(out).toContain('Origen,Destino,5');
  });

  it('sankey entrecomilla los nombres con coma', () => {
    expect(src('type: sankey\nflows:\n  - from: "A, B"\n    to: C\n    value: 1')).toContain('"A, B",C,1');
  });

  it('sankey rechaza valores no positivos', () => {
    expect(() => src('type: sankey\nflows:\n  - from: A\n    to: B\n    value: 0')).toThrow(/debe ser positivo/);
  });

  it('treemap anida los grupos', () => {
    const out = src('type: treemap\ngroups:\n  - name: Backend\n    items:\n      - name: API\n        value: 40');
    expect(out).toContain('treemap-beta');
    expect(out).toContain('"Backend"');
    expect(out).toContain('"API": 40');
  });
});

describe('quadrant y radar', () => {
  it('quadrant sitúa los elementos por coordenadas', () => {
    const out = src(
      [
        'type: quadrant',
        'xAxis: [Bajo, Alto]',
        'yAxis: [Bajo, Alto]',
        'quadrants: [A, B, C, D]',
        'items:',
        '  - name: Automatizar',
        '    x: 0.3',
        '    y: 0.8',
      ].join('\n'),
    );
    expect(out).toContain('x-axis Bajo --> Alto');
    expect(out).toContain('quadrant-1 A');
    expect(out).toContain('Automatizar: [0.3, 0.8]');
  });

  it('quadrant exige coordenadas entre 0 y 1', () => {
    expect(() =>
      src('type: quadrant\nxAxis: [a, b]\nyAxis: [c, d]\nquadrants: [1,2,3,4]\nitems:\n  - name: X\n    x: 4\n    y: 0.5'),
    ).toThrow(/entre 0 y 1/);
  });

  it('radar exige un valor por eje', () => {
    expectReport(() => src('type: radar\naxes: [A, B, C]\nvalues: [1, 2]'), /un valor por eje/);
  });

  it('radar admite varias series', () => {
    const out = src(
      'type: radar\naxes: [A, B, C]\nmax: 5\nseries:\n  - name: Actual\n    values: [1,2,3]\n  - name: Meta\n    values: [4,4,4]',
    );
    expect(out).toContain('curve c1["Actual"]{1, 2, 3}');
    expect(out).toContain('curve c2["Meta"]{4, 4, 4}');
    expect(out).toContain('max 5');
  });

  it('radar exige al menos tres ejes', () => {
    expect(() => src('type: radar\naxes: [A, B]\nvalues: [1, 2]')).toThrow(/al menos tres ejes/);
  });
});

describe('block y mindmap', () => {
  it('block reparte los bloques en una rejilla', () => {
    const out = src('type: block\nrows:\n  - [Presentacion]\n  - [Aplicacion, Dominio]');
    expect(out).toContain('columns 2');
    expect(out).toContain('["Presentacion"]');
  });

  it('block admite bloques que ocupan varias columnas', () => {
    expect(src('type: block\nrows:\n  - [{name: Ancho, span: 2}]\n  - [A, B]')).toContain(':2');
  });

  it('mindmap anida las ramas por indentacion', () => {
    const out = src('type: mindmap\nroot: Calidad\nbranches:\n  - name: Pruebas\n    children: [Unitarias]');
    expect(out).toContain('root((Calidad))');
    expect(out).toContain('    Pruebas');
    expect(out).toContain('      Unitarias');
  });
});

describe('bpmn', () => {
  const yaml = [
    'type: bpmn',
    'flow:',
    '  - start: Solicitud',
    '  - task: Revisar',
    '  - gateway: Aprobada?',
    '    yes:',
    '      - task: Notificar',
    '      - end: Aprobada',
    '    no:',
    '      - end: Rechazada',
  ].join('\n');

  it('genera BPMN 2.0 con proceso y diagrama', () => {
    const out = src(yaml);
    expect(out).toContain('<bpmn:definitions');
    expect(out).toContain('<bpmn:startEvent');
    expect(out).toContain('<bpmn:exclusiveGateway');
    expect(out).toContain('<bpmndi:BPMNDiagram');
  });

  it('calcula las coordenadas de cada figura', () => {
    const out = src(yaml);
    const bounds = out.match(/<dc:Bounds x="(\d+)" y="(\d+)"/g) ?? [];
    // Seis figuras: inicio, tarea, compuerta, tarea, y dos finales.
    expect(bounds.length).toBe(6);
    // Las ramas de la compuerta ocupan filas distintas.
    const ys = new Set((out.match(/<dc:Bounds x="\d+" y="(\d+)"/g) ?? []).map((b) => /y="(\d+)"/.exec(b)![1]));
    expect(ys.size).toBeGreaterThan(1);
  });

  it('etiqueta las ramas de la compuerta', () => {
    const out = src(yaml);
    expect(out).toContain('name="si"');
    expect(out).toContain('name="no"');
  });

  it('traza la flecha de la rama inferior con un quiebre', () => {
    const out = src(yaml);
    const edges = out.match(/<bpmndi:BPMNEdge[^>]*>.*?<\/bpmndi:BPMNEdge>/g) ?? [];
    expect(edges.some((e) => (e.match(/<di:waypoint/g) ?? []).length === 3)).toBe(true);
  });

  it('escapa los caracteres XML de las etiquetas', () => {
    expect(src('type: bpmn\nflow:\n  - task: "A & B <C>"')).toContain('A &amp; B &lt;C&gt;');
  });

  it('rechaza una compuerta sin ramas', () => {
    expect(() => src('type: bpmn\nflow:\n  - gateway: Sin ramas')).toThrow(/no tiene ramas/);
  });

  it('rechaza un paso que no es start, task, gateway ni end', () => {
    expect(() => src('type: bpmn\nflow:\n  - baile: X')).toThrow(/no se entiende el paso/);
  });
});

describe('ascii', () => {
  it('conserva el dibujo tal cual', () => {
    const art = ['  .---.', '  | A |', "  '---'"].join('\n');
    const out = compileDsl('diagram', `type: ascii\nart: |\n${art.split('\n').map((l) => `  ${l}`).join('\n')}`);
    expect(out.rendererType).toBe('svgbob');
    expect(out.source).toContain('.---.');
    expect(out.source).toContain('| A |');
  });

  it('exige el dibujo y explica como escribirlo', () => {
    try {
      compileDsl('diagram', 'type: ascii\ntitle: X');
      throw new Error('deberia haber fallado');
    } catch (err) {
      expect((err as DslValidationError).format()).toContain('bloque literal');
    }
  });
});

describe('graficos anadidos', () => {
  it('histogram agrupa los valores en intervalos', () => {
    const spec = chart('type: histogram\nbins: 8\nvalues: [1, 2, 2, 3, 5, 8]');
    const encoding = spec['encoding'] as Record<string, Record<string, unknown>>;
    expect(encoding['x']!['bin']).toEqual({ maxbins: 8 });
    expect(encoding['y']!['aggregate']).toBe('count');
  });

  it('histogram rechaza valores no numericos', () => {
    expect(() => chart('type: histogram\nvalues: [1, dos]')).toThrow(/numerico/);
  });

  it('box-plot exige al menos tres observaciones por grupo', () => {
    expectReport(() => chart('type: box-plot\ngroups:\n  - name: A\n    values: [1, 2]'), /al menos tres/);
  });

  it('box-plot usa la marca de caja', () => {
    const spec = chart('type: box-plot\ngroups:\n  - name: A\n    values: [1, 2, 3, 4]');
    expect((spec['mark'] as Record<string, unknown>)['type']).toBe('boxplot');
  });

  it('bullet superpone el objetivo sobre el valor', () => {
    const spec = chart('type: bullet\ndata:\n  - label: Cobertura\n    value: 74\n    target: 80');
    const layers = spec['layer'] as Array<Record<string, Record<string, unknown>>>;
    expect(layers).toHaveLength(2);
    expect(layers[1]!['mark']!['type']).toBe('tick');
    // El objetivo no debe quedar pegado al borde del grafico.
    const scale = (layers[0]!['encoding'] as Record<string, Record<string, unknown>>)['x']!['scale'] as Record<string, number>;
    expect(scale['domainMax']).toBeGreaterThan(80);
  });

  it('bullet exige valor y objetivo', () => {
    expect(() => chart('type: bullet\ndata:\n  - label: X\n    value: 1')).toThrow(/target/);
  });

  it('slope traza dos momentos por elemento', () => {
    const spec = chart('type: slope\nfrom: SP1\nto: SP5\ndata:\n  - label: Backend\n    before: 41\n    after: 81');
    const values = spec['data'] as { values: Array<Record<string, unknown>> };
    expect(values.values).toHaveLength(2);
    expect(values.values[0]!['momento']).toBe('SP1');
    expect(values.values[1]!['momento']).toBe('SP5');
  });

  it('funnel calcula el porcentaje respecto a la primera etapa', () => {
    const spec = chart('type: funnel\ndata:\n  - label: Visitas\n    value: 1000\n  - label: Registros\n    value: 250');
    const values = (spec['data'] as { values: Array<Record<string, number>> }).values;
    expect(values[0]!['porcentaje']).toBe(100);
    expect(values[1]!['porcentaje']).toBe(25);
  });

  it('stacked-area apila las series', () => {
    const spec = chart(
      'type: stacked-area\nseries:\n  - name: A\n    data:\n      - label: Ene\n        value: 1',
    );
    expect((spec['mark'] as Record<string, unknown>)['type']).toBe('area');
    const encoding = spec['encoding'] as Record<string, Record<string, unknown>>;
    expect(encoding['y']!['stack']).toBe('zero');
  });
});
