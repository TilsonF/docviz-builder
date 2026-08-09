/**
 * Bloque `diagram`: el agente declara la intencion, DocViz elige el motor.
 *
 *   sequence      -> PlantUML
 *   class         -> PlantUML
 *   state         -> PlantUML
 *   activity      -> PlantUML
 *   flow          -> Mermaid
 *   gantt         -> Mermaid
 *   strategy-tree -> D2
 *   capability-map-> D2
 *   dependency-map-> Graphviz
 *   ...
 */

import { fail } from './util.js';
import {
  asRecord,
  d2Label,
  dotLabel,
  IdFactory,
  mermaidLabel,
  nameOf,
  oneOf,
  optionalArray,
  optionalString,
  plantUmlText,
  requireArray,
  requireString,
  toEdge,
} from './util.js';

export interface CompiledDiagram {
  rendererType: string;
  source: string;
}

/** Tipo de `diagram` -> motor destino. Es el mapa que el agente ya no necesita saber. */
export const DIAGRAM_TYPES: Readonly<Record<string, string>> = {
  // UML (PlantUML)
  sequence: 'plantuml',
  'uml-sequence': 'plantuml',
  class: 'plantuml',
  'uml-class': 'plantuml',
  state: 'plantuml',
  'uml-state': 'plantuml',
  activity: 'plantuml',
  'uml-activity': 'plantuml',
  // Flujos y cronogramas (Mermaid)
  flow: 'mermaid',
  flowchart: 'mermaid',
  gantt: 'mermaid',
  // Diagramas ejecutivos (D2)
  'strategy-tree': 'd2',
  'issue-tree': 'd2',
  'decision-tree': 'd2',
  'strategy-pillars': 'd2',
  'capability-map': 'd2',
  'operating-model': 'd2',
  'value-chain': 'd2',
  'before-after': 'd2',
  'matrix-2x2': 'd2',
  timeline: 'd2',
  roadmap: 'd2',
  // Dependencias (Graphviz)
  'dependency-map': 'graphviz',
  'dependency-graph': 'graphviz',
};

export function diagramTypeNames(): string[] {
  return Object.keys(DIAGRAM_TYPES).sort();
}

export function compileDiagram(doc: Record<string, unknown>): CompiledDiagram {
  const type = requireString(doc, 'type', 'diagram').toLowerCase();
  const renderer = DIAGRAM_TYPES[type];
  if (renderer === undefined) {
    fail(`el tipo de diagrama "${type}" no existe`, `tipos disponibles: ${diagramTypeNames().join(', ')}`);
  }

  switch (type) {
    case 'sequence':
    case 'uml-sequence':
      return { rendererType: renderer, source: sequence(doc) };
    case 'class':
    case 'uml-class':
      return { rendererType: renderer, source: classDiagram(doc) };
    case 'state':
    case 'uml-state':
      return { rendererType: renderer, source: stateDiagram(doc) };
    case 'activity':
    case 'uml-activity':
      return { rendererType: renderer, source: activityDiagram(doc) };
    case 'flow':
    case 'flowchart':
      return { rendererType: renderer, source: flowchart(doc) };
    case 'gantt':
      return { rendererType: renderer, source: gantt(doc) };
    case 'strategy-tree':
    case 'issue-tree':
    case 'decision-tree':
      return { rendererType: renderer, source: tree(doc) };
    case 'strategy-pillars':
      return { rendererType: renderer, source: pillars(doc) };
    case 'capability-map':
      return { rendererType: renderer, source: capabilityMap(doc) };
    case 'operating-model':
      return { rendererType: renderer, source: operatingModel(doc) };
    case 'value-chain':
      return { rendererType: renderer, source: valueChain(doc) };
    case 'before-after':
      return { rendererType: renderer, source: beforeAfter(doc) };
    case 'matrix-2x2':
      return { rendererType: renderer, source: matrix2x2(doc) };
    case 'timeline':
    case 'roadmap':
      return { rendererType: renderer, source: roadmap(doc) };
    case 'dependency-map':
    case 'dependency-graph':
      return { rendererType: renderer, source: dependencyGraph(doc) };
    default:
      fail(`el tipo "${type}" esta declarado pero no implementado`);
  }
}

// --------------------------------------------------------------------------
// PlantUML
// --------------------------------------------------------------------------

const PARTICIPANT_KINDS = [
  'participant',
  'actor',
  'boundary',
  'control',
  'entity',
  'database',
  'collections',
  'queue',
] as const;

function sequence(doc: Record<string, unknown>): string {
  const participants = requireArray(doc['participants'], 'diagram.participants');
  const flow = requireArray(doc['flow'], 'diagram.flow');
  const ids = new IdFactory('P');

  const lines: string[] = ['@startuml'];
  if (doc['autonumber'] === true) lines.push('autonumber');

  for (const raw of participants) {
    const name = nameOf(raw, 'diagram.participants');
    const kind =
      typeof raw === 'string'
        ? 'participant'
        : oneOf(optionalString(asRecord(raw, 'diagram.participants'), 'type'), PARTICIPANT_KINDS, 'participants[].type', 'participant');
    lines.push(`${kind} "${plantUmlText(name)}" as ${ids.id(name)}`);
  }

  for (const raw of flow) {
    // Los mensajes admiten tanto la forma corta como el mapa explicito.
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw) && 'note' in raw) {
      const record = asRecord(raw, 'diagram.flow');
      const note = requireString(record, 'note', 'diagram.flow[].note');
      const over = optionalString(record, 'over');
      const target = over !== undefined ? resolveParticipant(ids, over, 'diagram.flow[].over') : undefined;
      lines.push(target !== undefined ? `note over ${target}: ${plantUmlText(note)}` : `note right: ${plantUmlText(note)}`);
      continue;
    }
    const edge = toEdge(raw, 'diagram.flow');
    const from = resolveParticipant(ids, edge.from, 'diagram.flow');
    const to = resolveParticipant(ids, edge.to, 'diagram.flow');
    const arrow = edge.dashed ? '-->' : '->';
    lines.push(`${from} ${arrow} ${to}${edge.label !== undefined ? `: ${plantUmlText(edge.label)}` : ''}`);
  }

  lines.push('@enduml');
  return lines.join('\n');
}

function resolveParticipant(ids: IdFactory, name: string, field: string): string {
  const id = ids.get(name);
  if (id === undefined) {
    fail(
      `"${name}" no esta declarado en participants`,
      `${field} solo puede referirse a participantes declarados: ${ids.keys().join(', ')}`,
    );
  }
  return id;
}

const RELATION_ARROWS: Readonly<Record<string, string>> = {
  extends: '<|--',
  inherits: '<|--',
  implements: '<|..',
  composition: '*--',
  aggregation: 'o--',
  association: '--',
  dependency: '..>',
  uses: '..>',
};

function classDiagram(doc: Record<string, unknown>): string {
  const classes = requireArray(doc['classes'], 'diagram.classes');
  const relations = optionalArray(doc['relations'], 'diagram.relations');
  const declared = new Set<string>();

  const lines: string[] = ['@startuml', 'hide empty members'];
  for (const raw of classes) {
    const record = typeof raw === 'string' ? { name: raw } : asRecord(raw, 'diagram.classes');
    const name = requireString(record, 'name', 'diagram.classes');
    declared.add(name);
    const stereotype = optionalString(record, 'stereotype');
    const keyword =
      record['interface'] === true ? 'interface' : record['abstract'] === true ? 'abstract class' : 'class';
    const header = `${keyword} "${plantUmlText(name)}"${stereotype !== undefined ? ` <<${plantUmlText(stereotype)}>>` : ''}`;
    const attributes = optionalArray(record['attributes'], 'diagram.classes[].attributes');
    const methods = optionalArray(record['methods'], 'diagram.classes[].methods');
    if (attributes.length === 0 && methods.length === 0) {
      lines.push(header);
      continue;
    }
    lines.push(`${header} {`);
    for (const a of attributes) lines.push(`  ${plantUmlText(nameOf(a, 'diagram.classes[].attributes'))}`);
    if (attributes.length > 0 && methods.length > 0) lines.push('  --');
    for (const m of methods) {
      const text = plantUmlText(nameOf(m, 'diagram.classes[].methods'));
      lines.push(`  ${text.endsWith(')') ? text : `${text}()`}`);
    }
    lines.push('}');
  }

  for (const raw of relations) {
    const record = typeof raw === 'string' ? undefined : asRecord(raw, 'diagram.relations');
    const edge = toEdge(raw, 'diagram.relations');
    for (const endpoint of [edge.from, edge.to]) {
      if (!declared.has(endpoint)) {
        fail(
          `"${endpoint}" no esta declarado en classes`,
          `clases declaradas: ${[...declared].join(', ')}`,
        );
      }
    }
    const kind = record !== undefined ? (optionalString(record, 'type') ?? 'association') : 'association';
    const arrow = RELATION_ARROWS[kind.toLowerCase()];
    if (arrow === undefined) {
      fail(
        `el tipo de relacion "${kind}" no existe`,
        `tipos validos: ${Object.keys(RELATION_ARROWS).join(', ')}`,
      );
    }
    // `extends`/`implements` se leen "hijo hereda de padre": PlantUML dibuja
    // la flecha desde el padre, asi que se invierten los extremos.
    const inverted = arrow === '<|--' || arrow === '<|..';
    const left = inverted ? edge.to : edge.from;
    const right = inverted ? edge.from : edge.to;
    lines.push(
      `"${plantUmlText(left)}" ${arrow} "${plantUmlText(right)}"${edge.label !== undefined ? ` : ${plantUmlText(edge.label)}` : ''}`,
    );
  }

  lines.push('@enduml');
  return lines.join('\n');
}

function stateDiagram(doc: Record<string, unknown>): string {
  const states = requireArray(doc['states'], 'diagram.states');
  const transitions = requireArray(doc['transitions'], 'diagram.transitions');
  const ids = new IdFactory('S');

  const lines: string[] = ['@startuml', 'hide empty description'];
  for (const raw of states) {
    const record = typeof raw === 'string' ? { name: raw } : asRecord(raw, 'diagram.states');
    const name = requireString(record, 'name', 'diagram.states');
    const id = ids.id(name);
    lines.push(`state "${plantUmlText(name)}" as ${id}`);
    const description = optionalString(record, 'description');
    if (description !== undefined) lines.push(`${id} : ${plantUmlText(description)}`);
  }

  const initial = optionalString(doc, 'initial');
  if (initial !== undefined) lines.push(`[*] --> ${resolveState(ids, initial, 'diagram.initial')}`);

  for (const raw of transitions) {
    const edge = toEdge(raw, 'diagram.transitions');
    const from = edge.from === '[*]' ? '[*]' : resolveState(ids, edge.from, 'diagram.transitions');
    const to = edge.to === '[*]' ? '[*]' : resolveState(ids, edge.to, 'diagram.transitions');
    lines.push(`${from} --> ${to}${edge.label !== undefined ? ` : ${plantUmlText(edge.label)}` : ''}`);
  }

  for (const raw of optionalArray(doc['finals'], 'diagram.finals')) {
    lines.push(`${resolveState(ids, nameOf(raw, 'diagram.finals'), 'diagram.finals')} --> [*]`);
  }

  lines.push('@enduml');
  return lines.join('\n');
}

function resolveState(ids: IdFactory, name: string, field: string): string {
  const id = ids.get(name);
  if (id === undefined) {
    fail(`"${name}" no esta declarado en states`, `${field} solo admite estados declarados: ${ids.keys().join(', ')}`);
  }
  return id;
}

function activityDiagram(doc: Record<string, unknown>): string {
  const flow = requireArray(doc['flow'], 'diagram.flow');
  const lines: string[] = ['@startuml', 'start'];
  emitActivitySteps(flow, lines, '', 'diagram.flow');
  lines.push('stop', '@enduml');
  return lines.join('\n');
}

function emitActivitySteps(steps: unknown[], lines: string[], indent: string, field: string): void {
  for (const raw of steps) {
    if (typeof raw === 'string') {
      lines.push(`${indent}:${plantUmlText(raw.trim())};`);
      continue;
    }
    const record = asRecord(raw, field);
    if (record['decision'] !== undefined) {
      const question = requireString(record, 'decision', `${field}[].decision`);
      const yes = optionalArray(record['yes'] ?? record['si'], `${field}[].yes`);
      const no = optionalArray(record['no'], `${field}[].no`);
      lines.push(`${indent}if (${plantUmlText(question)}) then (si)`);
      emitActivitySteps(yes, lines, `${indent}  `, `${field}[].yes`);
      lines.push(`${indent}else (no)`);
      emitActivitySteps(no, lines, `${indent}  `, `${field}[].no`);
      lines.push(`${indent}endif`);
      continue;
    }
    if (record['parallel'] !== undefined) {
      const branches = requireArray(record['parallel'], `${field}[].parallel`);
      lines.push(`${indent}fork`);
      branches.forEach((branch, i) => {
        if (i > 0) lines.push(`${indent}fork again`);
        emitActivitySteps(optionalArray(branch, `${field}[].parallel[]`), lines, `${indent}  `, `${field}[].parallel[]`);
      });
      lines.push(`${indent}end fork`);
      continue;
    }
    if (record['note'] !== undefined) {
      lines.push(`${indent}note right`, `${indent}  ${plantUmlText(String(record['note']))}`, `${indent}end note`);
      continue;
    }
    lines.push(`${indent}:${plantUmlText(nameOf(record, field))};`);
  }
}

// --------------------------------------------------------------------------
// Mermaid
// --------------------------------------------------------------------------

const FLOW_SHAPES: Readonly<Record<string, [string, string]>> = {
  rect: ['[', ']'],
  round: ['(', ')'],
  stadium: ['([', '])'],
  subroutine: ['[[', ']]'],
  cylinder: ['[(', ')]'],
  circle: ['((', '))'],
  decision: ['{', '}'],
  rhombus: ['{', '}'],
  hexagon: ['{{', '}}'],
};

function flowchart(doc: Record<string, unknown>): string {
  const direction = oneOf(optionalString(doc, 'direction'), ['lr', 'tb', 'rl', 'bt', 'td'], 'diagram.direction', 'lr');
  const edges = requireArray(doc['flow'] ?? doc['edges'], 'diagram.flow');
  const declared = optionalArray(doc['nodes'], 'diagram.nodes');
  const ids = new IdFactory('N');
  const shapes = new Map<string, string>();

  const lines: string[] = [`flowchart ${direction.toUpperCase()}`];

  for (const raw of declared) {
    const record = typeof raw === 'string' ? { name: raw } : asRecord(raw, 'diagram.nodes');
    const name = requireString(record, 'name', 'diagram.nodes');
    ids.id(name);
    const shape = optionalString(record, 'shape');
    if (shape !== undefined) {
      if (FLOW_SHAPES[shape.toLowerCase()] === undefined) {
        fail(`la forma "${shape}" no existe`, `formas validas: ${Object.keys(FLOW_SHAPES).join(', ')}`);
      }
      shapes.set(name, shape.toLowerCase());
    }
  }

  const emitted = new Set<string>();
  const nodeRef = (name: string): string => {
    const id = ids.id(name);
    if (emitted.has(id)) return id;
    emitted.add(id);
    const [open, close] = FLOW_SHAPES[shapes.get(name) ?? 'rect']!;
    return `${id}${open}${mermaidLabel(name)}${close}`;
  };

  for (const raw of edges) {
    const edge = toEdge(raw, 'diagram.flow');
    const connector = edge.dashed
      ? edge.label !== undefined
        ? `-. ${escapeMermaidEdgeLabel(edge.label)} .->`
        : '-.->'
      : edge.label !== undefined
        ? `-- ${escapeMermaidEdgeLabel(edge.label)} -->`
        : '-->';
    lines.push(`    ${nodeRef(edge.from)} ${connector} ${nodeRef(edge.to)}`);
  }

  // Nodos declarados que no participan en ninguna relacion.
  for (const name of ids.keys()) {
    const id = ids.get(name)!;
    if (!emitted.has(id)) {
      emitted.add(id);
      const [open, close] = FLOW_SHAPES[shapes.get(name) ?? 'rect']!;
      lines.push(`    ${id}${open}${mermaidLabel(name)}${close}`);
    }
  }

  return lines.join('\n');
}

function escapeMermaidEdgeLabel(label: string): string {
  return label.replace(/[|"]/g, ' ').replace(/\n/g, ' ').trim();
}

const GANTT_STATUS = ['done', 'active', 'crit', 'milestone'] as const;

function gantt(doc: Record<string, unknown>): string {
  const sections = requireArray(doc['sections'], 'diagram.sections');
  const dateFormat = optionalString(doc, 'dateFormat') ?? 'YYYY-MM-DD';
  const axisFormat = optionalString(doc, 'axisFormat');

  const lines: string[] = ['gantt', `    dateFormat  ${dateFormat}`];
  if (axisFormat !== undefined) lines.push(`    axisFormat  ${axisFormat}`);
  const title = optionalString(doc, 'title');
  if (title !== undefined) lines.push(`    title       ${sanitizeGantt(title)}`);

  const ids = new IdFactory('t');
  for (const rawSection of sections) {
    const section = asRecord(rawSection, 'diagram.sections');
    lines.push(`    section ${sanitizeGantt(requireString(section, 'name', 'diagram.sections'))}`);
    for (const rawTask of requireArray(section['tasks'], 'diagram.sections[].tasks')) {
      const task = typeof rawTask === 'string' ? { name: rawTask } : asRecord(rawTask, 'diagram.sections[].tasks');
      const name = requireString(task, 'name', 'diagram.sections[].tasks');
      const id = ids.id(name);
      const parts: string[] = [];
      const status = optionalString(task, 'status');
      if (status !== undefined) {
        parts.push(oneOf(status, GANTT_STATUS, 'tasks[].status', 'active'));
      }
      parts.push(id);
      const after = optionalString(task, 'after');
      const start = optionalString(task, 'start');
      if (after !== undefined) {
        const ref = ids.get(after);
        if (ref === undefined) {
          fail(`la tarea "${after}" referida en "after" no existe todavia`, `tareas conocidas: ${ids.keys().join(', ')}`);
        }
        parts.push(`after ${ref}`);
      } else if (start !== undefined) {
        parts.push(start);
      } else {
        fail(`la tarea "${name}" necesita "start" o "after"`);
      }
      const duration = optionalString(task, 'duration');
      const end = optionalString(task, 'end');
      if (duration !== undefined) parts.push(duration);
      else if (end !== undefined) parts.push(end);
      // Mermaid exige una duracion siempre, tambien en los hitos: sin ella
      // interpreta el identificador como fecha y falla con "Invalid date".
      else if (status === 'milestone') parts.push('0d');
      else fail(`la tarea "${name}" necesita "duration" o "end"`);
      lines.push(`    ${sanitizeGantt(name)} :${parts.join(', ')}`);
    }
  }
  return lines.join('\n');
}

/** Mermaid usa `:` y `,` como separadores dentro de una tarea. */
function sanitizeGantt(text: string): string {
  return text.replace(/[:,]/g, ' ').replace(/\s+/g, ' ').trim();
}

// --------------------------------------------------------------------------
// D2 — diagramas ejecutivos
// --------------------------------------------------------------------------

interface TreeNode {
  name: string;
  children: TreeNode[];
}

function toTreeNode(raw: unknown, field: string): TreeNode {
  if (typeof raw === 'string') return { name: raw.trim(), children: [] };
  const record = asRecord(raw, field);
  const name = requireString(record, 'name', field);
  const rawChildren = record['children'] ?? record['branches'] ?? record['items'];
  const children = optionalArray(rawChildren, `${field}.children`).map((c) => toTreeNode(c, `${field}.children`));
  return { name, children };
}

function tree(doc: Record<string, unknown>): string {
  const root = requireString(doc, 'root', 'diagram.root');
  const branches = requireArray(doc['branches'], 'diagram.branches').map((b) =>
    toTreeNode(b, 'diagram.branches'),
  );
  const direction = oneOf(optionalString(doc, 'direction'), ['right', 'down', 'left', 'up'], 'diagram.direction', 'right');

  const ids = new IdFactory('n');
  const lines: string[] = [`direction: ${direction}`, ''];
  const rootId = ids.id(root);
  lines.push(`${rootId}: ${d2Label(root)} { style.bold: true }`);

  const walk = (parentId: string, node: TreeNode, path: string): void => {
    const id = ids.id(`${path}/${node.name}`);
    lines.push(`${id}: ${d2Label(node.name)}`);
    lines.push(`${parentId} -> ${id}`);
    for (const child of node.children) walk(id, child, `${path}/${node.name}`);
  };
  for (const branch of branches) walk(rootId, branch, 'root');

  return lines.join('\n');
}

function pillars(doc: Record<string, unknown>): string {
  const root = requireString(doc, 'root', 'diagram.root');
  const items = requireArray(doc['pillars'] ?? doc['branches'], 'diagram.pillars');
  const ids = new IdFactory('p');

  const lines: string[] = ['direction: down', ''];
  const rootId = ids.id(root);
  lines.push(`${rootId}: ${d2Label(root)} { style.bold: true }`);

  for (const raw of items) {
    const node = toTreeNode(raw, 'diagram.pillars');
    const id = ids.id(`pillar/${node.name}`);
    lines.push(`${id}: ${d2Label(node.name)} {`);
    for (const child of node.children) {
      lines.push(`  ${ids.id(`pillar/${node.name}/${child.name}`)}: ${d2Label(child.name)}`);
    }
    lines.push('}');
    lines.push(`${rootId} -> ${id}`);
  }
  return lines.join('\n');
}

function capabilityMap(doc: Record<string, unknown>): string {
  const domains = requireArray(doc['domains'] ?? doc['areas'], 'diagram.domains');
  const ids = new IdFactory('c');
  const lines: string[] = ['direction: right', `grid-columns: ${Math.min(domains.length, 3)}`, ''];

  for (const raw of domains) {
    const domain = asRecord(raw, 'diagram.domains');
    const name = requireString(domain, 'name', 'diagram.domains');
    const capabilities = requireArray(
      domain['capabilities'] ?? domain['items'],
      'diagram.domains[].capabilities',
    );
    const id = ids.id(`d/${name}`);
    lines.push(`${id}: ${d2Label(name)} {`);
    lines.push('  grid-columns: 2');
    for (const cap of capabilities) {
      const capName = nameOf(cap, 'diagram.domains[].capabilities');
      lines.push(`  ${ids.id(`d/${name}/${capName}`)}: ${d2Label(capName)}`);
    }
    lines.push('}');
  }
  return lines.join('\n');
}

function operatingModel(doc: Record<string, unknown>): string {
  const layers = requireArray(doc['layers'], 'diagram.layers');
  const ids = new IdFactory('l');
  const lines: string[] = ['direction: down', ''];
  const layerIds: string[] = [];

  for (const raw of layers) {
    const layer = asRecord(raw, 'diagram.layers');
    const name = requireString(layer, 'name', 'diagram.layers');
    const items = requireArray(layer['items'], 'diagram.layers[].items');
    const id = ids.id(`l/${name}`);
    layerIds.push(id);
    lines.push(`${id}: ${d2Label(name)} {`);
    lines.push(`  grid-columns: ${Math.min(items.length, 4)}`);
    for (const item of items) {
      const itemName = nameOf(item, 'diagram.layers[].items');
      lines.push(`  ${ids.id(`l/${name}/${itemName}`)}: ${d2Label(itemName)}`);
    }
    lines.push('}');
  }
  for (let i = 0; i + 1 < layerIds.length; i += 1) {
    lines.push(`${layerIds[i]} -> ${layerIds[i + 1]}: {style.opacity: 0.4}`);
  }
  return lines.join('\n');
}

function valueChain(doc: Record<string, unknown>): string {
  const stages = requireArray(doc['stages'] ?? doc['steps'], 'diagram.stages');
  const ids = new IdFactory('s');
  const lines: string[] = ['direction: right', ''];
  const stageIds = stages.map((raw) => {
    const name = nameOf(raw, 'diagram.stages');
    const id = ids.id(`s/${name}`);
    lines.push(`${id}: ${d2Label(name)} { shape: step }`);
    return id;
  });
  for (let i = 0; i + 1 < stageIds.length; i += 1) lines.push(`${stageIds[i]} -> ${stageIds[i + 1]}`);
  return lines.join('\n');
}

function beforeAfter(doc: Record<string, unknown>): string {
  const before = requireArray(doc['before'], 'diagram.before');
  const after = requireArray(doc['after'], 'diagram.after');
  const beforeLabel = optionalString(doc, 'beforeLabel') ?? 'Antes';
  const afterLabel = optionalString(doc, 'afterLabel') ?? 'Despues';
  const ids = new IdFactory('b');

  const lines: string[] = ['direction: right', ''];
  const block = (label: string, items: unknown[], key: string, style: string): string => {
    const id = ids.id(key);
    lines.push(`${id}: ${d2Label(label)} {`);
    lines.push(`  style.fill: "${style}"`);
    for (const item of items) {
      const name = nameOf(item, `diagram.${key}`);
      lines.push(`  ${ids.id(`${key}/${name}`)}: ${d2Label(name)}`);
    }
    lines.push('}');
    return id;
  };
  const b = block(beforeLabel, before, 'before', '#F3F4F6');
  const a = block(afterLabel, after, 'after', '#E8F3EE');
  lines.push(`${b} -> ${a}`);
  return lines.join('\n');
}

function matrix2x2(doc: Record<string, unknown>): string {
  const axes = asRecord(doc['axes'], 'diagram.axes');
  const xAxis = requireString(axes, 'x', 'diagram.axes.x');
  const yAxis = requireString(axes, 'y', 'diagram.axes.y');
  const quadrants = requireArray(doc['quadrants'], 'diagram.quadrants');
  if (quadrants.length !== 4) {
    fail('matrix-2x2 necesita exactamente 4 cuadrantes', `se recibieron ${quadrants.length}`);
  }
  const ids = new IdFactory('q');
  const lines: string[] = ['direction: right', 'grid-columns: 2', 'grid-gap: 24', ''];
  for (const raw of quadrants) {
    const quadrant = typeof raw === 'string' ? { name: raw } : asRecord(raw, 'diagram.quadrants');
    const name = requireString(quadrant, 'name', 'diagram.quadrants');
    const id = ids.id(`q/${name}`);
    const items = optionalArray(quadrant['items'], 'diagram.quadrants[].items');
    if (items.length === 0) {
      lines.push(`${id}: ${d2Label(name)}`);
      continue;
    }
    lines.push(`${id}: ${d2Label(name)} {`);
    for (const item of items) {
      const itemName = nameOf(item, 'diagram.quadrants[].items');
      lines.push(`  ${ids.id(`q/${name}/${itemName}`)}: ${d2Label(itemName)}`);
    }
    lines.push('}');
  }
  lines.push('', `ejes: ${d2Label(`Eje X: ${xAxis}   |   Eje Y: ${yAxis}`)} { shape: text; style.font-size: 14 }`);
  return lines.join('\n');
}

function roadmap(doc: Record<string, unknown>): string {
  const phases = requireArray(doc['phases'] ?? doc['milestones'], 'diagram.phases');
  const ids = new IdFactory('f');
  const lines: string[] = ['direction: right', ''];
  const phaseIds: string[] = [];

  for (const raw of phases) {
    const phase = typeof raw === 'string' ? { name: raw } : asRecord(raw, 'diagram.phases');
    const name = requireString(phase, 'name', 'diagram.phases');
    const id = ids.id(`f/${name}`);
    phaseIds.push(id);
    const items = optionalArray(phase['items'], 'diagram.phases[].items');
    if (items.length === 0) {
      lines.push(`${id}: ${d2Label(name)}`);
      continue;
    }
    lines.push(`${id}: ${d2Label(name)} {`);
    for (const item of items) {
      const itemName = nameOf(item, 'diagram.phases[].items');
      lines.push(`  ${ids.id(`f/${name}/${itemName}`)}: ${d2Label(itemName)}`);
    }
    lines.push('}');
  }
  for (let i = 0; i + 1 < phaseIds.length; i += 1) lines.push(`${phaseIds[i]} -> ${phaseIds[i + 1]}`);
  return lines.join('\n');
}

// --------------------------------------------------------------------------
// Graphviz
// --------------------------------------------------------------------------

function dependencyGraph(doc: Record<string, unknown>): string {
  const edges = requireArray(doc['dependencies'] ?? doc['edges'] ?? doc['flow'], 'diagram.dependencies');
  const declared = optionalArray(doc['nodes'], 'diagram.nodes');
  const direction = oneOf(optionalString(doc, 'direction'), ['tb', 'lr', 'rl', 'bt'], 'diagram.direction', 'lr');
  const ids = new IdFactory('d');

  const lines: string[] = ['digraph dependencias {', `  rankdir=${direction.toUpperCase()};`];
  for (const raw of declared) {
    const name = nameOf(raw, 'diagram.nodes');
    lines.push(`  ${ids.id(name)} [label=${dotLabel(name)}];`);
  }
  for (const raw of edges) {
    const edge = toEdge(raw, 'diagram.dependencies');
    for (const endpoint of [edge.from, edge.to]) {
      if (!ids.has(endpoint)) lines.push(`  ${ids.id(endpoint)} [label=${dotLabel(endpoint)}];`);
    }
    const attrs: string[] = [];
    if (edge.label !== undefined) attrs.push(`label=${dotLabel(edge.label)}`);
    if (edge.dashed) attrs.push('style=dashed');
    lines.push(
      `  ${ids.get(edge.from)} -> ${ids.get(edge.to)}${attrs.length > 0 ? ` [${attrs.join(', ')}]` : ''};`,
    );
  }
  lines.push('}');
  return lines.join('\n');
}
