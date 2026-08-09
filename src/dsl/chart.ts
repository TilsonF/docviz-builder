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
  optionalString,
  requireArray,
  requireNumber,
  requireString,
} from './util.js';

export interface CompiledChart {
  rendererType: 'vega-lite';
  source: string;
}

export const CHART_TYPES = [
  'bar',
  'column',
  'horizontal-bar',
  'stacked-bar',
  'grouped-bar',
  'line',
  'area',
  'scatter',
  'heatmap',
  'pie',
  'donut',
  'waterfall',
] as const;

export type ChartType = (typeof CHART_TYPES)[number];

export function chartTypeNames(): string[] {
  return [...CHART_TYPES];
}

interface Point {
  label: string;
  value: number;
  series?: string;
}

export function compileChart(doc: Record<string, unknown>): CompiledChart {
  const type = requireString(doc, 'type', 'chart').toLowerCase() as ChartType;
  if (!CHART_TYPES.includes(type)) {
    fail(`el tipo de grafico "${type}" no existe`, `tipos disponibles: ${chartTypeNames().join(', ')}`);
  }

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
    default:
      Object.assign(spec, cartesian(type, doc, xTitle, yTitle));
      break;
  }

  return { rendererType: 'vega-lite', source: JSON.stringify(spec, null, 2) };
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
  type: ChartType,
  doc: Record<string, unknown>,
  xTitle: string | undefined,
  yTitle: string | undefined,
): Record<string, unknown> {
  const { points, multiSeries } = readPoints(doc);
  const horizontal = type === 'horizontal-bar';
  const stacked = type === 'stacked-bar';
  const grouped = type === 'grouped-bar';

  const mark =
    type === 'line'
      ? { type: 'line', point: true, strokeWidth: 2.5 }
      : type === 'area'
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
