/**
 * Los dos tipos de la 0.8 y los enlaces en los nodos.
 *
 * El mapa de historias y la matriz de permisos entran porque su insumo ya
 * existe en los proyectos: el backlog de Azure y el catalogo de permisos. Y el
 * enlace entra porque la capacidad ya estaba en el SVG —el saneador admite
 * `<a href>`— y no se podia alcanzar desde el DSL.
 */

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { compileChartType, compileType } from '../../src/dsl/compile.js';
import { compileDsl } from '../../src/dsl/index.js';
import { DocVizError } from '../../src/core/errors.js';

const compila = (yaml: string, tipo: string): string =>
  compileType(parseYaml(yaml) as Record<string, unknown>, tipo, () => true).source;

const grafico = (yaml: string, tipo: string): Record<string, unknown> =>
  JSON.parse(compileChartType(parseYaml(yaml) as Record<string, unknown>, tipo).source) as Record<string, unknown>;

// --------------------------------------------------------------------------

describe('story-map', () => {
  const base = [
    'type: story-map',
    'activities: [Alta, Cobro]',
    'releases: [MVP, R2]',
    'stories:',
    '  - {activity: Alta, release: MVP, name: Formulario}',
    '  - {activity: Cobro, release: R2, name: Anulacion}',
  ].join('\n');

  it('declara las dos dimensiones de la rejilla', () => {
    // Con solo `grid-columns`, D2 reparte por columnas y el mapa sale
    // transpuesto: compila, se dibuja, y dice lo contrario de lo escrito.
    const out = compila(base, 'story-map');
    expect(out).toContain('grid-rows: 3');
    expect(out).toContain('grid-columns: 3');
  });

  it('rotula las actividades arriba y las entregas a la izquierda', () => {
    const out = compila(base, 'story-map');
    const lineas = out.split('\n');
    const orden = lineas.filter((l) => /"(Alta|Cobro|MVP|R2)"/.test(l)).map((l) => /"([^"]+)"/.exec(l)![1]!);
    expect(orden.slice(0, 2)).toEqual(['Alta', 'Cobro']);
    expect(orden[2]).toBe('MVP');
  });

  it('deja marcada la celda vacia en lugar de descuadrar la rejilla', () => {
    const out = compila(base, 'story-map');
    // Dos entregas x dos actividades = 4 celdas, y solo dos tienen historia.
    expect(out.match(/style\.opacity: 0\.15/g)).toHaveLength(2);
  });

  it('una actividad mal escrita no desaparece en silencio', () => {
    const roto = base.replace('{activity: Cobro, release: R2', '{activity: Cobrar, release: R2');
    expect(() => compila(roto, 'story-map')).toThrow(/"Cobrar" no es una de las actividades/);
  });

  it('una entrega mal escrita tampoco', () => {
    const roto = base.replace('release: R2, name: Anulacion', 'release: R3, name: Anulacion');
    expect(() => compila(roto, 'story-map')).toThrow(/"R3" no es una de las entregas/);
  });

  it('sin `releases` las deduce del orden de aparicion', () => {
    const sinReleases = [
      'type: story-map',
      'activities: [Alta]',
      'stories:',
      '  - {activity: Alta, release: Segunda, name: B}',
      '  - {activity: Alta, release: Primera, name: A}',
    ].join('\n');
    const out = compila(sinReleases, 'story-map');
    expect(out).toContain('grid-rows: 3');
    expect(out.indexOf('"Segunda"')).toBeLessThan(out.indexOf('"Primera"'));
  });

  it('acepta los campos en espanol', () => {
    const es = [
      'type: story-map',
      'actividades: [Alta]',
      'entregas: [MVP]',
      'historias:',
      '  - {actividad: Alta, entrega: MVP, nombre: Formulario}',
    ].join('\n');
    expect(compila(es, 'story-map')).toContain('"Formulario"');
  });

  it('sin actividades no hay mapa', () => {
    expect(() => compila('type: story-map\nactivities: []\nstories: []', 'story-map')).toThrow(
      /diagram\.activities debe ser una lista con al menos un elemento/,
    );
  });
});

// --------------------------------------------------------------------------

describe('access-matrix', () => {
  const base = [
    'type: access-matrix',
    'data:',
    '  - {role: Analista, permission: Consultar, access: si}',
    '  - {role: Analista, permission: Anular, access: no}',
    '  - {role: Jefe, permission: Anular, access: condicionado}',
  ].join('\n');

  it('normaliza los tres estados', () => {
    const spec = grafico(base, 'access-matrix');
    const filas = (spec['data'] as { values: Array<{ estado: string }> }).values;
    expect(filas.map((f) => f.estado)).toEqual(['permitido', 'denegado', 'condicionado']);
  });

  it('escribe el estado en la celda, no solo el color', () => {
    // Una matriz de permisos que solo se distinga por color no se puede leer
    // impresa en blanco y negro, y acaba en una evidencia de auditoria.
    const capas = grafico(base, 'access-matrix')['layer'] as Array<Record<string, unknown>>;
    const texto = capas.find((c) => (c['mark'] as { type: string }).type === 'text')!;
    expect((texto['encoding'] as Record<string, unknown>)['text']).toEqual({
      field: 'etiqueta',
      type: 'nominal',
    });
  });

  it('el color del texto es una condicion, no una segunda escala', () => {
    // Vega-Lite fusiona las escalas del mismo campo entre capas: con dos, el
    // texto heredaba el color del fondo y la leyenda desaparecia entera.
    const capas = grafico(base, 'access-matrix')['layer'] as Array<Record<string, unknown>>;
    const texto = capas.find((c) => (c['mark'] as { type: string }).type === 'text')!;
    const color = (texto['encoding'] as Record<string, unknown>)['color'] as Record<string, unknown>;
    expect(color['scale']).toBeUndefined();
    expect(color['condition']).toBeDefined();
  });

  it('acepta las dos lenguas y las formas booleanas', () => {
    const mezcla = [
      'type: access-matrix',
      'data:',
      '  - {rol: A, permiso: P, acceso: yes}',
      '  - {rol: B, permiso: P, acceso: denied}',
      '  - {rol: C, permiso: P, acceso: partial}',
    ].join('\n');
    const filas = (grafico(mezcla, 'access-matrix')['data'] as { values: Array<{ estado: string }> }).values;
    expect(filas.map((f) => f.estado)).toEqual(['permitido', 'denegado', 'condicionado']);
  });

  it('un estado que no significa nada se rechaza en lugar de pintarse', () => {
    const roto = base.replace('access: si', 'access: quiza');
    expect(() => grafico(roto, 'access-matrix')).toThrow(/"quiza" no es un estado de acceso/);
  });
});

// --------------------------------------------------------------------------

describe('enlaces en los nodos', () => {
  it('un nodo con href se compila como enlace de D2', () => {
    const out = compila(
      [
        'type: capability-map',
        'domains:',
        '  - name: Pagos',
        '    href: https://outline.test/pagos',
        '    capabilities:',
        '      - {name: Conciliar, href: "https://dev.azure.com/x/_workitems/edit/1"}',
      ].join('\n'),
      'capability-map',
    );
    expect(out).toContain('link: "https://outline.test/pagos"');
    expect(out).toContain('{ link: "https://dev.azure.com/x/_workitems/edit/1" }');
  });

  it('admite fragmento y ruta relativa', () => {
    const out = compila('type: value-chain\nstages:\n  - {name: Alta, href: "#otra-figura"}', 'value-chain');
    expect(out).toContain('link: "#otra-figura"');
    const rel = compila('type: value-chain\nstages:\n  - {name: Alta, href: ./otro.md}', 'value-chain');
    expect(rel).toContain('link: "./otro.md"');
  });

  it('rechaza lo que el saneador quitaria en silencio', () => {
    // Sin esto el autor creeria que su enlace funciona: el SVG sale sin el y
    // nada lo dice.
    expect(() =>
      compila('type: value-chain\nstages:\n  - {name: Alta, href: "javascript:alert(1)"}', 'value-chain'),
    ).toThrow(DocVizError);
    expect(() =>
      compila('type: value-chain\nstages:\n  - {name: Alta, href: "mailto:a@b.c"}', 'value-chain'),
    ).toThrow(/no es una direccion que un visor pueda seguir/);
  });

  it('`link` y `enlace` nombran lo mismo', () => {
    for (const clave of ['link', 'enlace']) {
      const out = compila(`type: value-chain\nstages:\n  - {name: Alta, ${clave}: "#x"}`, 'value-chain');
      expect(out, clave).toContain('link: "#x"');
    }
  });
});

// --------------------------------------------------------------------------

describe('campos que el compilador si leyo', () => {
  it('`description` en la raiz no produce un aviso de campo desconocido', () => {
    // La 0.7 documento `description` como campo de todo bloque y lo dejo fuera
    // del conjunto de campos conocidos: cada bloque que siguiera el contrato
    // recibia un DV104.
    const out = compileDsl('diagram', 'type: flow\ntitle: T\ndescription: Lo que se ve\nflow:\n  - A -> B');
    expect(out.warnings ?? []).toEqual([]);
    expect(out.description).toBe('Lo que se ve');
  });

  it('un alias en espanol de un campo conocido tampoco', () => {
    const out = compileDsl('diagram', 'type: flow\ntitulo: T\ndescripcion: Lo que se ve\nflow:\n  - A -> B');
    expect(out.warnings ?? []).toEqual([]);
    expect(out.title).toBe('T');
  });

  it('los campos de un registro anidado se cuentan una sola vez', () => {
    // Envolver dos veces el mismo registro partia las lecturas en dos
    // conjuntos y campos leidos de verdad salian como ignorados.
    const out = compileDsl(
      'diagram',
      [
        'type: story-map',
        'activities: [Alta]',
        'stories:',
        '  - {activity: Alta, release: MVP, name: Formulario}',
      ].join('\n'),
    );
    expect(out.warnings ?? []).toEqual([]);
  });
});

describe('el mismo campo declarado dos veces', () => {
  it('avisa de cual de los dos nombres se usa', () => {
    // Antes salia como «campo desconocido» por accidente. Desde que los alias
    // son campos conocidos hay que decirlo a proposito: si no, el `titulo:`
    // que nadie lee queda mudo y el autor cree que puso un titulo.
    const out = compileDsl('diagram', 'type: flow\ntitle: A\ntitulo: B\nflow:\n  - X -> Y');
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings![0]!.message).toContain('se usa "title" y "titulo" se ignora');
    expect(out.title).toBe('A');
  });

  it('con uno solo de los dos no hay nada que avisar', () => {
    expect(compileDsl('diagram', 'type: flow\ntitulo: B\nflow:\n  - X -> Y').warnings ?? []).toEqual([]);
  });
});
