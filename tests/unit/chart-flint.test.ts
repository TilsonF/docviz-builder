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

describe('respaldo Vega-Lite de gantt · las ramas que la primera tanda no toco', () => {
  const sinMermaid = (motor: string): boolean => motor !== 'mermaid' && motor !== 'plantuml';
  const gantt = (tarea: string): Record<string, unknown> =>
    JSON.parse(
      compileDsl('diagram', `type: gantt\nsections:\n  - name: S\n    tasks:\n${tarea}`, sinMermaid).source,
    ) as Record<string, unknown>;
  const filas = (spec: Record<string, unknown>): Array<Record<string, unknown>> => {
    const datos = (spec['data'] ?? (spec['spec'] as Record<string, unknown>)?.['data']) as Record<string, unknown>;
    return datos['values'] as Array<Record<string, unknown>>;
  };

  it('entiende las unidades de duracion: horas, semanas y meses', () => {
    // Mermaid las acepta todas, asi que el respaldo tambien tiene que hacerlo:
    // si solo entendiera dias, el mismo bloque daria cronogramas distintos
    // segun hubiera navegador o no.
    const dia = (t: string): number => {
      const f = filas(gantt(`      - name: T\n        start: 2026-01-01\n        duration: ${t}\n`))[0]!;
      return (Date.parse(String(f['fin'])) - Date.parse(String(f['inicio']))) / 86_400_000;
    };
    expect(dia('24h')).toBe(1);
    expect(dia('2w')).toBe(14);
    expect(dia('1m')).toBe(30);
    expect(dia('3')).toBe(3);
  });

  it('rechaza una duracion que no se entiende, en vez de inventarse una', () => {
    expect(() => gantt('      - name: T\n        start: 2026-01-01\n        duration: un rato\n')).toThrow(
      DslValidationError,
    );
  });

  it('rechaza una fecha invalida en start y en end', () => {
    expect(() => gantt('      - name: T\n        start: ayer\n        duration: 2d\n')).toThrow(DslValidationError);
    expect(() => gantt('      - name: T\n        start: 2026-01-01\n        end: pasado\n')).toThrow(
      DslValidationError,
    );
  });

  it('exige start o after, y duration o end', () => {
    expect(() => gantt('      - name: T\n        duration: 2d\n')).toThrow(DslValidationError);
    expect(() => gantt('      - name: T\n        start: 2026-01-01\n')).toThrow(DslValidationError);
  });

  it('`after` de una tarea que no existe se reporta con las que si', () => {
    expect(() => gantt('      - name: T\n        after: Fantasma\n        duration: 2d\n')).toThrow(
      DslValidationError,
    );
  });

  it('acepta `end` en lugar de `duration`', () => {
    const f = filas(gantt('      - name: T\n        start: 2026-01-01\n        end: 2026-01-10\n'))[0]!;
    expect(f['fin']).toBe('2026-01-10');
  });

  it('con varias secciones las separa en filas del grafico', () => {
    // Mermaid dibuja las secciones como bandas; aqui se vuelven facetas, que es
    // el equivalente mas cercano sin reinventar el trazado.
    const spec = JSON.parse(
      compileDsl(
        'diagram',
        [
          'type: gantt',
          'sections:',
          '  - name: Analisis',
          '    tasks:',
          '      - name: A',
          '        start: 2026-01-01',
          '        duration: 2d',
          '  - name: Diseno',
          '    tasks:',
          '      - name: B',
          '        start: 2026-01-03',
          '        duration: 2d',
        ].join('\n'),
        sinMermaid,
      ).source,
    ) as Record<string, unknown>;
    expect(spec['facet']).toBeDefined();
    expect(JSON.stringify(spec['facet'])).toContain('seccion');
  });
});

describe('respaldo Vega-Lite de radar · las ramas que faltaban', () => {
  const sinMermaid = (motor: string): boolean => motor !== 'mermaid';
  const radar = (yaml: string): Record<string, unknown> =>
    JSON.parse(compileDsl('diagram', yaml, sinMermaid).source) as Record<string, unknown>;

  it('acepta `values` suelto, sin series', () => {
    const spec = radar('type: radar\naxes: [A, B, C]\nvalues: [1, 2, 3]\n');
    const puntos = ((spec['layer'] as Array<Record<string, unknown>>)[1]!['data'] as Record<string, unknown>)[
      'values'
    ] as Array<Record<string, unknown>>;
    expect(puntos).toHaveLength(3);
    expect(puntos[0]!['serie']).toBe('Actual');
  });

  it('sin `max` lo deduce del mayor valor declarado', () => {
    // Sin esto el radar se dibujaria siempre pegado al borde o diminuto.
    const spec = radar('type: radar\naxes: [A, B, C]\nvalues: [2, 4, 8]\n');
    const puntos = ((spec['layer'] as Array<Record<string, unknown>>)[1]!['data'] as Record<string, unknown>)[
      'values'
    ] as Array<Record<string, unknown>>;
    // El valor maximo cae en el radio completo: 8/8 * 120.
    expect(Math.hypot(Number(puntos[2]!['x']), Number(puntos[2]!['y']))).toBeCloseTo(120, 1);
  });

  it('un eje sin valor cuenta como cero y no rompe el poligono', () => {
    const spec = radar('type: radar\naxes: [A, B, C, D]\nmax: 10\nvalues: [5, 5]\n');
    const puntos = ((spec['layer'] as Array<Record<string, unknown>>)[1]!['data'] as Record<string, unknown>)[
      'values'
    ] as Array<Record<string, unknown>>;
    expect(puntos).toHaveLength(4);
    expect(puntos[3]).toMatchObject({ x: 0, y: 0 });
  });

  it('sin series ni values no se dibuja nada y se dice', () => {
    expect(() => radar('type: radar\naxes: [A, B, C]\n')).toThrow(DslValidationError);
  });

  it('acepta `seriesName` para nombrar la curva suelta', () => {
    const spec = radar('type: radar\naxes: [A, B, C]\nseriesName: Objetivo\nvalues: [1, 2, 3]\n');
    expect(JSON.stringify(spec)).toContain('Objetivo');
  });
});

describe('los bordes de sparkline y kpi-card', () => {
  const datos = (spec: Record<string, unknown>): Array<Record<string, unknown>> =>
    (spec['data'] as Record<string, unknown>)['values'] as Array<Record<string, unknown>>;

  it('la mediana de un numero PAR de puntos es el promedio de los dos centrales', () => {
    // Con cuatro puntos la mediana cae entre el segundo y el tercero. Un
    // `Math.floor` mal puesto daria el tercero y la linea de referencia saldria
    // desplazada sin que nada fallara.
    const spec = chart(
      ['type: sparkline', 'baseline: median', 'data:', ...[1, 2, 10, 20].map((v, i) => `  - label: s${i}\n    value: ${v}`)].join('\n'),
    );
    const regla = (spec['layer'] as Array<Record<string, unknown>>)[2]!;
    const y = ((regla['encoding'] as Record<string, unknown>)['y'] as Record<string, unknown>);
    expect(y['datum']).toBe(6);
  });

  it('un `baseline` numerico se toma tal cual', () => {
    const spec = chart('type: sparkline\nbaseline: 7\ndata:\n  - label: a\n    value: 1\n  - label: b\n    value: 5\n');
    const regla = (spec['layer'] as Array<Record<string, unknown>>)[2]!;
    expect(((regla['encoding'] as Record<string, unknown>)['y'] as Record<string, unknown>)['datum']).toBe(7);
  });

  it('un valor decimal se muestra con un decimal, no con quince', () => {
    const spec = chart('type: kpi-card\ndata:\n  - label: Media\n    value: 3.14159\n');
    expect(datos(spec)[0]!['texto']).toBe('3.1');
  });

  it('una meta de cero no divide entre cero', () => {
    // `Bloqueados: meta 0` es una meta legitima —ninguno— y antes habria dado
    // Infinity o NaN en el avance.
    const spec = chart('type: kpi-card\ndata:\n  - label: Bloqueados\n    value: 0\n    target: 0\n    lowerIsBetter: true\n');
    const fila = datos(spec)[0]!;
    expect(Number.isFinite(Number(fila['avance']))).toBe(true);
    expect(fila['estado']).toBe('cumple');
  });

  it('sin meta no hay barra de avance ni nota', () => {
    const spec = chart('type: kpi-card\ndata:\n  - label: Casos\n    value: 312\n');
    expect(datos(spec)[0]!['nota']).toBe('');
    // Dos capas: el numero y su etiqueta. Nada mas.
    expect((spec['spec'] as Record<string, unknown>)['layer']).toHaveLength(2);
  });

  it('acepta `indicadores` como sinonimo de `data`', () => {
    const spec = chart('type: kpi-card\nindicadores:\n  - label: A\n    value: 1\n');
    expect(datos(spec)).toHaveLength(1);
  });
});

describe('funnel con la primera etapa en cero', () => {
  it('no divide entre cero al calcular el porcentaje', () => {
    // Un embudo que arranca en cero es un dato raro pero valido —nadie entro
    // todavia—, y la division lo habria vuelto NaN en todas las etapas.
    const spec = chart('type: funnel\ndata:\n  - label: Visitas\n    value: 0\n  - label: Altas\n    value: 0\n');
    const filas = ((spec['data'] as Record<string, unknown>)['values'] as Array<Record<string, unknown>>);
    expect(filas.every((f) => f['porcentaje'] === 0)).toBe(true);
  });
});
