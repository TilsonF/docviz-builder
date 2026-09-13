/**
 * Respaldos hacia D2 para los tipos que dependen de PlantUML.
 *
 * D2 va embebido como WebAssembly: no necesita Java ni navegador, asi que
 * **esta siempre disponible**. Eso lo convierte en el respaldo con mas valor
 * que se puede declarar: un respaldo hacia Mermaid solo ayuda a quien tenga un
 * Chromium, mientras que este salva el tipo en cualquier maquina.
 *
 * El dibujo no sale igual —D2 no es PlantUML— y por eso siguen siendo respaldos
 * y no la opcion preferida. Pero un diagrama con otro aspecto es infinitamente
 * mejor que un build que se cae.
 */

import {
  asNamedRecord,
  asRecord,
  d2Label,
  IdFactory,
  nameOf,
  optionalArray,
  optionalString,
  requireArray,
  requireString,
  toEdge,
} from './util.js';

/** `sequence` con D2, que tiene diagramas de secuencia propios. */
export function d2Sequence(doc: Record<string, unknown>): string {
  const participants = requireArray(doc['participants'], 'diagram.participants');
  const flow = requireArray(doc['flow'] ?? doc['messages'], 'diagram.flow');

  const ids = new IdFactory('p');
  const lines = ['shape: sequence_diagram', ''];
  for (const raw of participants) {
    const name = nameOf(raw, 'diagram.participants');
    lines.push(`${ids.id(name)}: ${d2Label(name)}`);
  }

  for (const raw of flow) {
    const edge = toEdge(raw, 'diagram.flow');
    for (const endpoint of [edge.from, edge.to]) {
      if (!ids.has(endpoint)) lines.push(`${ids.id(endpoint)}: ${d2Label(endpoint)}`);
    }
    const style = edge.dashed ? ' {style.stroke-dash: 4}' : '';
    const label = edge.label !== undefined ? `: ${d2Label(edge.label)}` : '';
    lines.push(`${ids.get(edge.from)} -> ${ids.get(edge.to)}${label}${style}`);
  }
  return lines.join('\n');
}

/** `class` con D2, que tiene forma de clase con atributos y metodos. */
export function d2Class(doc: Record<string, unknown>): string {
  const classes = requireArray(doc['classes'] ?? doc['entities'], 'diagram.classes');
  const relations = optionalArray(doc['relations'], 'diagram.relations');

  const ids = new IdFactory('c');
  const lines: string[] = [];

  for (const raw of classes) {
    const record = asNamedRecord(raw, 'diagram.classes');
    const name = requireString(record, 'name', 'diagram.classes');
    const id = ids.id(name);
    lines.push(`${id}: ${d2Label(name)} {`, '  shape: class');
    for (const attr of optionalArray(record['attributes'], 'diagram.classes.attributes')) {
      lines.push(`  ${sanear(String(attr))}: ""`);
    }
    for (const method of optionalArray(record['methods'], 'diagram.classes.methods')) {
      lines.push(`  ${sanear(String(method))}(): ""`);
    }
    lines.push('}');
  }

  for (const raw of relations) {
    const record = asRecord(raw, 'diagram.relations');
    const from = requireString(record, 'from', 'diagram.relations');
    const to = requireString(record, 'to', 'diagram.relations');
    const tipo = optionalString(record, 'type');
    if (!ids.has(from)) lines.push(`${ids.id(from)}: ${d2Label(from)}`);
    if (!ids.has(to)) lines.push(`${ids.id(to)}: ${d2Label(to)}`);
    const etiqueta = tipo !== undefined ? `: ${d2Label(tipo)}` : '';
    lines.push(`${ids.get(from)} -> ${ids.get(to)}${etiqueta}`);
  }
  return lines.join('\n');
}

/** `state` con D2: nodos y transiciones, con el inicial y los finales marcados. */
export function d2State(doc: Record<string, unknown>): string {
  const states = requireArray(doc['states'], 'diagram.states');
  const transitions = requireArray(doc['transitions'], 'diagram.transitions');
  const initial = optionalString(doc, 'initial');
  const finals = optionalArray(doc['finals'], 'diagram.finals').map((f) => String(f));

  const ids = new IdFactory('s');
  const lines = ['direction: right', ''];
  for (const raw of states) {
    const name = nameOf(raw, 'diagram.states');
    const id = ids.id(name);
    const esFinal = finals.includes(name);
    lines.push(`${id}: ${d2Label(name)}${esFinal ? ' {style.double-border: true}' : ''}`);
  }
  if (initial !== undefined) {
    lines.push('inicio: "" {shape: circle; style.fill: "#000"; width: 20; height: 20}');
    if (!ids.has(initial)) lines.push(`${ids.id(initial)}: ${d2Label(initial)}`);
    lines.push(`inicio -> ${ids.get(initial)}`);
  }
  for (const raw of transitions) {
    const edge = toEdge(raw, 'diagram.transitions');
    for (const endpoint of [edge.from, edge.to]) {
      if (!ids.has(endpoint)) lines.push(`${ids.id(endpoint)}: ${d2Label(endpoint)}`);
    }
    const label = edge.label !== undefined ? `: ${d2Label(edge.label)}` : '';
    lines.push(`${ids.get(edge.from)} -> ${ids.get(edge.to)}${label}`);
  }
  return lines.join('\n');
}

/** `component` con D2: cada grupo es un contenedor. */
export function d2Component(doc: Record<string, unknown>): string {
  const groups = optionalArray(doc['groups'], 'diagram.groups');
  const sueltos = optionalArray(doc['components'], 'diagram.components');
  const relations = optionalArray(doc['relations'], 'diagram.relations');
  if (groups.length === 0 && sueltos.length === 0) {
    return d2Sueltos(relations, 'diagram.relations');
  }

  const ids = new IdFactory('k');
  const lines: string[] = [];

  for (const raw of groups) {
    const record = asNamedRecord(raw, 'diagram.groups');
    const name = requireString(record, 'name', 'diagram.groups');
    const grupo = ids.id(`grupo:${name}`);
    lines.push(`${grupo}: ${d2Label(name)} {`);
    for (const comp of optionalArray(record['components'], 'diagram.groups.components')) {
      const nombre = nameOf(comp, 'diagram.groups.components');
      lines.push(`  ${ids.id(nombre)}: ${d2Label(nombre)}`);
    }
    lines.push('}');
  }
  for (const comp of sueltos) {
    const nombre = nameOf(comp, 'diagram.components');
    lines.push(`${ids.id(nombre)}: ${d2Label(nombre)}`);
  }

  for (const raw of relations) {
    const edge = toEdge(raw, 'diagram.relations');
    const from = rutaDe(ids, edge.from, lines);
    const to = rutaDe(ids, edge.to, lines);
    const label = edge.label !== undefined ? `: ${d2Label(edge.label)}` : '';
    lines.push(`${from} -> ${to}${label}`);
  }
  return lines.join('\n');
}

/** `deployment` con D2: los nodos que contienen artefactos son contenedores. */
export function d2Deployment(doc: Record<string, unknown>): string {
  const nodes = requireArray(doc['nodes'], 'diagram.nodes');
  const relations = optionalArray(doc['relations'], 'diagram.relations');

  const ids = new IdFactory('d');
  const lines: string[] = [];

  for (const raw of nodes) {
    const record = asNamedRecord(raw, 'diagram.nodes');
    const name = requireString(record, 'name', 'diagram.nodes');
    const kind = optionalString(record, 'kind') ?? 'node';
    const contiene = optionalArray(record['contains'], 'diagram.nodes.contains');
    const id = ids.id(name);
    const forma = kind === 'database' ? ' {shape: cylinder}' : '';

    if (contiene.length === 0) {
      lines.push(`${id}: ${d2Label(name)}${forma}`);
      continue;
    }
    lines.push(`${id}: ${d2Label(name)} {`);
    for (const artefacto of contiene) {
      const nombre = nameOf(artefacto, 'diagram.nodes.contains');
      lines.push(`  ${ids.id(nombre)}: ${d2Label(nombre)}`);
    }
    lines.push('}');
  }

  for (const raw of relations) {
    const edge = toEdge(raw, 'diagram.relations');
    const from = rutaDe(ids, edge.from, lines);
    const to = rutaDe(ids, edge.to, lines);
    const label = edge.label !== undefined ? `: ${d2Label(edge.label)}` : '';
    lines.push(`${from} -> ${to}${label}`);
  }
  return lines.join('\n');
}

/** `use-case` con D2: el sistema es un contenedor y los actores quedan fuera. */
export function d2UseCase(doc: Record<string, unknown>): string {
  const actors = requireArray(doc['actors'], 'diagram.actors');
  const casos = requireArray(doc['useCases'] ?? doc['cases'], 'diagram.useCases');
  const system = optionalString(doc, 'system');

  const ids = new IdFactory('u');
  const lines: string[] = [];
  for (const raw of actors) {
    const name = nameOf(raw, 'diagram.actors');
    lines.push(`${ids.id(name)}: ${d2Label(name)} {shape: person}`);
  }

  const contenedor = system === undefined ? undefined : ids.id(`sistema:${system}`);
  if (contenedor !== undefined) lines.push(`${contenedor}: ${d2Label(system!)} {`);
  const sangria = contenedor === undefined ? '' : '  ';
  for (const raw of casos) {
    const record = asNamedRecord(raw, 'diagram.useCases');
    const name = requireString(record, 'name', 'diagram.useCases');
    lines.push(`${sangria}${ids.id(name)}: ${d2Label(name)} {shape: oval}`);
  }
  if (contenedor !== undefined) lines.push('}');

  for (const raw of casos) {
    const record = asNamedRecord(raw, 'diagram.useCases');
    const name = requireString(record, 'name', 'diagram.useCases');
    const destino = contenedor === undefined ? ids.get(name)! : `${contenedor}.${ids.get(name)!}`;
    for (const actor of optionalArray(record['actors'], 'diagram.useCases.actors')) {
      const nombre = nameOf(actor, 'diagram.useCases.actors');
      if (!ids.has(nombre)) lines.push(`${ids.id(nombre)}: ${d2Label(nombre)} {shape: person}`);
      lines.push(`${ids.get(nombre)} -> ${destino}`);
    }
  }
  return lines.join('\n');
}

/** `wbs` con D2: el mismo arbol que dibujan los tipos estrategicos. */
export function d2Wbs(doc: Record<string, unknown>): string {
  const root = requireString(doc, 'root', 'diagram');
  const branches = requireArray(doc['branches'], 'diagram.branches');

  const ids = new IdFactory('w');
  const lines = ['direction: down', '', `${ids.id(root)}: ${d2Label(root)}`];
  for (const raw of branches) {
    const record = asNamedRecord(raw, 'diagram.branches');
    const name = requireString(record, 'name', 'diagram.branches');
    lines.push(`${ids.id(name)}: ${d2Label(name)}`, `${ids.get(root)} -> ${ids.get(name)}`);
    for (const hijo of optionalArray(record['children'], 'diagram.branches.children')) {
      const nombre = nameOf(hijo, 'diagram.branches.children');
      lines.push(`${ids.id(nombre)}: ${d2Label(nombre)}`, `${ids.get(name)} -> ${ids.get(nombre)}`);
    }
  }
  return lines.join('\n');
}

// --------------------------------------------------------------------------

/** Identificador valido en D2 a partir de un texto cualquiera. */
function sanear(texto: string): string {
  const limpio = texto.replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '');
  return limpio === '' ? 'x' : limpio;
}

/**
 * Ruta de un nodo dentro de su contenedor.
 *
 * D2 referencia lo anidado con `contenedor.hijo`. Se busca la linea donde se
 * declaro para saber si estaba sangrado, en lugar de mantener un mapa aparte
 * que habria que sincronizar.
 */
function rutaDe(ids: IdFactory, nombre: string, lines: string[]): string {
  if (!ids.has(nombre)) {
    lines.push(`${ids.id(nombre)}: ${d2Label(nombre)}`);
    return ids.get(nombre)!;
  }
  const id = ids.get(nombre)!;
  let contenedor: string | undefined;
  for (const linea of lines) {
    const abre = /^(\w+): .* \{$/.exec(linea);
    if (abre !== null) contenedor = abre[1];
    else if (linea === '}') contenedor = undefined;
    else if (linea.startsWith(`  ${id}:`)) return contenedor === undefined ? id : `${contenedor}.${id}`;
  }
  return id;
}

/** Cuando solo hay relaciones, el diagrama es el grafo que describen. */
function d2Sueltos(relations: readonly unknown[], field: string): string {
  const ids = new IdFactory('k');
  const lines: string[] = [];
  for (const raw of relations) {
    const edge = toEdge(raw, field);
    for (const endpoint of [edge.from, edge.to]) {
      if (!ids.has(endpoint)) lines.push(`${ids.id(endpoint)}: ${d2Label(endpoint)}`);
    }
    const label = edge.label !== undefined ? `: ${d2Label(edge.label)}` : '';
    lines.push(`${ids.get(edge.from)} -> ${ids.get(edge.to)}${label}`);
  }
  return lines.join('\n');
}
