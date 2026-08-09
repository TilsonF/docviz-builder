/**
 * Bloque `architecture`: modelo C4 declarativo -> DSL LikeC4 -> SVG.
 *
 * El agente describe elementos y relaciones; DocViz escribe el LikeC4, incluida
 * la especificacion de tipos y la vista.
 */

import { fail } from './util.js';
import {
  asArrowShorthand,
  asRecord,
  likec4Label,
  optionalArray,
  optionalString,
  requireArray,
  requireString,
  toEdge,
} from './util.js';

export interface CompiledArchitecture {
  rendererType: 'likec4';
  source: string;
}

export const ARCHITECTURE_TYPES = [
  'c4-context',
  'c4-container',
  'c4-component',
  'c4-deployment',
  'context',
  'container',
  'component',
] as const;

/** Clases de elemento admitidas y su forma LikeC4. */
const ELEMENT_KINDS: Readonly<Record<string, { shape: string }>> = {
  person: { shape: 'person' },
  actor: { shape: 'person' },
  system: { shape: 'rectangle' },
  'external-system': { shape: 'rectangle' },
  container: { shape: 'rectangle' },
  component: { shape: 'component' },
  database: { shape: 'cylinder' },
  queue: { shape: 'queue' },
  storage: { shape: 'storage' },
  browser: { shape: 'browser' },
  mobile: { shape: 'mobile' },
  service: { shape: 'rectangle' },
};

/** Alias del usuario -> clase canonica. */
const KIND_ALIASES: Readonly<Record<string, string>> = {
  usuario: 'person',
  persona: 'person',
  actor: 'actor',
  sistema: 'system',
  externo: 'external-system',
  'sistema-externo': 'external-system',
  contenedor: 'container',
  componente: 'component',
  'base-de-datos': 'database',
  bd: 'database',
  db: 'database',
  cola: 'queue',
  almacenamiento: 'storage',
  navegador: 'browser',
  movil: 'mobile',
  servicio: 'service',
};

const COLORS = ['primary', 'secondary', 'muted', 'blue', 'green', 'amber', 'red', 'gray', 'indigo', 'sky', 'slate'];

interface Element {
  id: string;
  kind: string;
  name: string;
  description?: string;
  technology?: string;
  color?: string;
  parent?: string;
  children: Element[];
}

export function compileArchitecture(doc: Record<string, unknown>): CompiledArchitecture {
  const type = (optionalString(doc, 'type') ?? 'c4-context').toLowerCase();
  if (!(ARCHITECTURE_TYPES as readonly string[]).includes(type)) {
    fail(
      `el tipo de arquitectura "${type}" no existe`,
      `tipos disponibles: ${ARCHITECTURE_TYPES.join(', ')}`,
    );
  }

  const rawElements = requireArray(doc['elements'] ?? doc['nodes'], 'architecture.elements');
  const rawRelations = optionalArray(doc['relations'] ?? doc['relationships'], 'architecture.relations');
  const title = optionalString(doc, 'title');

  const elements = new Map<string, Element>();
  const order: string[] = [];

  for (const raw of rawElements) {
    const record = asRecord(raw, 'architecture.elements');
    const name = requireString(record, 'name', 'architecture.elements');
    const id = sanitizeId(optionalString(record, 'id') ?? name, elements);
    const kind = normalizeKind(optionalString(record, 'kind') ?? 'system');
    const element: Element = { id, kind, name, children: [] };
    const description = optionalString(record, 'description');
    if (description !== undefined) element.description = description;
    const technology = optionalString(record, 'technology') ?? optionalString(record, 'tech');
    if (technology !== undefined) element.technology = technology;
    const color = optionalString(record, 'color');
    if (color !== undefined) {
      if (!COLORS.includes(color.toLowerCase())) {
        fail(`el color "${color}" no existe`, `colores validos: ${COLORS.join(', ')}`);
      }
      element.color = color.toLowerCase();
    }
    const parent = optionalString(record, 'parent');
    if (parent !== undefined) element.parent = parent;
    elements.set(id, element);
    order.push(id);
  }

  // Resolucion de jerarquia: `parent` puede referirse al id o al nombre.
  const byName = new Map<string, Element>();
  for (const element of elements.values()) byName.set(element.name, element);
  const roots: Element[] = [];
  for (const id of order) {
    const element = elements.get(id)!;
    if (element.parent === undefined) {
      roots.push(element);
      continue;
    }
    const parent = elements.get(element.parent) ?? byName.get(element.parent);
    if (parent === undefined) {
      fail(
        `el elemento padre "${element.parent}" de "${element.name}" no existe`,
        `elementos declarados: ${[...elements.values()].map((e) => e.name).join(', ')}`,
      );
    }
    if (parent === element) fail(`el elemento "${element.name}" no puede ser su propio padre`);
    parent.children.push(element);
  }
  assertNoCycles(roots, elements.size);

  // Especificacion: solo las clases realmente usadas.
  const usedKinds = [...new Set([...elements.values()].map((e) => e.kind))].sort();
  const lines: string[] = ['specification {'];
  for (const kind of usedKinds) {
    const shape = ELEMENT_KINDS[kind]!.shape;
    // `size sm` evita cajas de 320x180 con una sola palabra dentro: un
    // contexto C4 de tres elementos cabe asi en una pantalla.
    lines.push(
      `  element ${kind} {`,
      '    style {',
      `      shape ${shape}`,
      '      size sm',
      '    }',
      '  }',
    );
  }
  lines.push('}', '', 'model {');

  const fqnOf = new Map<string, string>();
  const containersWithChildren: string[] = [];
  const emit = (element: Element, indent: string, prefix: string): void => {
    const fqn = prefix === '' ? element.id : `${prefix}.${element.id}`;
    fqnOf.set(element.id, fqn);
    fqnOf.set(element.name, fqn);
    if (element.children.length > 0) containersWithChildren.push(fqn);
    lines.push(`${indent}${element.id} = ${element.kind} ${likec4Label(element.name)} {`);
    if (element.description !== undefined) lines.push(`${indent}  description ${likec4Label(element.description)}`);
    if (element.technology !== undefined) lines.push(`${indent}  technology ${likec4Label(element.technology)}`);
    if (element.color !== undefined) {
      lines.push(`${indent}  style {`, `${indent}    color ${element.color}`, `${indent}  }`);
    }
    // Los hijos se emiten dentro del cuerpo del padre: asi LikeC4 los dibuja
    // como elementos contenidos y no como cajas sueltas.
    for (const child of element.children) emit(child, `${indent}  `, fqn);
    lines.push(`${indent}}`);
  };
  for (const root of roots) emit(root, '  ', '');

  lines.push('');
  for (const raw of rawRelations) {
    // `- Usuario -> Core: Utiliza` llega como cadena o, si YAML vio los dos
    // puntos, como mapa de una entrada. Ambas se normalizan igual que la forma
    // explicita `{from, to, label}`.
    const relation = toRelationRecord(raw);
    const from = resolveRef(fqnOf, requireString(relation, 'from', 'architecture.relations'), 'from');
    const to = resolveRef(fqnOf, requireString(relation, 'to', 'architecture.relations'), 'to');
    const label = optionalString(relation, 'label') ?? optionalString(relation, 'text');
    const technology = optionalString(relation, 'technology') ?? optionalString(relation, 'tech');
    if (technology !== undefined) {
      lines.push(`  ${from} -> ${to} ${likec4Label(label ?? '')} {`);
      lines.push(`    technology ${likec4Label(technology)}`);
      lines.push('  }');
    } else {
      lines.push(`  ${from} -> ${to}${label !== undefined ? ` ${likec4Label(label)}` : ''}`);
    }
  }
  lines.push('}', '', 'views {', '  view index {');
  if (title !== undefined) lines.push(`    title ${likec4Label(title)}`);
  const direction = optionalString(doc, 'direction');
  if (direction !== undefined) {
    const valid = ['TopBottom', 'BottomTop', 'LeftRight', 'RightLeft'];
    const normalized = valid.find((v) => v.toLowerCase() === direction.replace(/[-_]/g, '').toLowerCase());
    if (normalized === undefined) {
      fail(`la direccion "${direction}" no existe`, `direcciones validas: ${valid.join(', ')}`);
    }
    lines.push(`    autoLayout ${normalized}`);
  }
  lines.push('    include *');
  // `include *` de LikeC4 solo trae el primer nivel: sin esto, un modelo con
  // contenedores anidados se dibujaria como una unica caja vacia.
  for (const fqn of containersWithChildren) lines.push(`    include ${fqn}.**`);
  lines.push('  }', '}');

  return { rendererType: 'likec4', source: lines.join('\n') };
}

/** Normaliza cualquiera de las formas admitidas de relacion a `{from,to,label}`. */
function toRelationRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string' || asArrowShorthand(raw) !== undefined) {
    const edge = toEdge(raw, 'architecture.relations');
    const record: Record<string, unknown> = { from: edge.from, to: edge.to };
    if (edge.label !== undefined) record['label'] = edge.label;
    return record;
  }
  return asRecord(raw, 'architecture.relations');
}

function resolveRef(fqnOf: Map<string, string>, ref: string, field: string): string {
  const fqn = fqnOf.get(ref);
  if (fqn === undefined) {
    fail(
      `"${ref}" no corresponde a ningun elemento declarado (${field})`,
      `referencias validas: ${[...new Set(fqnOf.keys())].join(', ')}`,
    );
  }
  return fqn;
}

function normalizeKind(kind: string): string {
  const normalized = kind.trim().toLowerCase().replace(/\s+/g, '-');
  const canonical = KIND_ALIASES[normalized] ?? normalized;
  if (ELEMENT_KINDS[canonical] === undefined) {
    fail(
      `la clase de elemento "${kind}" no existe`,
      `clases validas: ${Object.keys(ELEMENT_KINDS).join(', ')}`,
    );
  }
  return canonical;
}

/** Identificadores LikeC4: letra inicial, despues letras, digitos y `_`. */
function sanitizeId(raw: string, existing: Map<string, Element>): string {
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

function assertNoCycles(roots: Element[], total: number): void {
  let visited = 0;
  const walk = (element: Element, depth: number): void => {
    if (depth > 32) fail('la jerarquia de elementos es demasiado profunda o tiene un ciclo');
    visited += 1;
    for (const child of element.children) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  if (visited !== total) {
    fail('hay elementos con una relacion de padre ciclica', 'revisa los campos "parent"');
  }
}
