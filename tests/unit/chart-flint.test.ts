/**
 * Tipos de grafico tomados del catalogo de plantillas de Flint.
 *
 * Se prueban aqui aparte porque comparten un origen y unas trampas comunes:
 * son todos capas o proyecciones, no una marca sencilla, y varios de sus
 * defectos solo se ven dibujados. Cada caso que sigue nacio de mirar el SVG al
 * lado del de Flint y encontrar algo que no cuadraba.
 */

import { describe, expect, it } from 'vitest';
import { compileDsl } from '../../src/dsl/index.js';
import { DslValidationError } from '../../src/core/errors.js';

const chart = (yaml: string): Record<string, unknown> =>
  JSON.parse(compileDsl('chart', yaml).source) as Record<string, unknown>;

const diagram = (yaml: string, isAvailable: (m: string) => boolean): { engine: string; spec: Record<string, unknown> } => {
  const out = compileDsl('diagram', yaml, isAvailable);
  return { engine: out.rendererType, spec: JSON.parse(out.source) as Record<string, unknown> };
};

describe('lollipop', () => {
  const base = ['type: lollipop', 'data:', '  - label: B', '    value: 10', '  - label: A', '    value: 30'].join('\n');

  it('son dos capas: la regla lleva el ojo y el circulo marca el final', () => {
    const capas = chart(base)['layer'] as Array<Record<string, unknown>>;
    expect(capas).toHaveLength(2);
    expect((capas[0]!['mark'] as Record<string, unknown>)['type']).toBe('rule');
    expect((capas[1]!['mark'] as Record<string, unknown>)['type']).toBe('circle');
  });

  it('respeta el orden escrito salvo que se pida ordenar por valor', () => {
    const y = (spec: Record<string, unknown>): unknown =>
      ((spec['encoding'] as Record<string, unknown>)['y'] as Record<string, unknown>)['sort'];
    expect(y(chart(base))).toBeNull();
    expect(y(chart(`${base}\nsort: value`))).toEqual({ field: 'value', order: 'descending' });
  });
});

describe('kpi-card', () => {
  const tarjetas = (extra = ''): Array<Record<string, unknown>> => {
    const spec = chart(
      [
        'type: kpi-card',
        'data:',
        '  - label: Cobertura',
        '    value: 74',
        '    target: 80',
        '  - label: Casos',
        '    value: 312',
        '  - label: Bloqueados',
        '    value: 9',
        '    target: 5',
        extra,
      ].join('\n'),
    );
    return ((spec['data'] as Record<string, unknown>)['values'] as Array<Record<string, unknown>>);
  };

  it('una tarjeta sin meta no pinta «undefined»', () => {
    // Una marca de texto sobre un campo ausente escribe la palabra en el SVG.
    expect(tarjetas()[1]!['nota']).toBe('');
  });

  it('conserva el orden escrito y no lo alfabetiza', () => {
    const spec = chart(['type: kpi-card', 'data:', '  - label: Zeta', '    value: 1', '  - label: Alfa', '    value: 2'].join('\n'));
    const columna = ((spec['facet'] as Record<string, unknown>)['column'] as Record<string, unknown>);
    expect(columna['sort']).toEqual({ field: 'orden', op: 'min' });
  });

  it('no lleva titulo: una fila de indicadores no es un grafico con encabezado', () => {
    // Sin el `null` explicito el escaner inyecta «Grafico» por defecto.
    expect(chart(['type: kpi-card', 'data:', '  - label: A', '    value: 1'].join('\n'))['title']).toBeNull();
  });

  it('por defecto cumplir es llegar a la meta', () => {
    expect(tarjetas()[0]!['estado']).toBe('no cumple');
  });

  it('con `lowerIsBetter` cumplir es no pasarse', () => {
    // 9 bloqueados sobre una meta de 5 se daba por cumplido, porque 9 > 5.
    const conDireccion = chart(
      ['type: kpi-card', 'data:', '  - label: Bloqueados', '    value: 9', '    target: 5', '    lowerIsBetter: true'].join('\n'),
    );
    const fila = ((conDireccion['data'] as Record<string, unknown>)['values'] as Array<Record<string, unknown>>)[0]!;
    expect(fila['estado']).toBe('no cumple');
    expect(tarjetas()[2]!['estado']).toBe('cumple');
  });

  it('el avance nunca se sale de su carril', () => {
    const fila = ((chart(['type: kpi-card', 'data:', '  - label: A', '    value: 400', '    target: 100'].join('\n'))['data'] as Record<string, unknown>)['values'] as Array<Record<string, unknown>>)[0]!;
    expect(fila['avance']).toBe(1);
  });
});

describe('sparkline', () => {
  const base = ['type: sparkline', 'data:', '  - label: a', '    value: 1', '  - label: b', '    value: 5'].join('\n');

  it('no lleva titulo ni ejes: va dentro de una frase', () => {
    const spec = chart(base);
    expect(spec['title']).toBeNull();
    expect(spec['height']).toBe(40);
  });

  it('`baseline: none` quita la linea de referencia', () => {
    expect((chart(base)['layer'] as unknown[]).length).toBe(3);
    expect((chart(`${base}\nbaseline: none`)['layer'] as unknown[]).length).toBe(2);
  });
});

describe('bump', () => {
  const base = [
    'type: bump',
    'series:',
    '  - name: A',
    '    data:',
    '      - label: SP1',
    '        value: 1',
    '      - label: SP2',
    '        value: 3',
  ].join('\n');

  it('el eje empieza en 1: no existe el puesto cero', () => {
    const capa = (chart(base)['layer'] as Array<Record<string, unknown>>)[0]!;
    const y = ((capa['encoding'] as Record<string, unknown>)['y'] as Record<string, unknown>);
    expect((y['scale'] as Record<string, unknown>)['domain']).toEqual([1, 3]);
    expect((y['scale'] as Record<string, unknown>)['reverse']).toBe(true);
  });

  it('exige varias series, porque una sola no adelanta a nadie', () => {
    expect(() => chart(['type: bump', 'data:', '  - label: SP1', '    value: 1'].join('\n'))).toThrow(DslValidationError);
  });
});

describe('calendar-heatmap', () => {
  it('rotula el mes una vez, no una por semana', () => {
    const spec = chart(['type: calendar-heatmap', 'data:', '  - date: 2026-09-01', '    value: 3'].join('\n'));
    const x = ((spec['encoding'] as Record<string, unknown>)['x'] as Record<string, unknown>);
    expect(x['timeUnit']).toBe('yearweek');
    expect(String((x['axis'] as Record<string, unknown>)['labelExpr'])).toContain('month(datum.value)');
  });

  it('pide la fecha por su nombre, no la adivina', () => {
    expect(() => chart(['type: calendar-heatmap', 'data:', '  - label: lunes', '    value: 3'].join('\n'))).toThrow(
      DslValidationError,
    );
  });
});

describe('respaldo Vega-Lite de gantt y radar', () => {
  // Mermaid necesita un Chromium y Vega-Lite no. Sin este respaldo, en una
  // maquina sin navegador estos dos tipos pasaban de dibujarse a no dibujarse.
  const sinMermaid = (motor: string): boolean => motor !== 'mermaid' && motor !== 'plantuml';

  const GANTT = [
    'type: gantt',
    'sections:',
    '  - name: Analisis',
    '    tasks:',
    '      - name: Leer HU',
    '        start: 2026-09-01',
    '        duration: 5d',
    '      - name: Auditar',
    '        after: Leer HU',
    '        duration: 3d',
  ].join('\n');

  it('con Mermaid disponible sigue siendo Mermaid', () => {
    expect(compileDsl('diagram', GANTT, () => true).rendererType).toBe('mermaid');
  });

  it('sin navegador ni Java cae a Vega-Lite y resuelve las fechas', () => {
    const { engine, spec } = diagram(GANTT, sinMermaid);
    expect(engine).toBe('vega-lite');
    // `after` encadena, asi que la segunda tarea empieza donde acabo la primera.
    const filas = ((spec['data'] as Record<string, unknown>)['values'] as Array<Record<string, unknown>>);
    expect(filas[0]).toMatchObject({ tarea: 'Leer HU', inicio: '2026-09-01', fin: '2026-09-06' });
    expect(filas[1]).toMatchObject({ tarea: 'Auditar', inicio: '2026-09-06', fin: '2026-09-09' });
  });

  it('un hito dura un dia, porque una barra de ancho cero no se ve', () => {
    const { spec } = diagram(
      ['type: gantt', 'sections:', '  - name: S', '    tasks:', '      - name: Entrega', '        start: 2026-09-10', '        status: milestone'].join('\n'),
      sinMermaid,
    );
    const fila = ((spec['data'] as Record<string, unknown>)['values'] as Array<Record<string, unknown>>)[0]!;
    expect(fila['inicio']).toBe('2026-09-10');
    expect(fila['fin']).toBe('2026-09-11');
  });

  it('el radar proyecta los ejes a coordenadas, porque Vega-Lite no es polar', () => {
    const { engine, spec } = diagram(
      ['type: radar', 'axes: [A, B, C]', 'max: 10', 'series:', '  - name: Actual', '    values: [10, 0, 5]'].join('\n'),
      sinMermaid,
    );
    expect(engine).toBe('vega-lite');
    const capas = spec['layer'] as Array<Record<string, unknown>>;
    const puntos = ((capas[1]!['data'] as Record<string, unknown>)['values'] as Array<Record<string, unknown>>);
    // El primer eje apunta hacia arriba: x = 0, y = -radio.
    expect(puntos[0]).toMatchObject({ eje: 'A', x: 0, y: -120 });
    // Un valor de 0 cae en el centro.
    expect(puntos[1]).toMatchObject({ eje: 'B', x: 0, y: 0 });
  });

  it('el radar sigue exigiendo tres ejes tambien por el respaldo', () => {
    expect(() =>
      diagram(['type: radar', 'axes: [A, B]', 'values: [1, 2]'].join('\n'), sinMermaid),
    ).toThrow(DslValidationError);
  });
});
