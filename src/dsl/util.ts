/**
 * Utilidades de validacion del DSL declarativo.
 *
 * Los mensajes son la interfaz real del DSL para un agente: deben decir que
 * campo falla, que se esperaba y como se escribe bien.
 */

import { DslValidationError, ERROR_CODES, type ErrorCode } from '../core/errors.js';

/**
 * Aborta la compilacion del bloque.
 *
 * El codigo es tan importante como el texto: un agente que reintenta necesita
 * distinguir "falta un campo" de "el valor no vale" sin leer castellano.
 */
export function fail(message: string, detail?: string, code: ErrorCode = ERROR_CODES.DSL): never {
  throw new DslValidationError(message, detail, code);
}

export function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${field} debe ser un mapa`, `valor recibido: ${preview(value)}`, ERROR_CODES.DSL_FIELD_TYPE);
  }
  return value as Record<string, unknown>;
}

/**
 * Texto obligatorio.
 *
 * Acepta numeros y booleanos porque YAML los convierte sin avisar: en
 * `- name: 2025` el valor llega como numero, y rechazarlo obligaria al autor a
 * entrecomillar cualquier etiqueta que parezca un dato.
 */
export function requireString(record: Record<string, unknown>, key: string, field: string): string {
  const value = record[key];
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'string' || value.trim() === '') {
    fail(
      `falta el campo obligatorio "${key}" en ${field}`,
      `valor recibido: ${preview(value)}`,
      ERROR_CODES.DSL_FIELD_MISSING,
    );
  }
  return value.trim();
}

export function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function optionalNumber(record: Record<string, unknown>, key: string, field: string): number | undefined {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    fail(`${field}.${key} debe ser numerico`, `valor recibido: ${preview(value)}`, ERROR_CODES.DSL_FIELD_TYPE);
  }
  return n;
}

export function requireNumber(record: Record<string, unknown>, key: string, field: string): number {
  const n = optionalNumber(record, key, field);
  if (n === undefined) {
    fail(`falta el campo numerico obligatorio "${key}" en ${field}`, undefined, ERROR_CODES.DSL_FIELD_MISSING);
  }
  return n;
}

export function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(
      `${field} debe ser una lista con al menos un elemento`,
      `valor recibido: ${preview(value)}`,
      ERROR_CODES.DSL_FIELD_MISSING,
    );
  }
  return value;
}

export function optionalArray(value: unknown, field: string): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    fail(`${field} debe ser una lista`, `valor recibido: ${preview(value)}`, ERROR_CODES.DSL_FIELD_TYPE);
  }
  return value;
}

/**
 * Acepta `- Texto` o `- name: Texto` de forma indistinta.
 *
 * Los numeros se admiten porque YAML los convierte solo: en `quadrants: [1, 2]`
 * el autor esta escribiendo etiquetas, no cantidades.
 */
export function nameOf(item: unknown, field: string, key = 'name'): string {
  if (typeof item === 'number' || typeof item === 'boolean') return String(item);
  if (typeof item === 'string') {
    const t = item.trim();
    if (t === '') fail(`${field} contiene un elemento vacio`, undefined, ERROR_CODES.DSL_FIELD_MISSING);
    return t;
  }
  const record = asRecord(item, field);
  return requireString(record, key, field);
}

/**
 * Normaliza `- Texto` y `- {name: Texto, ...}` a un mapa.
 *
 * Es el patron mas repetido del DSL: casi todas las listas admiten la forma
 * corta. Centralizarlo evita que cada compilador olvide que YAML convierte
 * `- 2025` en numero y rompa con una etiqueta perfectamente valida.
 */
export function asNamedRecord(raw: unknown, field: string, key = 'name'): Record<string, unknown> {
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    return { [key]: String(raw) };
  }
  return asRecord(raw, field);
}

export function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  field: string,
  fallback: T,
): T {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase() as T;
  if (!allowed.includes(normalized)) {
    fail(
      `${field} no admite el valor "${value}"`,
      `valores validos: ${allowed.join(', ')}`,
      ERROR_CODES.DSL_VALUE_NOT_ALLOWED,
    );
  }
  return normalized;
}

function preview(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text === undefined) return 'undefined';
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

// --------------------------------------------------------------------------
// Generacion de identificadores y escapado por motor
// --------------------------------------------------------------------------

/**
 * Generador de ids estables y seguros.
 *
 * Los motores destino se alimentan siempre de ids sinteticos (`n1`, `n2`, ...)
 * y del texto original solo como etiqueta entrecomillada. Asi ningun caracter
 * del documento puede alterar la sintaxis generada.
 */
export class IdFactory {
  private readonly byKey = new Map<string, string>();
  private counter = 0;

  constructor(private readonly prefix = 'n') {}

  id(key: string): string {
    const existing = this.byKey.get(key);
    if (existing !== undefined) return existing;
    this.counter += 1;
    const id = `${this.prefix}${this.counter}`;
    this.byKey.set(key, id);
    return id;
  }

  has(key: string): boolean {
    return this.byKey.has(key);
  }

  get(key: string): string | undefined {
    return this.byKey.get(key);
  }

  keys(): string[] {
    return [...this.byKey.keys()];
  }
}

/** Cadena entre comillas dobles para D2. */
export function d2Label(text: string): string {
  return JSON.stringify(text);
}

/** Cadena entre comillas simples para LikeC4. */
export function likec4Label(text: string): string {
  return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ')}'`;
}

/** Etiqueta segura para Mermaid: entre comillas y sin comillas internas. */
export function mermaidLabel(text: string): string {
  return `"${text.replace(/"/g, "'").replace(/\n/g, ' ')}"`;
}

/** Texto seguro dentro de una etiqueta PlantUML de una sola linea. */
export function plantUmlText(text: string): string {
  return text.replace(/\n/g, '\\n');
}

/** Cadena entrecomillada para Graphviz DOT. */
export function dotLabel(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

/**
 * Interpreta la forma `Origen -> Destino: etiqueta`, admitiendo `->`, `-->`,
 * `..>` y `<-` para invertir el sentido.
 */
export interface ParsedEdge {
  from: string;
  to: string;
  label?: string;
  dashed: boolean;
}

const EDGE_RE = /^\s*(.+?)\s*(<--|<-|-->|->|\.\.>|=>)\s*(.+?)\s*(?::\s*(.*))?$/;
const ARROW_IN_KEY = /(<--|<-|-->|->|\.\.>|=>)/;

/**
 * Detecta el mapa de una sola entrada que YAML produce a partir de
 * `- Origen -> Destino: etiqueta`.
 */
export function asArrowShorthand(
  item: unknown,
): { expression: string; label?: string } | undefined {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return undefined;
  const entries = Object.entries(item as Record<string, unknown>);
  if (entries.length !== 1) return undefined;
  const [key, value] = entries[0]!;
  if (!ARROW_IN_KEY.test(key)) return undefined;
  // `from`/`to` explicitos nunca llevan flecha en la clave: no hay ambiguedad.
  if (value !== null && typeof value === 'object') return undefined;
  const label = value === null || value === undefined ? undefined : String(value).trim();
  return label === undefined || label === '' ? { expression: key } : { expression: key, label };
}

export function parseEdgeExpression(expression: string, field: string): ParsedEdge {
  const match = EDGE_RE.exec(expression);
  if (match === null) {
    fail(
      `no se entiende la relacion "${expression}" en ${field}`,
      'formato esperado: "Origen -> Destino: etiqueta"',
    );
  }
  const left = match[1]!.trim();
  const arrow = match[2]!;
  const right = match[3]!.trim();
  const label = match[4]?.trim();
  const reversed = arrow === '<-' || arrow === '<--';
  const dashed = arrow === '-->' || arrow === '<--' || arrow === '..>';

  const edge: ParsedEdge = {
    from: reversed ? right : left,
    to: reversed ? left : right,
    dashed,
  };
  if (label !== undefined && label !== '') edge.label = label;
  return edge;
}

/**
 * Normaliza un item de relacion.
 *
 * Admite tres formas:
 *
 *     - Usuario -> API: Login      (YAML lo entrega como mapa de una entrada)
 *     - "Usuario -> API"           (cadena)
 *     - {from: Usuario, to: API}   (mapa explicito)
 *
 * La primera es la que escribe cualquiera de forma natural, pero YAML la
 * interpreta como `{ "Usuario -> API": "Login" }` por culpa de los dos puntos.
 * Se reconoce ese caso en lugar de exigir comillas.
 */
export function toEdge(item: unknown, field: string): ParsedEdge {
  if (typeof item === 'string') return parseEdgeExpression(item, field);

  const shorthand = asArrowShorthand(item);
  if (shorthand !== undefined) {
    const edge = parseEdgeExpression(shorthand.expression, field);
    if (shorthand.label !== undefined) edge.label = shorthand.label;
    return edge;
  }

  const record = asRecord(item, field);
  const edge: ParsedEdge = {
    from: requireString(record, 'from', field),
    to: requireString(record, 'to', field),
    dashed: record['style'] === 'dashed' || record['dashed'] === true,
  };
  const label = optionalString(record, 'label') ?? optionalString(record, 'text');
  if (label !== undefined) edge.label = label;
  return edge;
}
