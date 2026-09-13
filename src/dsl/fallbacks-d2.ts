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
  optionalNumber,
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

/**
 * `activity` con D2: el flujo se aplana en un grafo dirigido.
 *
 * D2 no tiene la notacion de actividad de PlantUML —ni `fork`, ni `if/endif`—
 * asi que las decisiones se dibujan como un rombo con dos salidas etiquetadas y
 * las ramas paralelas como caminos que se abren y se vuelven a juntar. Es la
 * misma informacion con otra forma, que es lo que se espera de un respaldo.
 */
export function d2Activity(doc: Record<string, unknown>): string {
  const flow = requireArray(doc['flow'], 'diagram.flow');
  const ids = new IdFactory('a');
  const lines = ['direction: down', '', 'inicio: "" {shape: circle; style.fill: "#000"; width: 20; height: 20}'];

  const fin = emitir(flow, 'inicio', lines, ids, 'diagram.flow');
  lines.push('final: "" {shape: circle; style.double-border: true; width: 20; height: 20}');
  for (const anterior of fin) lines.push(`${anterior} -> final`);
  return lines.join('\n');
}

/**
 * Emite los pasos y devuelve los nodos que quedan colgando al final.
 *
 * Son varios cuando el ultimo paso fue una decision o un bloque paralelo: las
 * dos ramas tienen que reconectarse con lo que venga despues, y quien lo sabe
 * es el llamante.
 */
function emitir(
  pasos: readonly unknown[],
  desde: string | readonly string[],
  lines: string[],
  ids: IdFactory,
  field: string,
): string[] {
  let anteriores = typeof desde === 'string' ? [desde] : [...desde];

  for (const raw of pasos) {
    if (typeof raw === 'string') {
      anteriores = [conectar(raw.trim(), anteriores, lines, ids)];
      continue;
    }
    const record = asRecord(raw, field);

    if (record['decision'] !== undefined) {
      const pregunta = requireString(record, 'decision', `${field}[].decision`);
      const nodo = ids.id(`decision:${pregunta}`);
      lines.push(`${nodo}: ${d2Label(pregunta)} {shape: diamond}`);
      for (const anterior of anteriores) lines.push(`${anterior} -> ${nodo}`);

      const rama = (pasosRama: unknown[], etiqueta: string): string[] => {
        if (pasosRama.length === 0) return [nodo];
        const primeros = lines.length;
        const salida = emitir(pasosRama, nodo, lines, ids, `${field}[].${etiqueta}`);
        // La primera arista de la rama lleva la etiqueta de la condicion.
        for (let i = primeros; i < lines.length; i += 1) {
          const linea = lines[i]!;
          if (linea.startsWith(`${nodo} -> `) && !linea.includes(': ')) {
            lines[i] = `${linea}: ${d2Label(etiqueta)}`;
            break;
          }
        }
        return salida;
      };

      const si = rama(optionalArray(record['yes'] ?? record['si'], `${field}[].yes`), 'si');
      const no = rama(optionalArray(record['no'], `${field}[].no`), 'no');
      anteriores = [...new Set([...si, ...no])];
      continue;
    }

    if (record['parallel'] !== undefined) {
      const ramas = requireArray(record['parallel'], `${field}[].parallel`);
      const salidas: string[] = [];
      for (const branch of ramas) {
        salidas.push(...emitir(optionalArray(branch, `${field}[].parallel[]`), anteriores, lines, ids, field));
      }
      anteriores = salidas.length > 0 ? [...new Set(salidas)] : anteriores;
      continue;
    }

    // Una nota no es un paso del flujo: se dibuja al margen y no encadena.
    if (record['note'] !== undefined) {
      const nota = ids.id(`nota:${String(record['note'])}`);
      lines.push(`${nota}: ${d2Label(String(record['note']))} {shape: page; style.stroke-dash: 3}`);
      continue;
    }

    anteriores = [conectar(nameOf(record, field), anteriores, lines, ids)];
  }

  return anteriores;
}

/** Declara el paso si hace falta y lo engancha a todo lo que venia antes. */
function conectar(texto: string, anteriores: readonly string[], lines: string[], ids: IdFactory): string {
  const nodo = ids.id(`paso:${texto}`);
  if (!lines.some((l) => l.startsWith(`${nodo}:`))) lines.push(`${nodo}: ${d2Label(texto)}`);
  for (const anterior of anteriores) lines.push(`${anterior} -> ${nodo}`);
  return nodo;
}

/** `kanban` con D2: cada columna es un contenedor con sus tarjetas dentro. */
export function d2Kanban(doc: Record<string, unknown>): string {
  const columns = requireArray(doc['columns'], 'diagram.columns');
  const ids = new IdFactory('k');
  const lines = ['direction: right', ''];

  for (const raw of columns) {
    const record = asNamedRecord(raw, 'diagram.columns');
    const name = requireString(record, 'name', 'diagram.columns');
    lines.push(`${ids.id(`col:${name}`)}: ${d2Label(name)} {`, '  grid-columns: 1');
    for (const item of optionalArray(record['items'], 'diagram.columns.items')) {
      const texto = nameOf(item, 'diagram.columns.items');
      lines.push(`  ${ids.id(`tarjeta:${texto}`)}: ${d2Label(texto)}`);
    }
    lines.push('}');
  }
  return lines.join('\n');
}

/** `block` con D2: una fila por nivel, usando su rejilla nativa. */
export function d2Block(doc: Record<string, unknown>): string {
  const rows = requireArray(doc['rows'] ?? doc['blocks'], 'diagram.rows');
  const ids = new IdFactory('b');
  const lines = ['direction: down', ''];

  rows.forEach((raw, indice) => {
    const celdas = Array.isArray(raw) ? raw : [raw];
    const fila = `fila${indice + 1}`;
    // Una fila con una sola celda no necesita contenedor: seria una caja
    // alrededor de otra caja, sin aportar nada.
    if (celdas.length === 1) {
      const texto = nameOf(celdas[0], 'diagram.rows');
      lines.push(`${ids.id(texto)}: ${d2Label(texto)}`);
      return;
    }
    lines.push(`${fila}: "" {`, `  grid-columns: ${celdas.length}`, '  style.stroke-width: 0');
    for (const celda of celdas) {
      const texto = nameOf(celda, 'diagram.rows');
      lines.push(`  ${ids.id(texto)}: ${d2Label(texto)}`);
    }
    lines.push('}');
  });
  return lines.join('\n');
}

/**
 * `journey` con D2: las secciones son contenedores y la satisfaccion se dibuja
 * en la etiqueta del paso.
 *
 * Mermaid dibuja la curva de satisfaccion como una linea; D2 no puede, asi que
 * el numero se escribe al lado. Se pierde la forma de un vistazo y se conserva
 * el dato, que es lo que no se puede perder.
 */
export function d2Journey(doc: Record<string, unknown>): string {
  const sections = requireArray(doc['sections'], 'diagram.sections');
  const ids = new IdFactory('j');
  const lines = ['direction: right', ''];
  let anterior: string | undefined;

  for (const rawSection of sections) {
    const section = asNamedRecord(rawSection, 'diagram.sections');
    const nombre = requireString(section, 'name', 'diagram.sections');
    const contenedor = ids.id(`seccion:${nombre}`);
    lines.push(`${contenedor}: ${d2Label(nombre)} {`);

    const pasosDeSeccion: string[] = [];
    for (const rawStep of requireArray(section['steps'], 'diagram.sections.steps')) {
      const step = asNamedRecord(rawStep, 'diagram.sections.steps');
      const texto = requireString(step, 'name', 'diagram.sections.steps');
      const score = optionalNumber(step, 'score', 'diagram.sections.steps');
      const actores = optionalArray(step['actors'], 'diagram.sections.steps.actors')
        .map((a) => nameOf(a, 'diagram.sections.steps.actors'))
        .join(', ');
      const detalle = [score !== undefined ? `${score}/5` : undefined, actores === '' ? undefined : actores]
        .filter((x) => x !== undefined)
        .join(' · ');
      const id = ids.id(`paso:${texto}`);
      pasosDeSeccion.push(id);
      lines.push(`  ${id}: ${d2Label(detalle === '' ? texto : `${texto}\n${detalle}`)}`);
    }

    lines.push('}');
    for (const id of pasosDeSeccion) {
      const ruta = `${contenedor}.${id}`;
      if (anterior !== undefined) lines.push(`${anterior} -> ${ruta}`);
      anterior = ruta;
    }
  }
  return lines.join('\n');
}
