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

/**
 * Con que macro se dibuja el LIMITE de un elemento que tiene hijos.
 *
 * C4-PlantUML distingue `System_Boundary` de `Container_Boundary`, y antes se
 * emitia siempre el primero: un `kind: container` con componentes dentro salia
 * rotulado «[system]», que es justo lo que un diagrama de componentes NO debe
 * decir. La clase de la caja la elige quien escribe el bloque; el limite tiene
 * que seguirla.
 */
function boundaryMacro(macro: string): string {
  if (macro.startsWith('Container')) return 'Container_Boundary';
  if (macro.startsWith('System')) return 'System_Boundary';
  return 'Boundary';
}

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
    // Un elemento con hijos se dibuja como frontera, del tipo que le corresponda.
    const boundary = boundaryMacro(element.macro);
    // `Boundary` generico exige un tercer argumento con el tipo a mostrar.
    const extra = boundary === 'Boundary' ? `, ${quote(element.macro)}` : '';
    lines.push(`${indent}${boundary}(${element.id}, ${quote(element.name)}${extra}) {`);
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

// --------------------------------------------------------------------------
// Respaldos Vega-Lite de dos tipos que hoy solo dibuja Mermaid.
//
// La geometria viene del catalogo de plantillas de Flint (Microsoft Research,
// MIT), reescrita aqui para consumir la MISMA forma de documento que la
// version Mermaid: un respaldo que exigiera otra sintaxis no seria un
// respaldo, seria otro tipo. Importan porque Mermaid necesita un Chromium y
// Vega-Lite no: en una maquina sin navegador estos dos pasaban de dibujarse a
// no dibujarse, y ahora se dibujan con otro aspecto.
// --------------------------------------------------------------------------

/** Cuantos dias dura «5d», «2w», «3h». */
function diasDe(duracion: string, campo: string): number {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(h|d|w|m)?\s*$/i.exec(duracion);
  if (m === null) fail(`no se entiende la duracion "${duracion}" en ${campo}`, 'formatos: 5d, 2w, 8h');
  const n = Number(m[1]);
  switch ((m[2] ?? 'd').toLowerCase()) {
    case 'h':
      return n / 24;
    case 'w':
      return n * 7;
    case 'm':
      return n * 30;
    default:
      return n;
  }
}

const DIA_MS = 86_400_000;

function fechaIso(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/** Gantt sin navegador: una barra por tarea, de su inicio a su fin. */
export function vegaGantt(doc: Record<string, unknown>): string {
  const sections = requireArray(doc['sections'], 'diagram.sections');
  const filas: Record<string, unknown>[] = [];
  // `after` encadena tareas, asi que hay que resolver las fechas en orden y
  // recordar donde termino cada una; Mermaid lo hace por nosotros y aqui no.
  const finDe = new Map<string, number>();

  for (const rawSection of sections) {
    const section = asRecord(rawSection, 'diagram.sections');
    const seccion = requireString(section, 'name', 'diagram.sections');
    for (const rawTask of requireArray(section['tasks'], 'diagram.sections[].tasks')) {
      const task = asNamedRecord(rawTask, 'diagram.sections[].tasks', 'name');
      const name = requireString(task, 'name', 'diagram.sections[].tasks');
      const after = optionalString(task, 'after');
      const start = optionalString(task, 'start');

      let inicio: number;
      if (after !== undefined) {
        const previo = finDe.get(after);
        if (previo === undefined) {
          fail(`la tarea "${after}" referida en "after" no existe todavia`, `tareas conocidas: ${[...finDe.keys()].join(', ')}`);
        }
        inicio = previo;
      } else if (start !== undefined) {
        inicio = Date.parse(start);
        if (Number.isNaN(inicio)) fail(`la fecha "${start}" de "${name}" no es valida`, 'formato: 2026-09-01');
      } else {
        fail(`la tarea "${name}" necesita "start" o "after"`);
      }

      const duration = optionalString(task, 'duration');
      const end = optionalString(task, 'end');
      let fin: number;
      if (duration !== undefined) fin = inicio + diasDe(duration, `la tarea "${name}"`) * DIA_MS;
      else if (end !== undefined) {
        fin = Date.parse(end);
        if (Number.isNaN(fin)) fail(`la fecha "${end}" de "${name}" no es valida`, 'formato: 2026-09-30');
      } else if (optionalString(task, 'status') === 'milestone') fin = inicio;
      else fail(`la tarea "${name}" necesita "duration" o "end"`);

      finDe.set(name, fin);
      const fila: Record<string, unknown> = {
        tarea: name,
        seccion,
        inicio: fechaIso(inicio),
        // Un hito dura cero, y una barra de ancho cero no se ve: se le da un
        // dia para que exista como marca.
        fin: fechaIso(fin === inicio ? fin + DIA_MS : fin),
      };
      const status = optionalString(task, 'status');
      if (status !== undefined) fila['estado'] = status;
      filas.push(fila);
    }
  }

  const conEstado = filas.some((f) => f['estado'] !== undefined);
  const variasSecciones = new Set(filas.map((f) => f['seccion'])).size > 1;
  const encoding: Record<string, unknown> = {
    y: { field: 'tarea', type: 'nominal', title: null, sort: null },
    x: { field: 'inicio', type: 'temporal', title: null },
    x2: { field: 'fin' },
  };
  if (conEstado) encoding['color'] = { field: 'estado', type: 'nominal', title: null };

  const spec: Record<string, unknown> = {
    data: { values: filas },
    // `band: 0.7` deja aire entre filas; pegadas se leen como un bloque.
    mark: { type: 'bar', cornerRadius: 2, height: { band: 0.7 } },
    encoding,
  };
  const title = optionalString(doc, 'title');
  if (title !== undefined) spec['title'] = title;
  // Las secciones se vuelven filas del grafico, que es como Mermaid las separa.
  if (variasSecciones) {
    return JSON.stringify(
      {
        ...(title !== undefined ? { title } : {}),
        data: { values: filas },
        facet: { row: { field: 'seccion', type: 'nominal', title: null, sort: null, header: { labelAngle: 0, labelAlign: 'left' } } },
        resolve: { scale: { y: 'independent' } },
        spec: { mark: spec['mark'], encoding },
      },
      null,
      2,
    );
  }
  return JSON.stringify(spec, null, 2);
}

/** Radar sin navegador: los ejes se proyectan a coordenadas cartesianas. */
export function vegaRadar(doc: Record<string, unknown>): string {
  const axes = requireArray(doc['axes'] ?? doc['ejes'], 'diagram.axes');
  const nombres = axes.map((a) => nameOf(a, 'diagram.axes'));
  if (nombres.length < 3) fail('un radar necesita al menos tres ejes', `se recibieron ${nombres.length}`);

  const series = optionalArray(doc['series'], 'diagram.series');
  const sueltos = optionalArray(doc['values'] ?? doc['valores'], 'diagram.values');
  if (series.length === 0 && sueltos.length === 0) {
    fail('radar necesita series o values', 'ejemplo: values: [3, 4, 2]');
  }
  const curvas =
    series.length > 0
      ? series.map((raw) => {
          const s = asRecord(raw, 'diagram.series');
          return {
            name: requireString(s, 'name', 'diagram.series'),
            values: requireArray(s['values'], 'diagram.series[].values').map(Number),
          };
        })
      : [{ name: optionalString(doc, 'seriesName') ?? 'Actual', values: sueltos.map(Number) }];

  const declarado = doc['max'];
  const maximo =
    typeof declarado === 'number' ? declarado : Math.max(...curvas.flatMap((c) => c.values), 1);
  const R = 120;

  // Vega-Lite no dibuja en coordenadas polares, asi que el angulo se resuelve
  // aqui y el punto llega ya proyectado. Es lo mismo que hace Flint: su radar
  // es una linea cerrada sobre coordenadas calculadas, no una marca polar.
  const proyectar = (indice: number, valor: number): { x: number; y: number } => {
    const angulo = (indice / nombres.length) * 2 * Math.PI - Math.PI / 2;
    const r = (Math.max(0, valor) / maximo) * R;
    return { x: Number((r * Math.cos(angulo)).toFixed(2)), y: Number((r * Math.sin(angulo)).toFixed(2)) };
  };

  const puntos = curvas.flatMap((c) =>
    nombres.map((eje, i) => ({ ...proyectar(i, c.values[i] ?? 0), eje, serie: c.name, orden: i })),
  );
  const malla = [0.25, 0.5, 0.75, 1].flatMap((f, anillo) =>
    nombres.map((eje, i) => ({ ...proyectar(i, maximo * f), anillo, orden: i, eje })),
  );
  const etiquetas = nombres.map((eje, i) => ({ ...proyectar(i, maximo * 1.2), eje }));

  const oculto = { axis: null, scale: { domain: [-R * 1.5, R * 1.5] } };
  const pos = {
    x: { field: 'x', type: 'quantitative', ...oculto },
    y: { field: 'y', type: 'quantitative', ...oculto },
    order: { field: 'orden', type: 'quantitative' },
  };
  const color = { field: 'serie', type: 'nominal', title: null };

  const spec: Record<string, unknown> = {
    width: 300,
    height: 300,
    layer: [
      {
        data: { values: malla },
        mark: { type: 'line', strokeWidth: 0.7, opacity: 0.3, interpolate: 'linear-closed' },
        encoding: { ...pos, detail: { field: 'anillo', type: 'nominal' } },
      },
      {
        data: { values: puntos },
        mark: { type: 'line', strokeWidth: 2, interpolate: 'linear-closed', filled: true, fillOpacity: 0.15 },
        encoding: { ...pos, color },
      },
      {
        data: { values: puntos },
        mark: { type: 'circle', size: 50, opacity: 1 },
        encoding: { ...pos, color },
      },
      {
        data: { values: etiquetas },
        mark: { type: 'text', fontSize: 11 },
        encoding: { x: pos.x, y: pos.y, text: { field: 'eje', type: 'nominal' } },
      },
    ],
  };
  const title = optionalString(doc, 'title');
  if (title !== undefined) spec['title'] = title;
  return JSON.stringify(spec, null, 2);
}
