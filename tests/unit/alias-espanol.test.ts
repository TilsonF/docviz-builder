/**
 * Campos de hoja en espanol.
 *
 * El DSL ya aceptaba espanol en los campos contenedor, pero cada alias estaba
 * escrito a mano dentro del compilador que lo recordo y ninguno llegaba a los
 * campos de dentro. El resultado era arbitrario: `fecha` valia en un tipo,
 * `etiqueta` en ninguno, y `valor` colaba solo porque `docviz fix` lo confunde
 * con una errata de `value`.
 */

import { describe, expect, it } from 'vitest';
import { compileDsl } from '../../src/dsl/index.js';
import { DslValidationError } from '../../src/core/errors.js';
import { TYPE_CATALOG } from '../../src/dsl/catalog.js';

const fuente = (lang: 'diagram' | 'chart' | 'architecture', yaml: string): string =>
  compileDsl(lang, yaml).source;

describe('un bloque en espanol produce exactamente el mismo dibujo', () => {
  // Comparar la fuente compilada y no «que no falle»: si el alias se leyera en
  // el sitio equivocado, el bloque compilaria igual y dibujaria otra cosa.
  const pares: Array<[string, 'diagram' | 'chart' | 'architecture', string, string]> = [
    [
      'kpi-card',
      'chart',
      'type: kpi-card\ndata:\n  - label: Cobertura\n    value: 74\n    unit: " %"\n    target: 80\n',
      'type: kpi-card\ndata:\n  - etiqueta: Cobertura\n    valor: 74\n    unidad: " %"\n    meta: 80\n',
    ],
    [
      'gantt',
      'diagram',
      'type: gantt\ntitle: Ciclo\nsections:\n  - name: A\n    tasks:\n      - name: T\n        start: 2026-09-01\n        duration: 5d\n        status: done\n',
      'type: gantt\ntitulo: Ciclo\nsections:\n  - nombre: A\n    tasks:\n      - nombre: T\n        inicio: 2026-09-01\n        duracion: 5d\n        estado: done\n',
    ],
    [
      'c4-context',
      'architecture',
      'type: c4-context\nelements:\n  - id: a\n    kind: system\n    name: Plataforma\n    description: Nucleo\n',
      'type: c4-context\nelements:\n  - id: a\n    clase: system\n    nombre: Plataforma\n    descripcion: Nucleo\n',
    ],
    [
      'lollipop',
      'chart',
      'type: lollipop\nsort: value\ndata:\n  - label: A\n    value: 3\n',
      'type: lollipop\norden: value\ndata:\n  - etiqueta: A\n    valor: 3\n',
    ],
  ];

  for (const [nombre, lang, en, es] of pares) {
    it(`${nombre}: en espanol y en ingles compilan igual`, () => {
      expect(fuente(lang, es)).toBe(fuente(lang, en));
    });
  }
});

describe('limites de la tabla de alias', () => {
  it('el campo canonico gana cuando estan los dos', () => {
    const doc = 'type: bullet\ndata:\n  - label: A\n    value: 1\n    target: 9\n    meta: 2\n';
    expect(fuente('chart', doc)).toContain('"target": 9');
  });

  it('`no` sigue siendo un campo canonico y no un alias de nada', () => {
    // Es la rama negativa de una puerta de decision. Aliasarlo la habria roto.
    const uml = fuente(
      'diagram',
      'type: bpmn\nflow:\n  - start: Inicio\n  - gateway: Aprobada?\n    yes:\n      - end: Si\n    no:\n      - end: No\n',
    );
    expect(uml).toContain('Aprobada?');
  });

  it('`tipo` NO es alias de `type`: se señala, no se adivina', () => {
    // `type` es el discriminador y lo lee el escaner antes de compilar.
    // Aceptarlo aqui escondería el error en vez de reportarlo.
    expect(() => compileDsl('chart', 'tipo: bar\ndata:\n  - label: A\n    value: 1\n')).toThrow(
      DslValidationError,
    );
  });

  it('un alias no convierte en valido un campo que no existe', () => {
    expect(() => compileDsl('chart', 'type: bar\ndata:\n  - etiqueta: A\n')).toThrow(DslValidationError);
  });

  it('el alias no se reporta como campo sin usar', () => {
    // Se lee con `record[...]` justamente para que el rastreador de accesos lo
    // vea; con `in` habria quedado como ignorado.
    const out = compileDsl('chart', 'type: bar\ndata:\n  - etiqueta: A\n    valor: 1\n');
    expect(out.warnings ?? []).toEqual([]);
  });
});

describe('cada alias de la tabla funciona contra un ejemplo real', () => {
  // Una tabla de alias se escribe una vez y se olvida. Esto la recorre entera
  // y, por cada entrada, busca un tipo del catalogo que use el campo canonico,
  // lo traduce y comprueba que compile IGUAL. Un alias que dejara de llegar a
  // su campo —porque alguien cambio un compilador— se caeria aqui.
  const ALIAS: Readonly<Record<string, string>> = {
    etiqueta: 'label',
    valor: 'value',
    meta: 'target',
    fecha: 'date',
    nombre: 'name',
    inicio: 'start',
    fin: 'end',
    duracion: 'duration',
    orden: 'sort',
    unidad: 'unit',
    tecnologia: 'technology',
    titulo: 'title',
    desde: 'from',
    hasta: 'to',
    clase: 'kind',
    padre: 'parent',
    cantidad: 'value',
    objetivo: 'target',
  };

  // `json` y `yaml` dibujan el arbol que reciben tal cual, asi que ahi una
  // clave es DATO y renombrarla cambia el dibujo con razon. No sirven para
  // comprobar alias.
  const LITERALES = new Set(['json', 'yaml']);

  for (const [es, en] of Object.entries(ALIAS)) {
    it(`${es} -> ${en}`, () => {
      const re = new RegExp(`^(\\s*)(- )?${en}(\\s*:)`, 'm');
      const spec = TYPE_CATALOG.find((s) => !LITERALES.has(s.type) && re.test(s.example));
      // Si esto falla, el alias apunta a un campo que ningun ejemplo enseña:
      // o sobra de la tabla, o falta en un ejemplo.
      expect(spec, `ningun ejemplo usa "${en}"`).toBeDefined();
      const traducido = spec!.example.replace(re, (_m, sangria: string, guion: string | undefined, dosPuntos: string) =>
        `${sangria}${guion ?? ''}${es}${dosPuntos}`,
      );
      expect(fuente(spec!.lang, traducido)).toBe(fuente(spec!.lang, spec!.example));
    });
  }
});

describe('alias que ningun ejemplo del catalogo enseña', () => {
  // `description`, `status` e `id` son campos validos que los compiladores
  // leen, pero ningun ejemplo los muestra. No son alias muertos —se comprueba
  // aqui— pero si un hueco de documentacion: un agente no puede descubrirlos.
  it('descripcion llega a description', () => {
    const con = 'type: c4-context\nelements:\n  - id: a\n    kind: system\n    name: A\n    description: Nucleo\n';
    const es = 'type: c4-context\nelements:\n  - id: a\n    kind: system\n    name: A\n    descripcion: Nucleo\n';
    expect(fuente('architecture', es)).toBe(fuente('architecture', con));
  });

  it('estado llega a status', () => {
    const base = (campo: string): string =>
      `type: gantt\nsections:\n  - name: S\n    tasks:\n      - name: T\n        start: 2026-09-01\n        duration: 3d\n        ${campo}: done\n`;
    expect(fuente('diagram', base('estado'))).toBe(fuente('diagram', base('status')));
  });

  it('identificador llega a id', () => {
    const base = (campo: string): string =>
      `type: c4-context\nelements:\n  - ${campo}: a\n    kind: system\n    name: A\n`;
    expect(fuente('architecture', base('identificador'))).toBe(fuente('architecture', base('id')));
  });
});
