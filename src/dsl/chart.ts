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
  const value =
    record['value'] !== undefined
      ? requireNumber(record, 'value', field)
      : record['y'] !== undefined
        ? requireNumber(record, 'y', field)
        : fail(`cada punto de ${field} necesita "value"`, 'ejemplo: - label: SP1\n  value: 42');
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
