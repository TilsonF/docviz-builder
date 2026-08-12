/**
 * Compiladores de respaldo.
 *
 * Son los que permiten compilar en una maquina sin navegador o sin Java, asi
 * que necesitan la misma exigencia que los preferidos: si solo funcionaran a
 * medias, el respaldo seria una promesa vacia.
 */

import { describe, expect, it } from 'vitest';
import { architectureC4, d2Flow, mermaidErd, mermaidTimeline } from '../../src/dsl/fallbacks.js';
import { DslValidationError } from '../../src/core/errors.js';
import { parse as parseYaml } from 'yaml';

const doc = (yaml: string): Record<string, unknown> => parseYaml(yaml) as Record<string, unknown>;

describe('mermaidErd', () => {
  const yaml = [
    'entities:',
    '  - name: Pedido',
    '    fields:',
    '      - name: id',
    '        type: uuid',
    '        key: true',
    '      - name: total del pedido',
    '        type: decimal',
    '  - name: Linea',
    'relations:',
    '  - from: Pedido',
    '    to: Linea',
    '    cardinality: one-to-many',
    '    label: contiene',
  ].join('\n');

  it('emite la notacion de Mermaid con tipo antes del nombre', () => {
    const out = mermaidErd(doc(yaml));
    expect(out.startsWith('erDiagram')).toBe(true);
    expect(out).toContain('uuid id PK');
    // Mermaid no admite espacios dentro de un campo.
    expect(out).toContain('decimal total_del_pedido');
  });

  it('traduce la cardinalidad', () => {
    expect(mermaidErd(doc(yaml))).toContain('PEDIDO ||--o{ LINEA : "contiene"');
  });

  it('normaliza los nombres a identificadores validos', () => {
    const out = mermaidErd(doc('entities:\n  - name: Línea de pedido'));
    expect(out).toContain('LINEA_DE_PEDIDO');
  });

  it('usa una etiqueta por defecto si la relacion no la trae', () => {
    const out = mermaidErd(doc('entities: [{name: A}, {name: B}]\nrelations:\n  - from: A\n    to: B'));
    expect(out).toContain('"relacionado"');
  });

  it('rechaza entidades no declaradas y cardinalidades inexistentes', () => {
    expect(() => mermaidErd(doc('entities: [{name: A}]\nrelations:\n  - from: A\n    to: Z'))).toThrow(
      DslValidationError,
    );
    expect(() =>
      mermaidErd(doc('entities: [{name: A}, {name: B}]\nrelations:\n  - from: A\n    to: B\n    cardinality: rara')),
    ).toThrow(/no existe/);
  });

  it('admite entidades sin campos', () => {
    expect(mermaidErd(doc('entities: [{name: Solo}]'))).toContain('  SOLO');
  });
});

describe('d2Flow', () => {
  it('traduce la direccion de Mermaid a la de D2', () => {
    expect(d2Flow(doc('direction: lr\nflow:\n  - A -> B'))).toContain('direction: right');
    expect(d2Flow(doc('direction: tb\nflow:\n  - A -> B'))).toContain('direction: down');
    expect(d2Flow(doc('direction: bt\nflow:\n  - A -> B'))).toContain('direction: up');
    expect(d2Flow(doc('direction: rl\nflow:\n  - A -> B'))).toContain('direction: left');
  });

  it('declara los nodos sueltos y los de las relaciones', () => {
    const out = d2Flow(doc('nodes: [Aislado]\nflow:\n  - Uno -> Dos: pasa'));
    expect(out).toContain('"Aislado"');
    expect(out).toContain('"Uno"');
    expect(out).toContain(': "pasa"');
  });

  it('marca las relaciones discontinuas', () => {
    expect(d2Flow(doc('flow:\n  - A --> B'))).toContain('style.stroke-dash');
  });

  it('no declara dos veces el mismo nodo', () => {
    const out = d2Flow(doc('flow:\n  - A -> B\n  - B -> C'));
    expect((out.match(/^n2: /gm) ?? []).length).toBe(1);
  });
});

describe('mermaidTimeline', () => {
  it('emite las fases con sus hitos', () => {
    const out = mermaidTimeline(doc('title: Evolucion\nphases:\n  - name: 2025\n    items: [Piloto, Ajustes]'));
    expect(out.startsWith('timeline')).toBe(true);
    expect(out).toContain('title Evolucion');
    expect(out).toContain('2025 : Piloto : Ajustes');
  });

  it('admite fases sin hitos', () => {
    expect(mermaidTimeline(doc('phases: [2025, 2026]'))).toContain('  2025');
  });

  it('neutraliza los dos puntos, que son el separador', () => {
    expect(mermaidTimeline(doc('phases:\n  - name: "Fase: uno"'))).not.toContain('Fase:');
  });
});

describe('architectureC4', () => {
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
    '    label: Lee',
    '    technology: SQL',
  ].join('\n');

  it('incluye la biblioteca C4 que corresponde a la vista', () => {
    expect(architectureC4(doc(yaml))).toContain('!include <C4/C4_Container>');
    expect(architectureC4(doc('type: c4-context\nelements: [{id: a, name: A}]'))).toContain('C4_Context');
    expect(architectureC4(doc('type: c4-component\nelements: [{id: a, name: A}]'))).toContain('C4_Component');
  });

  it('usa la macro que corresponde a cada clase', () => {
    const out = architectureC4(doc(yaml));
    expect(out).toContain('Person(usuario');
    expect(out).toContain('Container(api');
    expect(out).toContain('ContainerDb(bd');
  });

  it('dibuja los elementos con hijos como frontera del sistema', () => {
    const out = architectureC4(doc(yaml));
    expect(out).toContain('System_Boundary(plataforma, "Plataforma") {');
    expect(out).toMatch(/System_Boundary[\s\S]*Container\(api[\s\S]*\}/);
  });

  it('emite la tecnologia de los contenedores y de las relaciones', () => {
    const out = architectureC4(doc(yaml));
    expect(out).toContain('"NestJS"');
    expect(out).toContain('Rel(api, bd, "Lee", "SQL")');
  });

  it('escribe el titulo cuando se declara', () => {
    expect(architectureC4(doc(yaml))).toContain('title Contenedores');
  });

  it('acepta la forma corta de relacion', () => {
    const out = architectureC4(doc('elements: [{id: a, name: A}, {id: b, name: B}]\nrelations:\n  - A -> B: usa'));
    expect(out).toContain('Rel(a, b, "usa")');
  });

  it('sanea identificadores no validos', () => {
    expect(architectureC4(doc('elements:\n  - name: Portal de Pagos (v2)'))).toContain('Portal_de_Pagos_v2');
  });

  it('rechaza clases, padres y referencias inexistentes', () => {
    expect(() => architectureC4(doc('elements:\n  - name: A\n    kind: dragon'))).toThrow(/no existe/);
    expect(() => architectureC4(doc('elements:\n  - name: A\n    parent: fantasma'))).toThrow(/elemento padre/);
    expect(() =>
      architectureC4(doc('elements: [{id: a, name: A}]\nrelations:\n  - from: a\n    to: z')),
    ).toThrow(/no corresponde a ningun elemento/);
  });

  it('sustituye las comillas de las etiquetas', () => {
    expect(architectureC4(doc('elements:\n  - name: Con "comillas"'))).not.toContain('"Con "comillas""');
  });
});
