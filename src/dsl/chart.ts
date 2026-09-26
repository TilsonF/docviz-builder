/**
 * Bloque `chart`: datos declarativos -> especificacion Vega-Lite -> SVG.
 *
 * El agente escribe etiquetas y valores; no escribe una especificacion
 * Vega-Lite. Todo el trabajo de encoding, escalas y leyendas ocurre aqui.
 */

import { fail } from './util.js';
import {
  asRecord,
  optionalArray,
  optionalNumber,
  optionalString,
  requireArray,
  requireNumber,
  requireString,
} from './util.js';

interface Point {
  label: string;
  value: number;
  series?: string;
}

/**
 * Compila un grafico de un tipo ya resuelto por el catalogo.
 *
 * Separar la resolucion del tipo de su compilacion permite que el catalogo sea
 * la unica fuente de nombres y alias.
 */
export function compileChartOfType(doc: Record<string, unknown>, type: string): string {
  const title = optionalString(doc, 'title');
  const xTitle = optionalString(doc, 'xTitle') ?? optionalString(doc, 'xLabel');
  const yTitle = optionalString(doc, 'yTitle') ?? optionalString(doc, 'yLabel');

  const spec: Record<string, unknown> = {};
  if (title !== undefined) spec['title'] = title;

  switch (type) {
    case 'scatter':
      Object.assign(spec, scatter(doc, xTitle, yTitle));
      break;
    case 'heatmap':
      Object.assign(spec, heatmap(doc, xTitle, yTitle));
      break;
    case 'pie':
    case 'donut':
      Object.assign(spec, pie(doc, type === 'donut'));
      break;
    case 'waterfall':
      Object.assign(spec, waterfall(doc, xTitle, yTitle));
      break;
    case 'histogram':
      Object.assign(spec, histogram(doc, xTitle, yTitle));
      break;
    case 'box-plot':
      Object.assign(spec, boxPlot(doc, xTitle, yTitle));
      break;
    case 'bullet':
      Object.assign(spec, bullet(doc, xTitle));
      break;
    case 'slope':
      Object.assign(spec, slope(doc, yTitle));
      break;
    case 'funnel':
      Object.assign(spec, funnel(doc, xTitle));
      break;
    case 'lollipop':
      Object.assign(spec, lollipop(doc, xTitle));
      break;
    case 'sparkline':
      Object.assign(spec, sparkline(doc));
      break;
    case 'kpi-card':
      Object.assign(spec, kpiCard(doc));
      break;
    case 'calendar-heatmap':
      Object.assign(spec, calendarHeatmap(doc));
      break;
    case 'bump':
      Object.assign(spec, bump(doc, xTitle));
      break;
    default:
      Object.assign(spec, cartesian(type, doc, xTitle, yTitle));
      break;
  }

  return JSON.stringify(spec, null, 2);
}

/**
 * Lee `data:` (lista plana) o `series:` (varias series con nombre) y devuelve
 * una tabla unica en formato largo, que es lo que Vega-Lite consume mejor.
 */
function readPoints(doc: Record<string, unknown>): { points: Point[]; multiSeries: boolean } {
  const series = optionalArray(doc['series'], 'chart.series');
  if (series.length > 0) {
    const points: Point[] = [];
    for (const rawSeries of series) {
      const s = asRecord(rawSeries, 'chart.series');
      const name = requireString(s, 'name', 'chart.series');
      for (const rawPoint of requireArray(s['data'], 'chart.series[].data')) {
        points.push({ ...readPoint(rawPoint, 'chart.series[].data'), series: name });
      }
    }
    return { points, multiSeries: true };
  }

  const data = requireArray(doc['data'], 'chart.data');
  const points = data.map((raw) => readPoint(raw, 'chart.data'));
  const multiSeries = points.some((p) => p.series !== undefined);
  return { points, multiSeries };
}

function readPoint(raw: unknown, field: string): Point {
  const record = asRecord(raw, field);
  const label =
    optionalString(record, 'label') ??
    optionalString(record, 'x') ??
    optionalString(record, 'name') ??
    optionalString(record, 'category');
  if (label === undefined) {
    fail(`cada punto de ${field} necesita "label"`, 'ejemplo: - label: SP1\n  value: 42');
  }
  // Por el accesor y no por `record['value']`: la comprobacion directa se
  // salta la tabla de alias, y `valor: 3` acababa dando «falta value».
  const value =
    optionalNumber(record, 'value', field) ??
    optionalNumber(record, 'y', field) ??
    fail(`cada punto de ${field} necesita "value"`, 'ejemplo: - label: SP1\n  value: 42');
  const point: Point = { label, value };
  const seriesName = optionalString(record, 'series') ?? optionalString(record, 'group');
  if (seriesName !== undefined) point.series = seriesName;
  return point;
}

function cartesian(
  type: string,
  doc: Record<string, unknown>,
  xTitle: string | undefined,
  yTitle: string | undefined,
): Record<string, unknown> {
  const { points, multiSeries } = readPoints(doc);
  const horizontal = type === 'horizontal-bar';
  const stacked = type === 'stacked-bar' || type === 'stacked-area';
  const grouped = type === 'grouped-bar';

  const mark =
    type === 'line'
      ? { type: 'line', point: true, strokeWidth: 2.5 }
      : type === 'area' || type === 'stacked-area'
        ? { type: 'area', line: true, opacity: 0.8 }
        : { type: 'bar', cornerRadiusEnd: 3 };

  const categoryAxis = {
    field: 'label',
    type: type === 'line' || type === 'area' ? 'ordinal' : 'nominal',
    title: (horizontal ? yTitle : xTitle) ?? null,
    axis: { labelAngle: 0 },
    ...(type === 'bar' || type === 'column' || stacked || grouped ? { sort: null } : {}),
  };
  const valueAxis = {
    field: 'value',
    type: 'quantitative',
    title: (horizontal ? xTitle : yTitle) ?? null,
    stack: stacked ? 'zero' : null,
  };

  const encoding: Record<string, unknown> = horizontal
    ? { y: categoryAxis, x: valueAxis }
    : { x: categoryAxis, y: valueAxis };

  if (multiSeries) {
    encoding['color'] = { field: 'series', type: 'nominal', title: optionalString(doc, 'legend') ?? null };
    if (grouped) {
      encoding['xOffset'] = { field: 'series' };
      (valueAxis as Record<string, unknown>)['stack'] = null;
    }
  }

  const spec: Record<string, unknown> = {
    data: { values: points.map(toRow) },
    mark,
    encoding,
  };
  if (doc['showValues'] === true && !multiSeries) {
    spec['layer'] = [
      { mark, encoding },
      {
        mark: { type: 'text', dy: horizontal ? 0 : -8, dx: horizontal ? 10 : 0, fontSize: 11 },
        encoding: { ...encoding, text: { field: 'value', type: 'quantitative' } },
      },
    ];
    delete spec['mark'];
    delete spec['encoding'];
  }
  return spec;
}

function scatter(
  doc: Record<string, unknown>,
  xTitle: string | undefined,
  yTitle: string | undefined,
): Record<string, unknown> {
  const rows = requireArray(doc['data'], 'chart.data').map((raw) => {
    const record = asRecord(raw, 'chart.data');
    const row: Record<string, unknown> = {
      x: requireNumber(record, 'x', 'chart.data'),
      y: requireNumber(record, 'y', 'chart.data'),
    };
    const label = optionalString(record, 'label');
    if (label !== undefined) row['label'] = label;
    const series = optionalString(record, 'series') ?? optionalString(record, 'group');
    if (series !== undefined) row['series'] = series;
    const size = record['size'];
    if (typeof size === 'number') row['size'] = size;
    return row;
  });

  const encoding: Record<string, unknown> = {
    x: { field: 'x', type: 'quantitative', title: xTitle ?? null },
    y: { field: 'y', type: 'quantitative', title: yTitle ?? null },
  };
  if (rows.some((r) => r['series'] !== undefined)) {
    encoding['color'] = { field: 'series', type: 'nominal', title: null };
  }
  if (rows.some((r) => r['size'] !== undefined)) {
    encoding['size'] = { field: 'size', type: 'quantitative', title: null };
  }
  if (rows.some((r) => r['label'] !== undefined)) {
    encoding['tooltip'] = [{ field: 'label', type: 'nominal' }];
  }
  return { data: { values: rows }, mark: { type: 'point', filled: true, size: 90, opacity: 0.85 }, encoding };
}

function heatmap(
  doc: Record<string, unknown>,
  xTitle: string | undefined,
  yTitle: string | undefined,
): Record<string, unknown> {
  const rows = requireArray(doc['data'], 'chart.data').map((raw) => {
    const record = asRecord(raw, 'chart.data');
    return {
      x: requireString(record, 'x', 'chart.data'),
      y: requireString(record, 'y', 'chart.data'),
      value: requireNumber(record, 'value', 'chart.data'),
    };
  });
  return {
    data: { values: rows },
    mark: { type: 'rect', stroke: null },
    encoding: {
      x: { field: 'x', type: 'nominal', title: xTitle ?? null, axis: { labelAngle: 0 } },
      y: { field: 'y', type: 'nominal', title: yTitle ?? null },
      color: { field: 'value', type: 'quantitative', title: optionalString(doc, 'legend') ?? null },
    },
  };
}

function pie(doc: Record<string, unknown>, donut: boolean): Record<string, unknown> {
  const { points } = readPoints(doc);
  return {
    data: { values: points.map(toRow) },
    mark: { type: 'arc', innerRadius: donut ? 60 : 0, outerRadius: 110, stroke: '#FFFFFF', strokeWidth: 1 },
    encoding: {
      theta: { field: 'value', type: 'quantitative', stack: true },
      color: { field: 'label', type: 'nominal', title: optionalString(doc, 'legend') ?? null },
      order: { field: 'value', type: 'quantitative', sort: 'descending' },
    },
    view: { stroke: null },
  };
}

/**
 * Waterfall: se calculan los acumulados en el compilador (Vega-Lite no tiene
 * una marca nativa) y se emite una barra por tramo mas la etiqueta del delta.
 */
function waterfall(
  doc: Record<string, unknown>,
  xTitle: string | undefined,
  yTitle: string | undefined,
): Record<string, unknown> {
  const { points } = readPoints(doc);
  let running = 0;
  const rows = points.map((p, index) => {
    const start = running;
    running += p.value;
    return {
      label: p.label,
      order: index,
      start,
      end: running,
      value: p.value,
      sign: p.value >= 0 ? 'aumento' : 'reduccion',
    };
  });

  const base = {
    x: { field: 'label', type: 'nominal', sort: { field: 'order' }, title: xTitle ?? null, axis: { labelAngle: 0 } },
    y: { field: 'start', type: 'quantitative', title: yTitle ?? null },
    y2: { field: 'end' },
  };

  return {
    data: { values: rows },
    layer: [
      {
        mark: { type: 'bar', cornerRadius: 3, size: 34 },
        encoding: {
          ...base,
          color: {
            field: 'sign',
            type: 'nominal',
            title: null,
            scale: { domain: ['aumento', 'reduccion'] },
          },
        },
      },
      {
        mark: { type: 'text', dy: -7, fontSize: 11, baseline: 'bottom' },
        encoding: {
          x: base.x,
          y: { field: 'end', type: 'quantitative' },
          text: { field: 'value', type: 'quantitative' },
        },
      },
    ],
  };
}

function toRow(p: Point): Record<string, unknown> {
  const row: Record<string, unknown> = { label: p.label, value: p.value };
  if (p.series !== undefined) row['series'] = p.series;
  return row;
}

// --------------------------------------------------------------------------
// Tipos anadidos: distribucion, comparacion contra objetivo y embudo
// --------------------------------------------------------------------------

/** Distribucion de una variable continua a partir de valores en bruto. */
function histogram(
  doc: Record<string, unknown>,
  xTitle: string | undefined,
  yTitle: string | undefined,
): Record<string, unknown> {
  const raw = requireArray(doc['values'] ?? doc['valores'] ?? doc['data'], 'chart.values');
  const values = raw.map((v, i) => {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) {
      fail(`chart.values[${i}] debe ser numerico`, `valor recibido: ${JSON.stringify(v)}`);
    }
    return { value: n };
  });
  const bins = optionalNumber(doc, 'bins', 'chart.bins');

  return {
    data: { values },
    mark: { type: 'bar', cornerRadiusEnd: 2 },
    encoding: {
      x: {
        field: 'value',
        type: 'quantitative',
        // `maxbins` deja que Vega elija cortes redondos; un numero fijo de
        // barras produce limites como 3,7 que nadie sabe leer.
        bin: bins !== undefined ? { maxbins: Math.round(bins) } : true,
        title: xTitle ?? null,
      },
      y: { aggregate: 'count', type: 'quantitative', title: yTitle ?? 'Frecuencia' },
    },
  };
}

/** Mediana, dispersion y atipicos por grupo. */
function boxPlot(
  doc: Record<string, unknown>,
  xTitle: string | undefined,
  yTitle: string | undefined,
): Record<string, unknown> {
  const groups = requireArray(doc['groups'] ?? doc['grupos'], 'chart.groups');
  const rows: Array<{ group: string; value: number }> = [];

  for (const rawGroup of groups) {
    const group = asRecord(rawGroup, 'chart.groups');
    const name = requireString(group, 'name', 'chart.groups');
    const values = requireArray(group['values'] ?? group['valores'], 'chart.groups[].values');
    if (values.length < 3) {
      fail(
        `el grupo "${name}" tiene ${values.length} observaciones`,
        'una caja necesita al menos tres valores para que la mediana signifique algo',
      );
    }
    for (const v of values) {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) fail(`los valores de "${name}" deben ser numericos`, `valor recibido: ${String(v)}`);
      rows.push({ group: name, value: n });
    }
  }

  return {
    data: { values: rows },
    mark: { type: 'boxplot', extent: 1.5, size: 34 },
    encoding: {
      x: { field: 'group', type: 'nominal', title: xTitle ?? null, axis: { labelAngle: 0 } },
      y: { field: 'value', type: 'quantitative', title: yTitle ?? null, scale: { zero: false } },
      color: { field: 'group', type: 'nominal', legend: null },
    },
  };
}

/** Valor real frente a su objetivo, un indicador por fila. */
function bullet(doc: Record<string, unknown>, xTitle: string | undefined): Record<string, unknown> {
  const rows = requireArray(doc['data'] ?? doc['indicadores'], 'chart.data').map((raw) => {
    const record = asRecord(raw, 'chart.data');
    return {
      label: requireString(record, 'label', 'chart.data'),
      value: requireNumber(record, 'value', 'chart.data'),
      target: requireNumber(record, 'target', 'chart.data'),
    };
  });

  // Se deja aire tras el mayor de los dos valores: si el objetivo queda pegado
  // al borde, su marca se confunde con el eje.
  const techo = Math.max(...rows.map((r) => Math.max(r.value, r.target))) * 1.12;

  return {
    data: { values: rows },
    // Dos capas: la barra del valor y una marca de tic para el objetivo.
    layer: [
      {
        mark: { type: 'bar', cornerRadiusEnd: 2, size: 18 },
        encoding: {
          x: {
            field: 'value',
            type: 'quantitative',
            title: xTitle ?? null,
            scale: { domainMax: Math.ceil(techo) },
          },
          y: { field: 'label', type: 'nominal', title: null, sort: null },
        },
      },
      {
        // Sin color explicito: lo aporta el tema, que ademas trae su variante
        // oscura. Un valor fijo aqui seria ilegible en un visor en modo oscuro.
        mark: { type: 'tick', thickness: 4, size: 30 },
        encoding: {
          x: { field: 'target', type: 'quantitative' },
          y: { field: 'label', type: 'nominal', sort: null },
        },
      },
    ],
  };
}

/** Cambio entre dos momentos, con una linea por elemento. */
function slope(doc: Record<string, unknown>, yTitle: string | undefined): Record<string, unknown> {
  const from = optionalString(doc, 'from') ?? 'Antes';
  const to = optionalString(doc, 'to') ?? 'Despues';
  const rows: Array<{ label: string; momento: string; value: number; order: number }> = [];

  for (const raw of requireArray(doc['data'], 'chart.data')) {
    const record = asRecord(raw, 'chart.data');
    const label = requireString(record, 'label', 'chart.data');
    rows.push({ label, momento: from, value: requireNumber(record, 'before', 'chart.data'), order: 0 });
    rows.push({ label, momento: to, value: requireNumber(record, 'after', 'chart.data'), order: 1 });
  }

  return {
    data: { values: rows },
    mark: { type: 'line', point: true, strokeWidth: 2.5 },
    encoding: {
      x: {
        field: 'momento',
        type: 'ordinal',
        sort: { field: 'order' },
        title: null,
        axis: { labelAngle: 0 },
        scale: { padding: 0.35 },
      },
      y: { field: 'value', type: 'quantitative', title: yTitle ?? null },
      color: { field: 'label', type: 'nominal', title: null },
    },
  };
}

/** Caida de volumen por etapas sucesivas. */
function funnel(doc: Record<string, unknown>, xTitle: string | undefined): Record<string, unknown> {
  const points = requireArray(doc['data'] ?? doc['etapas'], 'chart.data').map((raw, index) => {
    const record = asRecord(raw, 'chart.data');
    return {
      label: requireString(record, 'label', 'chart.data'),
      value: requireNumber(record, 'value', 'chart.data'),
      order: index,
    };
  });

  const first = points[0]?.value ?? 0;
  const rows = points.map((p) => ({
    ...p,
    // El porcentaje respecto a la primera etapa es lo que se quiere leer.
    porcentaje: first > 0 ? Math.round((p.value / first) * 1000) / 10 : 0,
  }));

  return {
    data: { values: rows },
    layer: [
      {
        mark: { type: 'bar', cornerRadiusEnd: 2 },
        encoding: {
          y: { field: 'label', type: 'nominal', sort: { field: 'order' }, title: null },
          x: { field: 'value', type: 'quantitative', title: xTitle ?? null },
        },
      },
      {
        mark: { type: 'text', align: 'left', dx: 6, fontSize: 11 },
        encoding: {
          y: { field: 'label', type: 'nominal', sort: { field: 'order' } },
          x: { field: 'value', type: 'quantitative' },
          text: { field: 'porcentaje', type: 'quantitative', format: '.1f' },
        },
      },
    ],
  };
}

// --------------------------------------------------------------------------
// Tipos tomados del catalogo de plantillas de Flint (Microsoft Research, MIT).
//
// Se reescriben aqui en vez de depender de la libreria: `flint-chart` pesa
// 42 MB, y de su valor —layout automatico y un mismo spec para cinco
// backends— no usamos nada, porque solo emitimos SVG por Vega-Lite. Lo que si
// se aprovecha es su eleccion de canales y su geometria, que estan pensadas
// para que un agente acierte a la primera. Escritas asi, ademas, nacen con el
// tema y el titulo del proyecto, que una spec ajena pisa.
// --------------------------------------------------------------------------

/** Mismo dato que una barra, menos tinta: una linea hasta el punto. */
function lollipop(doc: Record<string, unknown>, xTitle: string | undefined): Record<string, unknown> {
  const { points } = readPoints(doc);
  const values = points.map((p) => ({ label: p.label, value: p.value }));
  // El orden lo decide quien escribe salvo que pida ordenar por valor: una
  // lista de modulos tiene un orden propio que alfabetizar destruiria.
  const sort = optionalString(doc, 'sort');
  const ejeY = {
    field: 'label',
    type: 'nominal',
    title: null,
    sort: sort === 'value' ? { field: 'value', order: 'descending' } : null,
  };
  return {
    data: { values },
    encoding: {
      x: { field: 'value', type: 'quantitative', title: xTitle ?? null },
      y: ejeY,
    },
    // Dos capas, como en Flint: la regla lleva el ojo y el circulo marca donde
    // termina. Una barra gruesa para el mismo dato es tinta que no informa.
    layer: [
      { mark: { type: 'rule', strokeWidth: 1.5 } },
      { mark: { type: 'circle', size: 110, opacity: 1 } },
    ],
  };
}

/** Barras en el tiempo: cada fila ocupa de su inicio a su fin. */
function gantt(doc: Record<string, unknown>, xTitle: string | undefined): Record<string, unknown> {
  const filas = requireArray(doc['data'] ?? doc['tareas'], 'chart.data').map((raw) => {
    const record = asRecord(raw, 'chart.data');
    const fila: Record<string, unknown> = {
      label: requireString(record, 'label', 'chart.data'),
      start: requireString(record, 'start', 'chart.data'),
      end: requireString(record, 'end', 'chart.data'),
    };
    const estado = optionalString(record, 'status') ?? optionalString(record, 'estado');
    if (estado !== undefined) fila['status'] = estado;
    return fila;
  });
  const conEstado = filas.some((f) => f['status'] !== undefined);

  const encoding: Record<string, unknown> = {
    // `sort: null` mantiene el orden del documento: un cronograma se lee en el
    // orden en que se escribio, no alfabeticamente.
    y: { field: 'label', type: 'nominal', title: null, sort: null },
    x: { field: 'start', type: 'temporal', title: xTitle ?? null },
    x2: { field: 'end' },
  };
  if (conEstado) encoding['color'] = { field: 'status', type: 'nominal', title: null };

  return {
    data: { values: filas },
    // `band: 0.7` deja aire entre filas; pegadas se leen como un bloque.
    mark: { type: 'bar', cornerRadius: 2, height: { band: 0.7 } },
    encoding,
  };
}

/** Una linea minima, sin ejes: el gesto de la serie, no sus valores. */
function sparkline(doc: Record<string, unknown>): Record<string, unknown> {
  const { points } = readPoints(doc);
  const values = points.map((p, i) => ({ i, label: p.label, value: p.value }));
  const conBase = optionalString(doc, 'baseline');
  const base =
    conBase === 'median'
      ? mediana(values.map((v) => v.value))
      : conBase === 'mean' || conBase === undefined
        ? values.reduce((a, v) => a + v.value, 0) / Math.max(1, values.length)
        : Number(conBase);

  const ejes = {
    x: { field: 'i', type: 'quantitative', axis: null },
    y: { field: 'value', type: 'quantitative', axis: null, scale: { zero: false } },
  };
  return {
    data: { values },
    // Sin titulo a proposito, ademas de sin ejes: un titulo encima de una
    // linea de 40 px de alto pesa mas que el propio dato.
    title: null,
    // Deliberadamente pequena: va dentro de una frase o una celda, no ocupa el
    // ancho de un grafico.
    width: 180,
    height: 40,
    layer: [
      { mark: { type: 'line', strokeWidth: 1.5, interpolate: 'monotone' }, encoding: ejes },
      // El ultimo punto ancla la lectura: sin el no se sabe donde termina.
      {
        transform: [{ filter: `datum.i === ${values.length - 1}` }],
        mark: { type: 'circle', size: 45, opacity: 1 },
        encoding: ejes,
      },
      ...(conBase === 'none'
        ? []
        : [
            {
              mark: { type: 'rule', strokeDash: [3, 3], opacity: 0.45 },
              encoding: { y: { datum: Number(base.toFixed(4)), type: 'quantitative' } },
            },
          ]),
    ],
  };
}

function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2 : (s[m] ?? 0);
}

/** Un numero grande con su etiqueta, y su meta si la hay. */
function kpiCard(doc: Record<string, unknown>): Record<string, unknown> {
  const tarjetas = requireArray(doc['data'] ?? doc['indicadores'], 'chart.data').map((raw) => {
    const record = asRecord(raw, 'chart.data');
    const valor = requireNumber(record, 'value', 'chart.data');
    const meta = optionalNumber(record, 'target', 'chart.data');
    const unidad = optionalString(record, 'unit') ?? '';
    const fila: Record<string, unknown> = {
      label: requireString(record, 'label', 'chart.data'),
      value: valor,
      texto: `${formatearNumero(valor)}${unidad}`,
    };
    // El estado sale del dato, no de un color escrito a mano: asi el tema
    // decide como se ve «por debajo de la meta» en claro y en oscuro.
    // Cadena vacia y no `undefined`: una marca de texto sobre un campo ausente
    // pinta literalmente «undefined» en el SVG.
    fila['nota'] = meta !== undefined ? `meta ${formatearNumero(meta)}${unidad}` : '';
    // Hacia donde es bueno moverse. Sin esto, «9 bloqueados sobre una meta de
    // 5» se pintaba como cumplida, porque 9 es mayor que 5: en la mitad de los
    // indicadores de un informe de QA lo bueno es el numero BAJO.
    const menorEsMejor = record['lowerIsBetter'] === true;
    if (meta !== undefined) {
      const bien = menorEsMejor ? valor <= meta : valor >= meta;
      fila['estado'] = bien ? 'cumple' : 'no cumple';
      // Avance acotado a 1: una barra que se sale de su carril no se lee.
      fila['avance'] = Math.min(1, menorEsMejor ? (meta === 0 ? 0 : meta / Math.max(valor, 1e-9)) : valor / meta);
    } else {
      fila['estado'] = 'sin meta';
      fila['avance'] = 0;
    }
    return fila;
  });
  const conMeta = tarjetas.some((t) => t['nota'] !== '');
  // El orden es el que escribio el autor. Sin este indice Vega-Lite ordena las
  // facetas alfabeticamente, y una fila de indicadores tiene un orden pensado.
  tarjetas.forEach((t, i) => {
    t['orden'] = i;
  });

  const capas: Record<string, unknown>[] = [
    {
      mark: { type: 'text', fontSize: 34, fontWeight: 700, dy: -8 },
      encoding: { text: { field: 'texto', type: 'nominal' } },
    },
    {
      mark: { type: 'text', fontSize: 11, dy: 22, opacity: 0.75 },
      encoding: { text: { field: 'label', type: 'nominal' } },
    },
  ];
  if (conMeta) {
    capas.push({
      mark: { type: 'text', fontSize: 10, dy: 38, opacity: 0.6 },
      encoding: { text: { field: 'nota', type: 'nominal' } },
    });
    // La barra de avance es de Flint, y se la copio porque resuelve algo que el
    // numero solo no dice: a que distancia de la meta esta. El carril va
    // siempre; encima, la parte cumplida.
    const barra = {
      x: { field: 'x0', type: 'quantitative', axis: null, scale: { domain: [0, 1] } },
      x2: { field: 'x1' },
      y: { datum: 0, type: 'quantitative', axis: null, scale: { domain: [0, 1] } },
    };
    capas.push({
      transform: [{ calculate: '0', as: 'x0' }, { calculate: '1', as: 'x1' }],
      mark: { type: 'rule', strokeWidth: 4, opacity: 0.15, yOffset: 32 },
      encoding: barra,
    });
    capas.push({
      transform: [{ filter: 'datum.nota !== ""' }, { calculate: '0', as: 'x0' }, { calculate: 'datum.avance', as: 'x1' }],
      mark: { type: 'rule', strokeWidth: 4, yOffset: 32 },
      encoding: barra,
    });
  }
  if (conMeta) {
    for (const capa of capas) {
      const enc = capa['encoding'] as Record<string, unknown>;
      enc['color'] = { field: 'estado', type: 'nominal', legend: null };
    }
  }


  return {
    data: { values: tarjetas },
    // `title: null` explicito: si no, el escaner inyecta «Grafico» como titulo
    // por defecto, y una fila de indicadores no lleva encabezado.
    title: null,
    // Una columna por tarjeta: es una fila de indicadores, no un grafico.
    facet: {
      column: {
        field: 'label',
        type: 'nominal',
        title: null,
        header: null,
        sort: { field: 'orden', op: 'min' },
      },
    },
    spec: { width: 150, height: 96, layer: capas },
  };
}

function formatearNumero(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Un ano en celdas: semana en horizontal, dia de la semana en vertical. */
function calendarHeatmap(doc: Record<string, unknown>): Record<string, unknown> {
  const filas = requireArray(doc['data'], 'chart.data').map((raw) => {
    const record = asRecord(raw, 'chart.data');
    const fecha = optionalString(record, 'date') ?? optionalString(record, 'fecha');
    if (fecha === undefined) {
      fail('cada punto de chart.data necesita "date"', 'ejemplo: - date: 2026-09-01\n  value: 12');
    }
    return { date: fecha, value: requireNumber(record, 'value', 'chart.data') };
  });

  return {
    data: { values: filas },
    mark: { type: 'rect', cornerRadius: 2 },
    encoding: {
      // La semana del ano en horizontal y el dia en vertical es lo que hace
      // legible un ano entero en una franja; con la fecha cruda saldrian 365
      // columnas de un pixel.
      x: {
        field: 'date',
        type: 'ordinal',
        timeUnit: 'yearweek',
        title: null,
        // Sin `labelExpr` cada semana rotula su mes y sale «Jul Jul Jul Jul Ago…».
        // Solo escribe el mes la primera semana que cae en el.
        axis: {
          labelAngle: 0,
          labelExpr: "month(datum.value) !== month(datum.value - 604800000) ? timeFormat(datum.value, '%b') : ''",
        },
      },
      y: { field: 'date', type: 'ordinal', timeUnit: 'day', title: null, axis: { format: '%a' } },
      color: { field: 'value', type: 'quantitative', title: null },
    },
  };
}

/** Quien adelanta a quien: posiciones en el tiempo, el 1 arriba. */
function bump(doc: Record<string, unknown>, xTitle: string | undefined): Record<string, unknown> {
  const { points } = readPoints(doc);
  if (!points.some((p) => p.series !== undefined)) {
    fail(
      'un grafico bump necesita varias series',
      'declara `series:` con un nombre por elemento, o `series:` en cada punto',
    );
  }
  const values = points.map((p) => ({ label: p.label, value: p.value, series: p.series }));
  const ejes = {
    x: { field: 'label', type: 'ordinal', title: xTitle ?? null, sort: null },
    // Invertido: en una clasificacion el 1 va arriba, y un eje normal lo
    // pondria abajo, que es justo lo contrario de lo que el lector espera.
    // Dominio explicito desde 1: una clasificacion no tiene puesto cero, y
    // dejarselo elegir a Vega-Lite pone un 0 arriba que no significa nada.
    y: {
      field: 'value',
      type: 'quantitative',
      title: null,
      scale: { reverse: true, domain: [1, Math.max(...points.map((p) => p.value))], nice: false },
      axis: { tickMinStep: 1 },
    },
    color: { field: 'series', type: 'nominal', title: null },
  };
  return {
    data: { values },
    layer: [
      { mark: { type: 'line', strokeWidth: 2.5, interpolate: 'monotone' }, encoding: ejes },
      { mark: { type: 'circle', size: 90, opacity: 1 }, encoding: ejes },
    ],
  };
}

/** Varios ejes que salen de un centro: el perfil de un conjunto de medidas. */
function radar(doc: Record<string, unknown>): Record<string, unknown> {
  const { points } = readPoints(doc);
  const ejes = [...new Set(points.map((p) => p.label))];
  if (ejes.length < 3) {
    fail('un radar necesita al menos tres ejes', `declarados: ${ejes.length}`);
  }
  const maximo = optionalNumber(doc, 'max', 'chart.max') ?? Math.max(...points.map((p) => p.value));
  const R = 120;

  // Vega-Lite no dibuja coordenadas polares, asi que el angulo se resuelve
  // aqui: cada eje recibe su posicion en el circulo y el punto se proyecta a
  // x/y. Es lo mismo que hace Flint, y por eso su radar es un `point` con las
  // coordenadas ya calculadas.
  const proyectar = (indice: number, valor: number): { x: number; y: number } => {
    const angulo = (indice / ejes.length) * 2 * Math.PI - Math.PI / 2;
    const r = (valor / maximo) * R;
    return { x: Number((r * Math.cos(angulo)).toFixed(2)), y: Number((r * Math.sin(angulo)).toFixed(2)) };
  };

  const values = points.map((p) => {
    const i = ejes.indexOf(p.label);
    return { ...proyectar(i, p.value), label: p.label, value: p.value, series: p.series ?? '', orden: i };
  });
  // La malla: un poligono por cada anillo de referencia.
  const malla = [0.25, 0.5, 0.75, 1].flatMap((f, anillo) =>
    ejes.map((label, i) => ({ ...proyectar(i, maximo * f), anillo, orden: i, label })),
  );
  const etiquetas = ejes.map((label, i) => ({ ...proyectar(i, maximo * 1.18), label }));

  const oculto = { axis: null, scale: { domain: [-R * 1.45, R * 1.45] } };
  const pos = {
    x: { field: 'x', type: 'quantitative', ...oculto },
    y: { field: 'y', type: 'quantitative', ...oculto },
    order: { field: 'orden', type: 'quantitative' },
  };

  return {
    width: 300,
    height: 300,
    layer: [
      {
        data: { values: malla },
        mark: { type: 'line', strokeWidth: 0.7, opacity: 0.35, interpolate: 'linear-closed' },
        encoding: { ...pos, detail: { field: 'anillo', type: 'nominal' } },
      },
      {
        data: { values },
        mark: { type: 'line', strokeWidth: 2, interpolate: 'linear-closed', fillOpacity: 0.18, filled: true },
        encoding: { ...pos, ...(points.some((p) => p.series) ? { color: { field: 'series', type: 'nominal', title: null } } : {}) },
      },
      {
        data: { values },
        mark: { type: 'circle', size: 55, opacity: 1 },
        encoding: { ...pos, ...(points.some((p) => p.series) ? { color: { field: 'series', type: 'nominal', title: null } } : {}) },
      },
      {
        data: { values: etiquetas },
        mark: { type: 'text', fontSize: 11 },
        encoding: {
          x: { field: 'x', type: 'quantitative', ...oculto },
          y: { field: 'y', type: 'quantitative', ...oculto },
          text: { field: 'label', type: 'nominal' },
        },
      },
    ],
  };
}
