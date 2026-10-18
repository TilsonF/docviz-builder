/**
 * Utilidades de validacion del DSL declarativo.
 *
 * Los mensajes son la interfaz real del DSL para un agente: deben decir que
 * campo falla, que se esperaba y como se escribe bien.
 */

import { t } from '../core/idioma.js';
import { DslValidationError, ERROR_CODES, type ErrorCode } from '../core/errors.js';
import { observarAnidado } from './fields.js';

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
    fail(
      t(`${field} debe ser un mapa`, `${field} must be a map`),
      t(`valor recibido: ${preview(value)}`, `received: ${preview(value)}`),
      ERROR_CODES.DSL_FIELD_TYPE,
    );
  }
  // Todo mapa anidado se entrega observado: es la unica forma de saber si el
  // compilador llego a leer sus claves o si el autor escribio en el vacio.
  return observarAnidado(value as Record<string, unknown>, field);
}

/**
 * Texto obligatorio.
 *
 * Acepta numeros y booleanos porque YAML los convierte sin avisar: en
 * `- name: 2025` el valor llega como numero, y rechazarlo obligaria al autor a
 * entrecomillar cualquier etiqueta que parezca un dato.
 */
/**
 * Campos de hoja en espanol, en una sola tabla.
 *
 * El DSL ya aceptaba espanol en los campos CONTENEDOR —`datos`, `valores`,
 * `ejes`, `secciones`, `entidades`, `filas`…— pero cada alias estaba escrito a
 * mano dentro del compilador que lo recordo, y ninguno alcanzaba a los campos
 * de dentro. El resultado era arbitrario: `fecha` valia en un tipo, `etiqueta`
 * no valia en ninguno, y `valor` colaba solo porque `docviz fix` lo confunde
 * con una errata de `value`. Aqui estan los de hoja, una vez, para los 64.
 *
 * Reglas al ampliarla:
 *
 *   - El canonico SIEMPRE gana. El alias solo se mira si el campo ingles no
 *     esta, asi que un tipo que use la palabra para otra cosa no se rompe.
 *   - Fuera `no`, que es un campo canonico de las puertas de decision.
 *   - Fuera `tipo`. Quien lo escribe quiere decir `type`, que es el
 *     discriminador y lo lee el escaner antes de compilar; darle otro
 *     significado aqui esconderia el error en vez de señalarlo.
 */
const ALIAS_ES: Readonly<Record<string, string>> = {
  etiqueta: 'label',
  valor: 'value',
  meta: 'target',
  fecha: 'date',
  nombre: 'name',
  inicio: 'start',
  fin: 'end',
  duracion: 'duration',
  orden: 'sort',
  unidad: 'unit',
  descripcion: 'description',
  tecnologia: 'technology',
  titulo: 'title',
  desde: 'from',
  hasta: 'to',
  clase: 'kind',
  padre: 'parent',
  estado: 'status',
  identificador: 'id',
  cantidad: 'value',
  objetivo: 'target',
};

/** Canonico -> alias que lo nombran. Se construye una vez. */
const ALIAS_DE = ((): ReadonlyMap<string, readonly string[]> => {
  const m = new Map<string, string[]>();
  for (const [es, en] of Object.entries(ALIAS_ES)) {
    const lista = m.get(en);
    if (lista === undefined) m.set(en, [es]);
    else lista.push(es);
  }
  return m;
})();

/** Campo canonico que nombra un alias, si lo es. */
export function canonicosDe(alias: string): readonly string[] {
  const canonico = ALIAS_ES[alias];
  return canonico !== undefined ? [canonico] : [];
}

/** Alias en espanol que nombran un campo canonico. */
export function aliasesDe(canonical: string): readonly string[] {
  return ALIAS_DE.get(canonical) ?? [];
}

/**
 * Lee un campo por su nombre canonico o por su alias en espanol.
 *
 * Se lee con `record[...]` y no con `in` a proposito: el rastreador de accesos
 * que detecta campos sin usar intercepta la lectura, asi que el alias queda
 * marcado como usado y no se reporta como ignorado.
 */
export function leerCampo(record: Record<string, unknown>, key: string): unknown {
  const propio = record[key];
  if (propio !== undefined && propio !== null) return propio;
  for (const alias of ALIAS_DE.get(key) ?? []) {
    const valor = record[alias];
    if (valor !== undefined && valor !== null) return valor;
  }
  return propio;
}

export function requireString(record: Record<string, unknown>, key: string, field: string): string {
  const value = leerCampo(record, key);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'string' || value.trim() === '') {
    fail(
      t(`falta el campo obligatorio "${key}" en ${field}`, `missing required field "${key}" in ${field}`),
      t(`valor recibido: ${preview(value)}`, `received: ${preview(value)}`),
      ERROR_CODES.DSL_FIELD_MISSING,
    );
  }
  return value.trim();
}

export function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = leerCampo(record, key);
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function optionalNumber(record: Record<string, unknown>, key: string, field: string): number | undefined {
  const value = leerCampo(record, key);
  if (value === undefined || value === null) return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    fail(
      t(`${field}.${key} debe ser numerico`, `${field}.${key} must be a number`),
      t(`valor recibido: ${preview(value)}`, `received: ${preview(value)}`),
      ERROR_CODES.DSL_FIELD_TYPE,
    );
  }
  return n;
}

export function requireNumber(record: Record<string, unknown>, key: string, field: string): number {
  const n = optionalNumber(record, key, field);
  if (n === undefined) {
    fail(
      t(
        `falta el campo numerico obligatorio "${key}" en ${field}`,
        `missing required numeric field "${key}" in ${field}`,
      ),
      undefined,
      ERROR_CODES.DSL_FIELD_MISSING,
    );
  }
  return n;
}

export function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(
      t(
        `${field} debe ser una lista con al menos un elemento`,
        `${field} must be a list with at least one item`,
      ),
      t(`valor recibido: ${preview(value)}`, `received: ${preview(value)}`),
      ERROR_CODES.DSL_FIELD_MISSING,
    );
  }
  return value;
}

export function optionalArray(value: unknown, field: string): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    fail(
      t(`${field} debe ser una lista`, `${field} must be a list`),
      t(`valor recibido: ${preview(value)}`, `received: ${preview(value)}`),
      ERROR_CODES.DSL_FIELD_TYPE,
    );
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

/**
 * Enlace declarado en un nodo.
 *
 * El SVG que sale de DocViz **ya** puede llevar enlaces: el saneador admite
 * `<a href>` con `http(s)` y con fragmentos, y los motores los emiten. Lo que
 * faltaba era poder declararlos desde el DSL, asi que la capacidad estaba ahi
 * y no se podia alcanzar.
 *
 * Es la unica forma de interactividad que sobrevive al destino real de estos
 * dibujos: un wiki, un repositorio y un PDF no ejecutan JavaScript, pero los
 * tres siguen un enlace. Un nodo puede apuntar a su HU en Azure, a su
 * documento en Outline o a otra figura del mismo documento.
 *
 * Se valida aqui y no se deja para el saneador: un `javascript:` lo quitaria
 * en silencio, y el autor creeria que su enlace funciona.
 */
export function leerEnlace(record: Record<string, unknown>, field: string): string | undefined {
  const bruto = optionalString(record, 'href') ?? optionalString(record, 'link') ?? optionalString(record, 'enlace');
  if (bruto === undefined) return undefined;
  const url = bruto.trim();
  if (url === '') return undefined;
  if (/^(?:https?:\/\/|#|\.{0,2}\/)/i.test(url)) return url;
  fail(
    t(
      `el enlace de ${field} no es una direccion que un visor pueda seguir`,
      `the link on ${field} is not an address a viewer can follow`,
    ),
    t(
      `se admite http(s), un fragmento (#id) o una ruta relativa; se recibio ${JSON.stringify(url)}`,
      `http(s), a fragment (#id) or a relative path are accepted; got ${JSON.stringify(url)}`,
    ),
    ERROR_CODES.DSL_VALUE_NOT_ALLOWED,
  );
}

/** Sufijo de atributos D2 de un nodo con enlace, o cadena vacia. */
export function d2Link(url: string | undefined): string {
  return url !== undefined ? ` { link: ${d2Label(url)} }` : '';
}

/** Propiedad `link` para meter dentro de un bloque D2 que ya esta abierto. */
export function d2LinkProp(url: string | undefined, indent = '  '): string[] {
  return url !== undefined ? [`${indent}link: ${d2Label(url)}`] : [];
}

export interface NodoD2 {
  name: string;
  href?: string;
}

/**
 * Nodo de una lista: su nombre y su enlace, si lo declaro.
 *
 * Es `nameOf` mas el enlace. Un elemento escrito como cadena suelta sigue
 * valiendo, que es la forma corta que usa la mitad del catalogo.
 */
export function nodoD2(raw: unknown, field: string): NodoD2 {
  if (esEscalar(raw)) return { name: textoEscalar(raw, field) };
  const record = asRecord(raw, field);
  const name = requireString(record, 'name', field);
  const href = leerEnlace(record, field);
  return href !== undefined ? { name, href } : { name };
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
  if (!esEscalar(value) && value !== null && value !== undefined) return undefined;
  const label = esEscalar(value) ? String(value).trim() : undefined;
  return label === undefined || label === '' ? { expression: key } : { expression: key, label };
}

/** Un valor que se puede convertir a texto sin perder nada. */
export function esEscalar(value: unknown): value is string | number | boolean | bigint {
  const t = typeof value;
  return t === 'string' || t === 'number' || t === 'boolean' || t === 'bigint';
}

/**
 * Texto de un campo que debe ser un escalar.
 *
 * `String(valor)` sobre un mapa escribe «[object Object]», y en un diagrama eso
 * se dibuja: el bloque compila, la imagen sale, y dice una cosa que nadie
 * escribio. Mejor fallar y decir donde.
 */
export function textoEscalar(value: unknown, field: string): string {
  if (value === null || value === undefined) {
    fail(t(`${field} no puede estar vacio`, `${field} cannot be empty`), undefined, ERROR_CODES.DSL_FIELD_MISSING);
  }
  if (!esEscalar(value)) {
    fail(
      t(`${field} debe ser un texto, no una lista ni un mapa`, `${field} must be text, not a list or a map`),
      t(`valor recibido: ${preview(value)}`, `received: ${preview(value)}`),
      ERROR_CODES.DSL_FIELD_TYPE,
    );
  }
  return String(value);
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
