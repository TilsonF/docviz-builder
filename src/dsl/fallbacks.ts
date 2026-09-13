/**
 * Compiladores alternativos.
 *
 * Un tipo declara un motor preferido y, cuando existe, uno de respaldo. El
 * respaldo no es el mismo texto enviado a otro sitio: cada motor tiene su propio
 * lenguaje, asi que hay que compilar de nuevo. Por eso solo se declaran
 * alternativas para las que existe realmente un compilador.
 *
 * Sirve para dos cosas: compilar en una maquina sin navegador o sin Java, y no
 * quedar atado a un motor concreto si alguno deja de convenir.
 */

import { fail } from './util.js';
import {
  asArrowShorthand,
  asNamedRecord,
  asRecord,
  d2Label,
  IdFactory,
  nameOf,
  oneOf,
  optionalArray,
  optionalString,
  requireArray,
  requireString,
  toEdge,
} from './util.js';

/** `erd` con Mermaid, cuando PlantUML no esta disponible. */
export function mermaidErd(doc: Record<string, unknown>): string {
  const entities = requireArray(doc['entities'] ?? doc['entidades'], 'diagram.entities');
  const relations = optionalArray(doc['relations'], 'diagram.relations');
  const declared = new Map<string, string>();

  const lines = ['erDiagram'];
  for (const raw of entities) {
    const record = asNamedRecord(raw, 'diagram.entities', 'name');
    const name = requireString(record, 'name', 'diagram.entities');
    const id = mermaidEntityId(name);
    declared.set(name, id);

    const fields = optionalArray(record['fields'] ?? record['campos'], 'diagram.entities[].fields');
    if (fields.length === 0) {
      lines.push(`  ${id}`);
      continue;
    }
    lines.push(`  ${id} {`);
    for (const rawField of fields) {
      const field = asNamedRecord(rawField, 'diagram.entities[].fields', 'name');
      const fieldName = requireString(field, 'name', 'diagram.entities[].fields');
      // Mermaid exige `tipo nombre`, en ese orden y sin espacios internos.
      const type = (optionalString(field, 'type') ?? 'string').replace(/\s+/g, '_');
      const key = field['key'] === true || field['pk'] === true ? ' PK' : '';
      lines.push(`    ${type} ${fieldName.replace(/\s+/g, '_')}${key}`);
    }
    lines.push('  }');
  }

  const CARDINALITY: Readonly<Record<string, string>> = {
    'one-to-one': '||--||',
    'one-to-many': '||--o{',
    'many-to-one': '}o--||',
    'many-to-many': '}o--o{',
    'uno-a-uno': '||--||',
    'uno-a-muchos': '||--o{',
    'muchos-a-uno': '}o--||',
    'muchos-a-muchos': '}o--o{',
  };

  for (const raw of relations) {
    const record = typeof raw === 'string' ? undefined : asRecord(raw, 'diagram.relations');
    const edge = toEdge(raw, 'diagram.relations');
    const from = declared.get(edge.from);
    const to = declared.get(edge.to);
    if (from === undefined || to === undefined) {
      fail(
        `"${from === undefined ? edge.from : edge.to}" no esta declarado en entities`,
        `entidades declaradas: ${[...declared.keys()].join(', ')}`,
      );
    }
    const kind = record !== undefined ? (optionalString(record, 'cardinality') ?? 'one-to-many') : 'one-to-many';
    const arrow = CARDINALITY[kind.toLowerCase()];
    if (arrow === undefined) {
      fail(`la cardinalidad "${kind}" no existe`, `cardinalidades validas: ${Object.keys(CARDINALITY).join(', ')}`);
    }
    lines.push(`  ${from} ${arrow} ${to} : "${(edge.label ?? 'relacionado').replace(/"/g, "'")}"`);
  }
  return lines.join('\n');
}

function mermaidEntityId(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

/** `flow` con D2, cuando no hay navegador para Mermaid. */
export function d2Flow(doc: Record<string, unknown>): string {
  const edges = requireArray(doc['flow'] ?? doc['edges'], 'diagram.flow');
  const declared = optionalArray(doc['nodes'], 'diagram.nodes');
  const direction = oneOf(
    optionalString(doc, 'direction'),
    ['lr', 'tb', 'rl', 'bt', 'td'],
    'diagram.direction',
    'lr',
  );
  const d2Direction = { lr: 'right', rl: 'left', tb: 'down', td: 'down', bt: 'up' }[direction];

  const ids = new IdFactory('n');
  const lines = [`direction: ${d2Direction}`, ''];

  for (const raw of declared) {
    const name = nameOf(raw, 'diagram.nodes');
    lines.push(`${ids.id(name)}: ${d2Label(name)}`);
  }
  for (const raw of edges) {
    const edge = toEdge(raw, 'diagram.flow');
    for (const endpoint of [edge.from, edge.to]) {
      if (!ids.has(endpoint)) lines.push(`${ids.id(endpoint)}: ${d2Label(endpoint)}`);
    }
    const style = edge.dashed ? ' {style.stroke-dash: 4}' : '';
    lines.push(
      `${ids.get(edge.from)} -> ${ids.get(edge.to)}${edge.label !== undefined ? `: ${d2Label(edge.label)}` : ''}${style}`,
    );
  }
  return lines.join('\n');
}

/** `timeline` con Mermaid, cuando se prefiere su cronologia a la rejilla de D2. */
export function mermaidTimeline(doc: Record<string, unknown>): string {
  const phases = requireArray(doc['phases'] ?? doc['milestones'], 'diagram.phases');
  const lines = ['timeline'];
  const title = optionalString(doc, 'title');
  if (title !== undefined) lines.push(`  title ${title.replace(/[:]/g, ' ')}`);

  for (const raw of phases) {
    const phase = asNamedRecord(raw, 'diagram.phases', 'name');
    const name = requireString(phase, 'name', 'diagram.phases').replace(/[:]/g, ' ');
    const items = optionalArray(phase['items'], 'diagram.phases[].items').map((i) =>
      nameOf(i, 'diagram.phases[].items').replace(/[:]/g, ' '),
    );
    lines.push(items.length === 0 ? `  ${name}` : `  ${name} : ${items.join(' : ')}`);
  }
  return lines.join('\n');
}

/** `mindmap` con Mermaid es el preferido; este es el de PlantUML, ya en su modulo. */

// --------------------------------------------------------------------------
// C4 con PlantUML: respaldo de LikeC4
// --------------------------------------------------------------------------

/** Clase de elemento del DSL -> macro de C4-PlantUML. */
const C4_MACROS: Readonly<Record<string, string>> = {
  person: 'Person',
  actor: 'Person',
  system: 'System',
  'external-system': 'System_Ext',
  container: 'Container',
  component: 'Component',
  database: 'ContainerDb',
  queue: 'ContainerQueue',
  storage: 'ContainerDb',
  browser: 'Container',
  mobile: 'Container',
  service: 'Container',
};

/** Vista C4 -> archivo de la biblioteca estandar que la define. */
const C4_LIBRARY: Readonly<Record<string, string>> = {
  'c4-context': 'C4_Context',
  context: 'C4_Context',
  'c4-container': 'C4_Container',
  container: 'C4_Container',
  'c4-component': 'C4_Component',
  'component-view': 'C4_Component',
  'c4-deployment': 'C4_Deployment',
};

/**
 * Compila el bloque `architecture` a C4-PlantUML.
 *
 * La biblioteca viaja dentro del jar de PlantUML, asi que este camino no
 * necesita ni LikeC4 ni conexion a la red.
 */
export function architectureC4(doc: Record<string, unknown>): string {
  const type = (optionalString(doc, 'type') ?? 'c4-context').toLowerCase();
  const library = C4_LIBRARY[type] ?? 'C4_Container';
  const rawElements = requireArray(doc['elements'] ?? doc['nodes'], 'architecture.elements');
  const rawRelations = optionalArray(doc['relations'] ?? doc['relationships'], 'architecture.relations');
  const title = optionalString(doc, 'title');

  interface Element {
    id: string;
    macro: string;
    name: string;
    description?: string;
    technology?: string;
    parent?: string;
    children: Element[];
  }

  const byId = new Map<string, Element>();
  const byName = new Map<string, Element>();
  const order: Element[] = [];

  for (const raw of rawElements) {
    const record = asRecord(raw, 'architecture.elements');
    const name = requireString(record, 'name', 'architecture.elements');
    const kind = (optionalString(record, 'kind') ?? 'system').toLowerCase();
    const macro = C4_MACROS[kind];
    if (macro === undefined) {
      fail(`la clase de elemento "${kind}" no existe`, `clases validas: ${Object.keys(C4_MACROS).join(', ')}`);
    }
    const id = c4Id(optionalString(record, 'id') ?? name, byId);
    const element: Element = { id, macro, name, children: [] };
    const description = optionalString(record, 'description');
    if (description !== undefined) element.description = description;
    const technology = optionalString(record, 'technology') ?? optionalString(record, 'tech');
    if (technology !== undefined) element.technology = technology;
    const parent = optionalString(record, 'parent');
    if (parent !== undefined) element.parent = parent;
    byId.set(id, element);
    byName.set(name, element);
    order.push(element);
  }

  const roots: Element[] = [];
  for (const element of order) {
    if (element.parent === undefined) {
      roots.push(element);
      continue;
    }
    const parent = byId.get(element.parent) ?? byName.get(element.parent);
    if (parent === undefined) {
      fail(
        `el elemento padre "${element.parent}" de "${element.name}" no existe`,
        `elementos declarados: ${order.map((e) => e.name).join(', ')}`,
      );
    }
    parent.children.push(element);
  }

  const lines = ['@startuml', `!include <C4/${library}>`];
  if (title !== undefined) lines.push(`title ${title}`);

  const emit = (element: Element, indent: string): void => {
    const args = [element.id, quote(element.name)];
    // Las macros de contenedor llevan la tecnologia antes de la descripcion.
    if (element.macro.startsWith('Container') || element.macro === 'Component') {
      args.push(quote(element.technology ?? ''));
    }
    if (element.description !== undefined) args.push(quote(element.description));

    if (element.children.length === 0) {
      lines.push(`${indent}${element.macro}(${args.join(', ')})`);
      return;
    }
    // Un elemento con hijos se dibuja como frontera del sistema.
    lines.push(`${indent}System_Boundary(${element.id}, ${quote(element.name)}) {`);
    for (const child of element.children) emit(child, `${indent}  `);
    lines.push(`${indent}}`);
  };
  for (const root of roots) emit(root, '');

  for (const raw of rawRelations) {
    // `- A -> B: usa` llega como cadena o, si YAML vio los dos puntos, como
    // mapa de una entrada; ambas equivalen a la forma explicita.
    const relation =
      typeof raw === 'string' || asArrowShorthand(raw) !== undefined
        ? relationFromEdge(raw)
        : asRecord(raw, 'architecture.relations');
    const fromName = requireString(relation, 'from', 'architecture.relations');
    const toName = requireString(relation, 'to', 'architecture.relations');
    const from = byId.get(fromName) ?? byName.get(fromName);
    const to = byId.get(toName) ?? byName.get(toName);
    if (from === undefined || to === undefined) {
      fail(
        `"${from === undefined ? fromName : toName}" no corresponde a ningun elemento declarado`,
        `elementos declarados: ${order.map((e) => e.name).join(', ')}`,
      );
    }
    const label = optionalString(relation, 'label') ?? optionalString(relation, 'text') ?? '';
    const technology = optionalString(relation, 'technology') ?? optionalString(relation, 'tech');
    const args = [from.id, to.id, quote(label)];
    if (technology !== undefined) args.push(quote(technology));
    lines.push(`Rel(${args.join(', ')})`);
  }

  lines.push('@enduml');
  return lines.join('\n');
}

function relationFromEdge(raw: unknown): Record<string, unknown> {
  const edge = toEdge(raw, 'architecture.relations');
  const record: Record<string, unknown> = { from: edge.from, to: edge.to };
  if (edge.label !== undefined) record['label'] = edge.label;
  return record;
}

function quote(text: string): string {
  return `"${text.replace(/"/g, "'").replace(/\n/g, ' ')}"`;
}

function c4Id(raw: string, existing: Map<string, unknown>): string {
  let id = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (id === '' || /^[0-9]/.test(id)) id = `e_${id}`;
  if (!existing.has(id)) return id;
  let n = 2;
  while (existing.has(`${id}_${n}`)) n += 1;
  return `${id}_${n}`;
}


/**
 * `quadrant` con Vega-Lite, cuando no hay navegador para Mermaid.
 *
 * Es el respaldo mas natural del catalogo: un cuadrante **ya es** un grafico de
 * dispersion con dos lineas de referencia en el centro. Cada elemento trae su
 * `x` y su `y`, asi que no hay que aproximar nada; lo unico que se pierde son
 * los nombres de los cuatro cuadrantes, que pasan a los ejes.
 */
export function vegaQuadrant(doc: Record<string, unknown>): string {
  const items = requireArray(doc['items'] ?? doc['points'], 'diagram.items');
  const title = optionalString(doc, 'title');
  const ejeX = optionalArray(doc['xAxis'], 'diagram.xAxis').map((v) => String(v));
  const ejeY = optionalArray(doc['yAxis'], 'diagram.yAxis').map((v) => String(v));

  const valores = items.map((raw) => {
    const record = asNamedRecord(raw, 'diagram.items');
    return {
      nombre: requireString(record, 'name', 'diagram.items'),
      x: numeroDe(record['x'], 'diagram.items.x'),
      y: numeroDe(record['y'], 'diagram.items.y'),
    };
  });

  // El titulo de cada eje recoge sus dos extremos, que es donde Mermaid los
  // dibuja: "Bajo esfuerzo -> Alto esfuerzo".
  const tituloEje = (extremos: string[], porDefecto: string): string =>
    extremos.length >= 2 ? `${extremos[0]} → ${extremos[1]}` : (extremos[0] ?? porDefecto);

  const spec: Record<string, unknown> = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    data: { values: valores },
    layer: [
      {
        mark: { type: 'point', filled: true, size: 120 },
        encoding: {
          x: { field: 'x', type: 'quantitative', scale: { domain: [0, 1] }, title: tituloEje(ejeX, 'x') },
          y: { field: 'y', type: 'quantitative', scale: { domain: [0, 1] }, title: tituloEje(ejeY, 'y') },
          tooltip: { field: 'nombre', type: 'nominal' },
        },
      },
      {
        mark: { type: 'text', align: 'left', dx: 8, dy: -8 },
        encoding: {
          x: { field: 'x', type: 'quantitative' },
          y: { field: 'y', type: 'quantitative' },
          text: { field: 'nombre', type: 'nominal' },
        },
      },
      // Las dos lineas que parten el plano en cuatro.
      { mark: { type: 'rule', strokeDash: [4, 4] }, encoding: { x: { datum: 0.5 } } },
      { mark: { type: 'rule', strokeDash: [4, 4] }, encoding: { y: { datum: 0.5 } } },
    ],
  };
  if (title !== undefined) spec['title'] = title;
  return JSON.stringify(spec, null, 2);
}

/** Un numero obligatorio dentro de un elemento del cuadrante. */
function numeroDe(valor: unknown, field: string): number {
  const n = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(n)) fail(`${field} debe ser numerico`, `valor recibido: ${String(valor)}`);
  return n;
}
