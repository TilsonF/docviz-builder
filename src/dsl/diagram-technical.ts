/**
 * Tipos tecnicos que se dibujan con PlantUML: modelo de datos, casos de uso,
 * componentes, despliegue, bocetos de interfaz, estructuras de datos y
 * descomposicion del trabajo.
 *
 * Todos comparten el mismo principio que el resto del DSL: el autor declara
 * nombres y relaciones, y el compilador se encarga de la sintaxis del motor.
 */

import { fail } from './util.js';
import {
  asNamedRecord,
  asRecord,
  IdFactory,
  nameOf,
  oneOf,
  optionalArray,
  optionalString,
  plantUmlText,
  requireArray,
  requireString,
  toEdge,
} from './util.js';

/** Cardinalidades admitidas y su notacion en PlantUML. */
const CARDINALITY: Readonly<Record<string, string>> = {
  'one-to-one': '||--||',
  'one-to-many': '||--o{',
  'many-to-one': '}o--||',
  'many-to-many': '}o--o{',
  'zero-or-one-to-many': '|o--o{',
  'uno-a-uno': '||--||',
  'uno-a-muchos': '||--o{',
  'muchos-a-uno': '}o--||',
  'muchos-a-muchos': '}o--o{',
};

export function entityRelationship(doc: Record<string, unknown>): string {
  const entities = requireArray(doc['entities'] ?? doc['entidades'], 'diagram.entities');
  const relations = optionalArray(doc['relations'], 'diagram.relations');
  const declared = new Set<string>();

  const lines = ['@startuml', 'hide circle', 'skinparam linetype ortho'];

  for (const raw of entities) {
    const record = asNamedRecord(raw, 'diagram.entities', 'name');
    const name = requireString(record, 'name', 'diagram.entities');
    declared.add(name);

    const fields = optionalArray(record['fields'] ?? record['campos'], 'diagram.entities[].fields');
    if (fields.length === 0) {
      lines.push(`entity "${plantUmlText(name)}" as ${quoteId(name)}`);
      continue;
    }

    lines.push(`entity "${plantUmlText(name)}" as ${quoteId(name)} {`);
    // Las claves van arriba, separadas del resto: es como se lee un modelo de datos.
    const keys = fields.filter((f) => isKey(f));
    const rest = fields.filter((f) => !isKey(f));
    for (const field of keys) lines.push(`  * ${fieldLine(field)}`);
    if (keys.length > 0 && rest.length > 0) lines.push('  --');
    for (const field of rest) lines.push(`  ${fieldLine(field)}`);
    lines.push('}');
  }

  for (const raw of relations) {
    const record = typeof raw === 'string' ? undefined : asRecord(raw, 'diagram.relations');
    const edge = toEdge(raw, 'diagram.relations');
    for (const endpoint of [edge.from, edge.to]) {
      if (!declared.has(endpoint)) {
        fail(
          `"${endpoint}" no esta declarado en entities`,
          `entidades declaradas: ${[...declared].join(', ')}`,
        );
      }
    }
    const kind = record !== undefined ? (optionalString(record, 'cardinality') ?? 'one-to-many') : 'one-to-many';
    const arrow = CARDINALITY[kind.toLowerCase()];
    if (arrow === undefined) {
      fail(
        `la cardinalidad "${kind}" no existe`,
        `cardinalidades validas: ${[...new Set(Object.keys(CARDINALITY))].join(', ')}`,
      );
    }
    lines.push(
      `${quoteId(edge.from)} ${arrow} ${quoteId(edge.to)}${edge.label !== undefined ? ` : ${plantUmlText(edge.label)}` : ''}`,
    );
  }

  lines.push('@enduml');
  return lines.join('\n');
}

function isKey(field: unknown): boolean {
  if (typeof field === 'string') return false;
  const record = asRecord(field, 'diagram.entities[].fields');
  return record['key'] === true || record['pk'] === true;
}

function fieldLine(field: unknown): string {
  if (typeof field === 'string') return plantUmlText(field.trim());
  const record = asRecord(field, 'diagram.entities[].fields');
  const name = requireString(record, 'name', 'diagram.entities[].fields');
  const type = optionalString(record, 'type');
  return plantUmlText(type !== undefined ? `${name} : ${type}` : name);
}

/** Identificador seguro para PlantUML derivado de un nombre libre. */
function quoteId(name: string): string {
  return `E_${name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '_')}`;
}

// --------------------------------------------------------------------------

export function useCase(doc: Record<string, unknown>): string {
  const actors = requireArray(doc['actors'] ?? doc['actores'], 'diagram.actors');
  const useCases = requireArray(doc['useCases'] ?? doc['casos'], 'diagram.useCases');
  const system = optionalString(doc, 'system');

  const actorIds = new IdFactory('A');
  const caseIds = new IdFactory('U');

  const lines = ['@startuml', 'left to right direction', 'skinparam packageStyle rectangle'];
  for (const raw of actors) {
    const name = nameOf(raw, 'diagram.actors');
    lines.push(`actor "${plantUmlText(name)}" as ${actorIds.id(name)}`);
  }

  const body: string[] = [];
  for (const raw of useCases) {
    const record = asNamedRecord(raw, 'diagram.useCases', 'name');
    const name = requireString(record, 'name', 'diagram.useCases');
    body.push(`  usecase "${plantUmlText(name)}" as ${caseIds.id(name)}`);
  }
  if (system !== undefined) {
    lines.push(`rectangle "${plantUmlText(system)}" {`, ...body, '}');
  } else {
    lines.push(...body.map((l) => l.trim()));
  }

  for (const raw of useCases) {
    const record = asNamedRecord(raw, 'diagram.useCases', 'name');
    const name = requireString(record, 'name', 'diagram.useCases');
    for (const rawActor of optionalArray(record['actors'], 'diagram.useCases[].actors')) {
      const actor = nameOf(rawActor, 'diagram.useCases[].actors');
      const id = actorIds.get(actor);
      if (id === undefined) {
        fail(`el actor "${actor}" no esta declarado`, `actores declarados: ${actorIds.keys().join(', ')}`);
      }
      lines.push(`${id} --> ${caseIds.id(name)}`);
    }
  }

  lines.push('@enduml');
  return lines.join('\n');
}

// --------------------------------------------------------------------------

export function componentDiagram(doc: Record<string, unknown>): string {
  const groups = optionalArray(doc['groups'] ?? doc['grupos'], 'diagram.groups');
  const loose = optionalArray(doc['components'] ?? doc['componentes'], 'diagram.components');
  const relations = optionalArray(doc['relations'] ?? doc['flow'], 'diagram.relations');
  if (groups.length === 0 && loose.length === 0) {
    fail('diagram.components o diagram.groups debe declarar al menos un componente');
  }

  const ids = new IdFactory('C');
  const lines = ['@startuml', 'skinparam componentStyle rectangle'];

  const declare = (name: string, indent: string): void => {
    lines.push(`${indent}component "${plantUmlText(name)}" as ${ids.id(name)}`);
  };

  for (const raw of groups) {
    const group = asRecord(raw, 'diagram.groups');
    const name = requireString(group, 'name', 'diagram.groups');
    lines.push(`package "${plantUmlText(name)}" {`);
    for (const item of requireArray(group['components'] ?? group['items'], 'diagram.groups[].components')) {
      declare(nameOf(item, 'diagram.groups[].components'), '  ');
    }
    lines.push('}');
  }
  for (const item of loose) declare(nameOf(item, 'diagram.components'), '');

  for (const raw of relations) {
    const edge = toEdge(raw, 'diagram.relations');
    for (const endpoint of [edge.from, edge.to]) {
      if (!ids.has(endpoint)) {
        fail(
          `"${endpoint}" no esta declarado como componente`,
          `componentes declarados: ${ids.keys().join(', ')}`,
        );
      }
    }
    const arrow = edge.dashed ? '..>' : '-->';
    lines.push(
      `${ids.get(edge.from)} ${arrow} ${ids.get(edge.to)}${edge.label !== undefined ? ` : ${plantUmlText(edge.label)}` : ''}`,
    );
  }

  lines.push('@enduml');
  return lines.join('\n');
}

// --------------------------------------------------------------------------

const NODE_KINDS = ['node', 'database', 'cloud', 'queue', 'storage', 'component', 'folder'] as const;

export function deployment(doc: Record<string, unknown>): string {
  const nodes = requireArray(doc['nodes'] ?? doc['nodos'], 'diagram.nodes');
  const relations = optionalArray(doc['relations'] ?? doc['flow'], 'diagram.relations');
  const ids = new IdFactory('N');

  const lines = ['@startuml'];
  for (const raw of nodes) {
    const record = asNamedRecord(raw, 'diagram.nodes', 'name');
    const name = requireString(record, 'name', 'diagram.nodes');
    const kind = oneOf(optionalString(record, 'kind'), NODE_KINDS, 'diagram.nodes[].kind', 'node');
    const contains = optionalArray(record['contains'] ?? record['artifacts'], 'diagram.nodes[].contains');
    const id = ids.id(name);

    if (contains.length === 0) {
      lines.push(`${kind} "${plantUmlText(name)}" as ${id}`);
      continue;
    }
    lines.push(`${kind} "${plantUmlText(name)}" as ${id} {`);
    for (const item of contains) {
      const artifact = nameOf(item, 'diagram.nodes[].contains');
      lines.push(`  artifact "${plantUmlText(artifact)}" as ${ids.id(`${name}/${artifact}`)}`);
    }
    lines.push('}');
  }

  for (const raw of relations) {
    const edge = toEdge(raw, 'diagram.relations');
    for (const endpoint of [edge.from, edge.to]) {
      if (!ids.has(endpoint)) {
        fail(`"${endpoint}" no esta declarado en nodes`, `nodos declarados: ${ids.keys().join(', ')}`);
      }
    }
    lines.push(
      `${ids.get(edge.from)} --> ${ids.get(edge.to)}${edge.label !== undefined ? ` : ${plantUmlText(edge.label)}` : ''}`,
    );
  }

  lines.push('@enduml');
  return lines.join('\n');
}

// --------------------------------------------------------------------------

const INPUT_KINDS: Readonly<Record<string, (value?: string) => string>> = {
  text: (v) => `"${v ?? '                    '}"`,
  password: () => '"****                "',
  area: (v) => `"${v ?? '                    '}"`,
  checkbox: (v) => `[${v === 'checked' ? 'X' : ' '}]`,
  radio: (v) => `(${v === 'selected' ? 'X' : ' '})`,
  select: (v) => `^${v ?? 'Seleccione'}^`,
  label: (v) => v ?? '',
};

/**
 * Boceto de interfaz con Salt, la notacion de mockups de PlantUML.
 *
 * Salt maquetea por columnas separadas con `|`, asi que cada fila del DSL se
 * traduce a una fila de la rejilla.
 */
export function wireframe(doc: Record<string, unknown>): string {
  const rows = requireArray(doc['rows'] ?? doc['filas'], 'diagram.rows');
  const lines = ['@startsalt', '{'];

  for (const raw of rows) {
    const row = asRecord(raw, 'diagram.rows');
    const cells: string[] = [];

    for (const rawField of optionalArray(row['fields'] ?? row['campos'], 'diagram.rows[].fields')) {
      const field = asNamedRecord(rawField, 'diagram.rows[].fields', 'label');
      const label = optionalString(field, 'label');
      const kind = optionalString(field, 'input');
      if (label !== undefined) cells.push(saltText(label));
      if (kind !== undefined) {
        const build = INPUT_KINDS[kind.toLowerCase()];
        if (build === undefined) {
          fail(
            `el tipo de campo "${kind}" no existe`,
            `tipos validos: ${Object.keys(INPUT_KINDS).join(', ')}`,
          );
        }
        cells.push(build(optionalString(field, 'value')));
      }
    }

    for (const rawButton of optionalArray(row['buttons'] ?? row['botones'], 'diagram.rows[].buttons')) {
      cells.push(`[ ${saltText(nameOf(rawButton, 'diagram.rows[].buttons'))} ]`);
    }

    const text = optionalString(row, 'text');
    if (text !== undefined) cells.push(saltText(text));
    if (row['separator'] === true || row['separador'] === true) {
      lines.push('  ..');
      continue;
    }
    if (cells.length === 0) fail('cada fila de diagram.rows necesita fields, buttons o text');
    lines.push(`  ${cells.join(' | ')}`);
  }

  lines.push('}', '@endsalt');
  return lines.join('\n');
}

/** Salt usa `|`, `{`, `}` y `[` como sintaxis: se neutralizan en el texto. */
function saltText(text: string): string {
  return text.replace(/[|{}[\]^"]/g, ' ').replace(/\s+/g, ' ').trim();
}

// --------------------------------------------------------------------------

export function jsonTree(doc: Record<string, unknown>): string {
  const data = doc['data'] ?? doc['datos'];
  if (data === undefined) fail('diagram.data debe contener la estructura a dibujar');
  return `@startjson\n${JSON.stringify(data, null, 2)}\n@endjson`;
}

export function yamlTree(doc: Record<string, unknown>): string {
  const data = doc['data'] ?? doc['datos'];
  if (data === undefined) fail('diagram.data debe contener la estructura a dibujar');
  return `@startyaml\n${toYaml(data, 0)}\n@endyaml`;
}

/** Serializador YAML minimo: el DSL ya vino de YAML, solo hay que devolverlo. */
function toYaml(value: unknown, depth: number): string {
  const pad = '  '.repeat(depth);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`;
    return value
      .map((item) =>
        item !== null && typeof item === 'object'
          ? `${pad}-\n${toYaml(item, depth + 1)}`
          : `${pad}- ${scalar(item)}`,
      )
      .join('\n');
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return `${pad}{}`;
    return entries
      .map(([key, v]) =>
        v !== null && typeof v === 'object'
          ? `${pad}${key}:\n${toYaml(v, depth + 1)}`
          : `${pad}${key}: ${scalar(v)}`,
      )
      .join('\n');
  }
  return `${pad}${scalar(value)}`;
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  const text = String(value);
  return /^[\w .,\-/]*$/.test(text) && text.trim() !== '' ? text : JSON.stringify(text);
}

// --------------------------------------------------------------------------

interface Branch {
  name: string;
  children: Branch[];
}

function toBranch(raw: unknown, field: string): Branch {
  if (typeof raw === 'string') return { name: raw.trim(), children: [] };
  const record = asRecord(raw, field);
  const name = requireString(record, 'name', field);
  const rawChildren = record['children'] ?? record['items'] ?? record['branches'];
  return {
    name,
    children: optionalArray(rawChildren, `${field}.children`).map((c) => toBranch(c, `${field}.children`)),
  };
}

/** Descomposicion del trabajo: arbol jerarquico con la notacion de PlantUML. */
export function workBreakdown(doc: Record<string, unknown>): string {
  const root = requireString(doc, 'root', 'diagram.root');
  const branches = requireArray(doc['branches'] ?? doc['items'], 'diagram.branches');

  const lines = ['@startwbs', `* ${plantUmlText(root)}`];
  const walk = (branch: Branch, depth: number): void => {
    lines.push(`${'*'.repeat(depth)} ${plantUmlText(branch.name)}`);
    for (const child of branch.children) walk(child, depth + 1);
  };
  for (const raw of branches) walk(toBranch(raw, 'diagram.branches'), 2);
  lines.push('@endwbs');
  return lines.join('\n');
}

/** Mapa mental con PlantUML; es el respaldo de la version de Mermaid. */
export function plantUmlMindmap(doc: Record<string, unknown>): string {
  const root = requireString(doc, 'root', 'diagram.root');
  const branches = requireArray(doc['branches'] ?? doc['items'], 'diagram.branches');

  const lines = ['@startmindmap', `* ${plantUmlText(root)}`];
  const walk = (branch: Branch, depth: number): void => {
    lines.push(`${'*'.repeat(depth)} ${plantUmlText(branch.name)}`);
    for (const child of branch.children) walk(child, depth + 1);
  };
  for (const raw of branches) walk(toBranch(raw, 'diagram.branches'), 2);
  lines.push('@endmindmap');
  return lines.join('\n');
}

/** Cronograma con PlantUML; es el respaldo de la version de Mermaid. */
export function plantUmlGantt(doc: Record<string, unknown>): string {
  const sections = requireArray(doc['sections'], 'diagram.sections');
  const lines = ['@startgantt'];
  const start = optionalString(doc, 'start');
  if (start !== undefined) lines.push(`Project starts ${start}`);

  const seen = new Set<string>();
  for (const rawSection of sections) {
    const section = asRecord(rawSection, 'diagram.sections');
    for (const rawTask of requireArray(section['tasks'], 'diagram.sections[].tasks')) {
      const task = asNamedRecord(rawTask, 'diagram.sections[].tasks', 'name');
      const name = requireString(task, 'name', 'diagram.sections[].tasks');
      const label = plantUmlText(name).replace(/[[\]]/g, ' ');
      const duration = optionalString(task, 'duration');
      const days = duration !== undefined ? Number.parseInt(duration, 10) : 1;
      lines.push(`[${label}] lasts ${Number.isFinite(days) && days > 0 ? days : 1} days`);
      const after = optionalString(task, 'after');
      if (after !== undefined && seen.has(after)) {
        lines.push(`[${label}] starts at [${plantUmlText(after).replace(/[[\]]/g, ' ')}]s end`);
      }
      seen.add(name);
    }
  }
  lines.push('@endgantt');
  return lines.join('\n');
}
