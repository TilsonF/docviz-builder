/**
 * Tipos de producto y proceso que se dibujan con Mermaid: recorrido de usuario,
 * historia de ramas, tablero, priorizacion, flujo de volumenes, composicion,
 * perfil multieje, mapa mental y bloques.
 */

import { fail } from './util.js';
import {
  asNamedRecord,
  asRecord,
  IdFactory,
  nameOf,
  optionalArray,
  optionalNumber,
  optionalString,
  requireArray,
  requireNumber,
  requireString,
} from './util.js';

/**
 * Mermaid usa `:` y `,` como separadores en varias de sus notaciones y no
 * admite comillas dentro de una etiqueta.
 */
function plain(text: string): string {
  return text.replace(/[:,;"']/g, ' ').replace(/\s+/g, ' ').trim();
}

// --------------------------------------------------------------------------

export function journey(doc: Record<string, unknown>): string {
  const sections = requireArray(doc['sections'] ?? doc['secciones'], 'diagram.sections');
  const lines = ['journey'];
  const title = optionalString(doc, 'title');
  if (title !== undefined) lines.push(`  title ${plain(title)}`);

  for (const rawSection of sections) {
    const section = asRecord(rawSection, 'diagram.sections');
    lines.push(`  section ${plain(requireString(section, 'name', 'diagram.sections'))}`);
    for (const rawStep of requireArray(section['steps'] ?? section['pasos'], 'diagram.sections[].steps')) {
      const step = asNamedRecord(rawStep, 'diagram.sections[].steps', 'name');
      const name = requireString(step, 'name', 'diagram.sections[].steps');
      const score = optionalNumber(step, 'score', 'diagram.sections[].steps') ?? 3;
      if (score < 1 || score > 5) {
        fail(`la satisfaccion de "${name}" debe estar entre 1 y 5`, `valor recibido: ${score}`);
      }
      const actors = optionalArray(step['actors'] ?? step['actores'], 'diagram.sections[].steps[].actors')
        .map((a) => plain(nameOf(a, 'diagram.sections[].steps[].actors')))
        .join(', ');
      lines.push(`    ${plain(name)}: ${Math.round(score)}: ${actors === '' ? 'Usuario' : actors}`);
    }
  }
  return lines.join('\n');
}

// --------------------------------------------------------------------------

export function gitGraph(doc: Record<string, unknown>): string {
  const steps = requireArray(doc['commits'] ?? doc['steps'], 'diagram.commits');
  const lines = ['gitGraph'];
  const branches = new Set<string>(['main']);

  for (const raw of steps) {
    const record = asNamedRecord(raw, 'diagram.commits', 'commit');

    const branch = optionalString(record, 'branch');
    if (branch !== undefined) {
      branches.add(branch);
      lines.push(`  branch ${identifier(branch)}`);
      continue;
    }
    const checkout = optionalString(record, 'checkout');
    if (checkout !== undefined) {
      if (!branches.has(checkout)) {
        fail(`la rama "${checkout}" no se ha creado todavia`, `ramas conocidas: ${[...branches].join(', ')}`);
      }
      lines.push(`  checkout ${identifier(checkout)}`);
      continue;
    }
    const merge = optionalString(record, 'merge');
    if (merge !== undefined) {
      if (!branches.has(merge)) {
        fail(`la rama "${merge}" no se ha creado todavia`, `ramas conocidas: ${[...branches].join(', ')}`);
      }
      lines.push(`  merge ${identifier(merge)}`);
      continue;
    }
    const tag = optionalString(record, 'tag');
    const commit = optionalString(record, 'commit');
    if (commit !== undefined || tag !== undefined) {
      const parts: string[] = [];
      if (commit !== undefined) parts.push(`id: "${plain(commit)}"`);
      if (tag !== undefined) parts.push(`tag: "${plain(tag)}"`);
      lines.push(`  commit ${parts.join(' ')}`.trimEnd());
      continue;
    }
    fail(
      'cada paso de diagram.commits debe ser commit, branch, checkout, merge o tag',
      'ejemplo: - commit: version inicial',
    );
  }
  return lines.join('\n');
}

/** Mermaid no admite espacios en el nombre de una rama. */
function identifier(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_/-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// --------------------------------------------------------------------------

export function kanban(doc: Record<string, unknown>): string {
  const columns = requireArray(doc['columns'] ?? doc['columnas'], 'diagram.columns');
  const ids = new IdFactory('k');
  const lines = ['kanban'];

  for (const rawColumn of columns) {
    const column = asNamedRecord(rawColumn, 'diagram.columns', 'name');
    const name = requireString(column, 'name', 'diagram.columns');
    lines.push(`  ${plain(name)}`);
    for (const rawItem of optionalArray(column['items'] ?? column['tarjetas'], 'diagram.columns[].items')) {
      const item = asNamedRecord(rawItem, 'diagram.columns[].items', 'name');
      const label = requireString(item, 'name', 'diagram.columns[].items');
      const assignee = optionalString(item, 'assignee') ?? optionalString(item, 'responsable');
      const suffix = assignee !== undefined ? `@{ assigned: '${plain(assignee)}' }` : '';
      lines.push(`    ${ids.id(`${name}/${label}`)}[${plain(label)}]${suffix}`);
    }
  }
  return lines.join('\n');
}

// --------------------------------------------------------------------------

export function quadrant(doc: Record<string, unknown>): string {
  const xAxis = requireArray(doc['xAxis'] ?? doc['ejeX'], 'diagram.xAxis');
  const yAxis = requireArray(doc['yAxis'] ?? doc['ejeY'], 'diagram.yAxis');
  const quadrants = requireArray(doc['quadrants'] ?? doc['cuadrantes'], 'diagram.quadrants');
  const items = optionalArray(doc['items'] ?? doc['elementos'], 'diagram.items');

  if (xAxis.length !== 2 || yAxis.length !== 2) {
    fail('los ejes se declaran con dos extremos', 'ejemplo: xAxis: [Bajo esfuerzo, Alto esfuerzo]');
  }
  if (quadrants.length !== 4) {
    fail('quadrant necesita exactamente 4 cuadrantes', `se recibieron ${quadrants.length}`);
  }

  const lines = ['quadrantChart'];
  const title = optionalString(doc, 'title');
  if (title !== undefined) lines.push(`  title ${plain(title)}`);
  lines.push(`  x-axis ${plain(nameOf(xAxis[0], 'diagram.xAxis'))} --> ${plain(nameOf(xAxis[1], 'diagram.xAxis'))}`);
  lines.push(`  y-axis ${plain(nameOf(yAxis[0], 'diagram.yAxis'))} --> ${plain(nameOf(yAxis[1], 'diagram.yAxis'))}`);
  quadrants.forEach((q, i) => {
    lines.push(`  quadrant-${i + 1} ${plain(nameOf(q, 'diagram.quadrants'))}`);
  });

  for (const raw of items) {
    const item = asRecord(raw, 'diagram.items');
    const name = requireString(item, 'name', 'diagram.items');
    const x = requireNumber(item, 'x', 'diagram.items');
    const y = requireNumber(item, 'y', 'diagram.items');
    for (const [axis, value] of [['x', x], ['y', y]] as const) {
      if (value < 0 || value > 1) {
        fail(
          `la coordenada ${axis} de "${name}" debe estar entre 0 y 1`,
          `valor recibido: ${value}; 0 es el extremo inicial del eje y 1 el final`,
        );
      }
    }
    lines.push(`  ${plain(name)}: [${x}, ${y}]`);
  }
  return lines.join('\n');
}

// --------------------------------------------------------------------------

export function sankey(doc: Record<string, unknown>): string {
  const flows = requireArray(doc['flows'] ?? doc['flujos'], 'diagram.flows');
  const lines = ['sankey-beta', ''];
  for (const raw of flows) {
    const flow = asRecord(raw, 'diagram.flows');
    const from = requireString(flow, 'from', 'diagram.flows');
    const to = requireString(flow, 'to', 'diagram.flows');
    const value = requireNumber(flow, 'value', 'diagram.flows');
    if (value <= 0) fail(`el valor del flujo "${from} -> ${to}" debe ser positivo`, `valor recibido: ${value}`);
    // El formato es CSV: las comas del texto se escapan entrecomillando.
    lines.push(`${csv(from)},${csv(to)},${value}`);
  }
  return lines.join('\n');
}

function csv(text: string): string {
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// --------------------------------------------------------------------------

export function treemap(doc: Record<string, unknown>): string {
  const groups = optionalArray(doc['groups'] ?? doc['grupos'], 'diagram.groups');
  const flat = optionalArray(doc['data'] ?? doc['items'], 'diagram.data');
  if (groups.length === 0 && flat.length === 0) {
    fail('treemap necesita groups o data', 'ejemplo: groups:\n  - name: Backend\n    items:\n      - name: API\n        value: 40');
  }

  const lines = ['treemap-beta'];
  const leaf = (raw: unknown, indent: string, field: string): void => {
    const item = asRecord(raw, field);
    const name = requireString(item, 'name', field);
    const value = requireNumber(item, 'value', field);
    if (value <= 0) fail(`el valor de "${name}" debe ser positivo`, `valor recibido: ${value}`);
    lines.push(`${indent}"${plain(name)}": ${value}`);
  };

  for (const raw of groups) {
    const group = asRecord(raw, 'diagram.groups');
    lines.push(`"${plain(requireString(group, 'name', 'diagram.groups'))}"`);
    for (const item of requireArray(group['items'], 'diagram.groups[].items')) {
      leaf(item, '    ', 'diagram.groups[].items');
    }
  }
  for (const item of flat) leaf(item, '', 'diagram.data');
  return lines.join('\n');
}

// --------------------------------------------------------------------------

export function radar(doc: Record<string, unknown>): string {
  const axes = requireArray(doc['axes'] ?? doc['ejes'], 'diagram.axes');
  const series = optionalArray(doc['series'], 'diagram.series');
  const values = optionalArray(doc['values'] ?? doc['valores'], 'diagram.values');
  if (series.length === 0 && values.length === 0) {
    fail('radar necesita series o values', 'ejemplo: values: [3, 4, 2]');
  }

  const axisNames = axes.map((a) => plain(nameOf(a, 'diagram.axes')));
  if (axisNames.length < 3) fail('un radar necesita al menos tres ejes', `se recibieron ${axisNames.length}`);

  const ids = new IdFactory('ax');
  const lines = ['radar-beta'];
  const title = optionalString(doc, 'title');
  if (title !== undefined) lines.push(`  title ${plain(title)}`);
  lines.push(`  axis ${axisNames.map((n) => `${ids.id(n)}["${n}"]`).join(', ')}`);

  const curves = series.length > 0
    ? series.map((raw) => {
        const s = asRecord(raw, 'diagram.series');
        return { name: requireString(s, 'name', 'diagram.series'), values: requireArray(s['values'], 'diagram.series[].values') };
      })
    : [{ name: optionalString(doc, 'seriesName') ?? 'Actual', values }];

  const curveIds = new IdFactory('c');
  for (const curve of curves) {
    if (curve.values.length !== axisNames.length) {
      fail(
        `la serie "${curve.name}" tiene ${curve.values.length} valores y hay ${axisNames.length} ejes`,
        'debe haber exactamente un valor por eje, en el mismo orden',
      );
    }
    const numbers = curve.values.map((v) => {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) fail(`los valores de "${curve.name}" deben ser numericos`, `valor recibido: ${String(v)}`);
      return n;
    });
    lines.push(`  curve ${curveIds.id(curve.name)}["${plain(curve.name)}"]{${numbers.join(', ')}}`);
  }

  const max = optionalNumber(doc, 'max', 'diagram.max');
  if (max !== undefined) lines.push(`  max ${max}`);
  const min = optionalNumber(doc, 'min', 'diagram.min');
  if (min !== undefined) lines.push(`  min ${min}`);
  return lines.join('\n');
}

// --------------------------------------------------------------------------

interface Node {
  name: string;
  children: Node[];
}

function toNode(raw: unknown, field: string): Node {
  if (typeof raw === 'string') return { name: raw.trim(), children: [] };
  const record = asRecord(raw, field);
  const name = requireString(record, 'name', field);
  const rawChildren = record['children'] ?? record['items'] ?? record['branches'];
  return {
    name,
    children: optionalArray(rawChildren, `${field}.children`).map((c) => toNode(c, `${field}.children`)),
  };
}

export function mindmap(doc: Record<string, unknown>): string {
  const root = requireString(doc, 'root', 'diagram.root');
  const branches = requireArray(doc['branches'] ?? doc['items'], 'diagram.branches');

  const lines = ['mindmap', `  root((${plain(root)}))`];
  const walk = (node: Node, depth: number): void => {
    lines.push(`${'  '.repeat(depth)}${plain(node.name)}`);
    for (const child of node.children) walk(child, depth + 1);
  };
  for (const raw of branches) walk(toNode(raw, 'diagram.branches'), 2);
  return lines.join('\n');
}

// --------------------------------------------------------------------------

export function block(doc: Record<string, unknown>): string {
  const rows = requireArray(doc['rows'] ?? doc['filas'], 'diagram.rows');
  const widest = Math.max(...rows.map((r) => optionalArray(r, 'diagram.rows[]').length));
  if (widest === 0) fail('cada fila de diagram.rows debe tener al menos un bloque');

  const ids = new IdFactory('b');
  const lines = ['block-beta', `  columns ${widest}`];
  for (const rawRow of rows) {
    const cells = requireArray(rawRow, 'diagram.rows[]');
    const rendered = cells.map((cell) => {
      const item = asNamedRecord(cell, 'diagram.rows[]', 'name');
      const name = requireString(item, 'name', 'diagram.rows[]');
      const span = optionalNumber(item, 'span', 'diagram.rows[]');
      const id = ids.id(name);
      // Un bloque que ocupa varias columnas se declara con `id:n`.
      const width = span !== undefined && span > 1 ? `:${Math.round(span)}` : '';
      return `${id}["${plain(name)}"]${width}`;
    });
    // Se completa la fila para que la rejilla no descuadre.
    const used = cells.reduce<number>((total, cell) => {
      const item = typeof cell === 'string' ? {} : asRecord(cell, 'diagram.rows[]');
      const span = optionalNumber(item, 'span', 'diagram.rows[]');
      return total + (span !== undefined && span > 1 ? Math.round(span) : 1);
    }, 0);
    lines.push(`  ${rendered.join(' ')}`);
    if (used < widest) lines.push(`  space:${widest - used}`);
  }
  return lines.join('\n');
}
