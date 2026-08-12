/**
 * Pruebas del catalogo de tipos.
 *
 * El catalogo es la fuente de verdad que consultan la CLI, el servidor MCP y la
 * documentacion; si se desincroniza de los compiladores, el error aparece en
 * tiempo de ejecucion y en casa del usuario. Estas pruebas lo impiden.
 */

import { describe, expect, it } from 'vitest';
import {
  allTypeNames,
  findType,
  TYPE_CATALOG,
  typeNames,
  typesFor,
  type TypeSpec,
} from '../../src/dsl/catalog.js';
import { compiledTypeNames, compilerEngines } from '../../src/dsl/compile.js';
import { compileDsl } from '../../src/dsl/index.js';
import { buildRegistry } from '../../src/renderers/index.js';
import { defaultConfig } from '../../src/config/load.js';

const registry = buildRegistry(defaultConfig(process.cwd()));
const available = (engine: string): boolean => registry.has(engine);

describe('integridad del catalogo', () => {
  it('cada tipo tiene compilador', () => {
    const compiled = new Set(compiledTypeNames());
    const missing = TYPE_CATALOG.filter((s) => s.lang !== 'chart' && !compiled.has(s.type));
    expect(missing.map((s) => s.type)).toEqual([]);
  });

  it('cada compilador esta en el catalogo', () => {
    const catalog = new Set(TYPE_CATALOG.map((s) => s.type));
    const orphans = compiledTypeNames().filter((t) => !catalog.has(t));
    expect(orphans).toEqual([]);
  });

  it('el motor preferido de cada tipo tiene compilador', () => {
    for (const spec of TYPE_CATALOG) {
      if (spec.lang === 'chart') continue;
      expect(compilerEngines(spec.type)).toContain(spec.engine);
    }
  });

  it('cada respaldo declarado tiene su propio compilador', () => {
    // Un respaldo sin compilador seria una promesa vacia: al faltar el motor
    // preferido, el build fallaria igual.
    for (const spec of TYPE_CATALOG) {
      for (const fallback of spec.fallbacks ?? []) {
        expect(compilerEngines(spec.type)).toContain(fallback);
      }
    }
  });

  it('no hay nombres ni alias repetidos', () => {
    const seen = new Map<string, string>();
    for (const spec of TYPE_CATALOG) {
      for (const name of [spec.type, ...(spec.aliases ?? [])]) {
        const previous = seen.get(name);
        expect(previous, `"${name}" lo declaran ${previous} y ${spec.type}`).toBeUndefined();
        seen.set(name, spec.type);
      }
    }
  });

  it('todo tipo se resuelve por su nombre y por sus alias', () => {
    for (const spec of TYPE_CATALOG) {
      expect(findType(spec.type)?.type).toBe(spec.type);
      for (const alias of spec.aliases ?? []) expect(findType(alias)?.type).toBe(spec.type);
    }
    expect(findType('  SEQUENCE  ')?.type).toBe('sequence');
    expect(findType('inexistente')).toBeUndefined();
  });

  it('los motores declarados son los que el proyecto registra', () => {
    const known = new Set([...registry.types(), 'plantuml-c4']);
    for (const spec of TYPE_CATALOG) {
      for (const engine of [spec.engine, ...(spec.fallbacks ?? [])]) {
        expect(known, `motor desconocido en ${spec.type}`).toContain(engine);
      }
    }
  });
});

describe('metadatos', () => {
  const required: Array<keyof TypeSpec> = ['purpose', 'whenToUse', 'whenNotToUse', 'example'];

  it('cada tipo describe para que sirve, cuando usarlo y cuando no', () => {
    for (const spec of TYPE_CATALOG) {
      for (const field of required) {
        const value = spec[field];
        expect(typeof value, `${spec.type}.${field}`).toBe('string');
        expect(String(value).length, `${spec.type}.${field} demasiado corto`).toBeGreaterThan(20);
      }
      expect(spec.keywords.length, `${spec.type} sin palabras clave`).toBeGreaterThan(2);
    }
  });

  it('el ejemplo declara el tipo al que pertenece', () => {
    for (const spec of TYPE_CATALOG) {
      // La arquitectura admite omitirlo, porque solo tiene una familia.
      if (spec.lang === 'architecture') continue;
      expect(spec.example, `${spec.type}`).toContain(`type: ${spec.type}`);
    }
  });

  it('el ejemplo de cada tipo compila y elige el motor declarado', () => {
    for (const spec of TYPE_CATALOG) {
      const compiled = compileDsl(spec.lang, spec.example, available);
      expect(compiled.rendererType, `${spec.type}`).toBe(spec.engine);
      expect(compiled.source.length, `${spec.type} produjo una fuente vacia`).toBeGreaterThan(10);
    }
  });
});

describe('consultas del catalogo', () => {
  it('agrupa por valla', () => {
    expect(typeNames('diagram')).toContain('sequence');
    expect(typeNames('chart')).toContain('bar');
    expect(typeNames('architecture')).toContain('c4-context');
    expect(typesFor('chart').every((s) => s.engine === 'vega-lite')).toBe(true);
  });

  it('devuelve los nombres ordenados', () => {
    const names = typeNames('diagram');
    expect([...names].sort()).toEqual(names);
  });

  it('allTypeNames incluye los alias', () => {
    expect(allTypeNames()).toContain('uml-sequence');
    expect(allTypeNames()).toContain('dependency-graph');
  });

  it('cubre las familias acordadas', () => {
    const names = new Set(TYPE_CATALOG.map((s) => s.type));
    for (const expected of [
      'erd', 'use-case', 'component', 'deployment', 'wireframe', 'json', 'yaml', 'wbs',
      'journey', 'git-graph', 'kanban', 'quadrant', 'sankey', 'treemap', 'radar', 'mindmap', 'block',
      'histogram', 'box-plot', 'bullet', 'slope', 'funnel', 'stacked-area',
      'bpmn', 'ascii',
    ]) {
      expect(names, `falta el tipo ${expected}`).toContain(expected);
    }
  });
});

describe('eleccion de motor', () => {
  it('usa el respaldo cuando el motor preferido no esta disponible', () => {
    const sinMermaid = (engine: string): boolean => engine !== 'mermaid' && registry.has(engine);
    // `gantt` prefiere Mermaid, que necesita navegador; PlantUML lo cubre.
    const compiled = compileDsl('diagram', findType('gantt')!.example, sinMermaid);
    expect(compiled.rendererType).toBe('plantuml');
    expect(compiled.source).toContain('@startgantt');
  });

  it('erd cae a Mermaid si no hay Java', () => {
    const sinPlantuml = (engine: string): boolean => engine !== 'plantuml' && registry.has(engine);
    const compiled = compileDsl('diagram', findType('erd')!.example, sinPlantuml);
    expect(compiled.rendererType).toBe('mermaid');
    expect(compiled.source).toContain('erDiagram');
  });

  it('C4 cae a PlantUML si LikeC4 no esta disponible', () => {
    const sinLikec4 = (engine: string): boolean => engine !== 'likec4';
    const compiled = compileDsl('architecture', findType('c4-context')!.example, sinLikec4);
    expect(compiled.rendererType).toBe('plantuml-c4');
    expect(compiled.source).toContain('!include <C4/C4_Context>');
  });

  it('falla con un mensaje accionable si no queda ningun motor', () => {
    expect(() => compileDsl('diagram', findType('journey')!.example, () => false)).toThrow(
      /no hay ninguno disponible/,
    );
  });

  it('rechaza un tipo declarado en la valla equivocada', () => {
    expect(() => compileDsl('diagram', 'type: bar\ndata:\n  - label: A\n    value: 1', available)).toThrow(
      /pertenece a la valla `chart`/,
    );
  });

  it('exige el campo type salvo en architecture', () => {
    expect(() => compileDsl('diagram', 'participants: [A, B]', available)).toThrow(/necesita un campo "type"/);
    expect(() =>
      compileDsl('architecture', 'elements:\n  - id: a\n    name: A', available),
    ).not.toThrow();
  });
});
