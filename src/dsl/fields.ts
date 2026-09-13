/**
 * Deteccion de campos que el tipo no usa.
 *
 * Un bloque puede compilar y aun asi no decir lo que el autor queria: escribir
 * `steps:` donde el tipo espera `flow:` no rompe nada, simplemente ignora el
 * contenido. El silencio es peor que el error, porque el agente da por buena una
 * documentacion incompleta.
 *
 * La lista de campos validos no se mantiene a mano —serian 57 listas que se
 * desincronizarian— sino que se deduce de dos fuentes que ya existen y ya estan
 * probadas:
 *
 *   1. las claves del ejemplo canonico del catalogo, que compila tal cual;
 *   2. las claves que el compilador realmente leyo, observadas con un Proxy.
 *
 * Un campo que no esta en ninguna de las dos no hizo nada. Eso es un hecho, no
 * una heuristica, y por eso se puede reportar sin miedo a falsos positivos.
 */

import { parse as parseYaml } from 'yaml';
import { ERROR_CODES, type ErrorCode } from '../core/errors.js';
import type { TypeSpec } from './catalog.js';

/** Campos que admite cualquier bloque, sea cual sea su tipo. */
const UNIVERSAL_FIELDS: readonly string[] = ['type', 'title'];

/** Distancia maxima para considerar que un campo es una errata de otro. */
const MAX_TYPO_DISTANCE = 2;

export interface FieldWarning {
  readonly code: ErrorCode;
  readonly field: string;
  readonly message: string;
  /** Campo valido mas parecido, si la distancia sugiere una errata. */
  readonly suggestion?: string;
}

/** Un mapa observado: el original, lo que se leyo de el y de donde viene. */
interface RegistroObservado {
  ruta: string;
  objetivo: Record<string, unknown>;
  accessed: Set<string>;
  enumerated: boolean;
}

export interface FieldAccessTracker<T extends object> {
  /** El documento envuelto: pasalo al compilador en lugar del original. */
  readonly doc: T;
  /** Claves leidas hasta ahora. */
  readonly accessed: ReadonlySet<string>;
  /**
   * `true` si alguien enumero el mapa completo (`Object.keys`, `for...in`,
   * desestructuracion con resto). En ese caso no se puede saber que claves se
   * usaron de verdad y el analisis se abstiene.
   */
  enumerated(): boolean;
  /** Mapas anidados observados durante la compilacion. */
  readonly anidados: readonly RegistroObservado[];
}

/**
 * Observador activo durante una compilacion.
 *
 * Los mapas anidados no se pueden envolver desde fuera: aparecen a medida que
 * el compilador desciende por el documento, y quien los desenvuelve es
 * `asRecord`. Esta variable es como `asRecord` sabe que hay alguien mirando.
 */
let observadorActivo: { registrar(valor: Record<string, unknown>, ruta: string): Record<string, unknown> } | undefined;

/** Envuelve un mapa anidado si hay una compilacion observada en curso. */
export function observarAnidado(valor: Record<string, unknown>, ruta: string): Record<string, unknown> {
  return observadorActivo === undefined ? valor : observadorActivo.registrar(valor, ruta);
}

/**
 * Envuelve el documento para observar que claves lee el compilador.
 *
 * No altera el valor devuelto por ninguna clave: el compilador se comporta
 * exactamente igual con el Proxy que sin el.
 */
export function trackFieldAccess<T extends object>(doc: T): FieldAccessTracker<T> {
  const anidados: RegistroObservado[] = [];

  const envolver = <O extends object>(objetivo: O, registro: RegistroObservado | undefined): O =>
    new Proxy(objetivo, {
      get(t, prop, receiver) {
        if (typeof prop === 'string' && registro !== undefined) registro.accessed.add(prop);
        return Reflect.get(t, prop, receiver);
      },
      has(t, prop) {
        if (typeof prop === 'string' && registro !== undefined) registro.accessed.add(prop);
        return Reflect.has(t, prop);
      },
      ownKeys(t) {
        if (registro !== undefined) registro.enumerated = true;
        return Reflect.ownKeys(t);
      },
    }) as O;

  const raiz: RegistroObservado = {
    ruta: '',
    objetivo: doc as Record<string, unknown>,
    accessed: new Set(),
    enumerated: false,
  };

  const observador = {
    registrar(valor: Record<string, unknown>, ruta: string): Record<string, unknown> {
      // El mismo objeto puede llegar dos veces: se observa una sola.
      const previo = anidados.find((r) => r.objetivo === valor);
      if (previo !== undefined) return envolver(valor, previo);
      const registro: RegistroObservado = { ruta, objetivo: valor, accessed: new Set(), enumerated: false };
      anidados.push(registro);
      return envolver(valor, registro);
    },
  };

  observadorActivo = observador;
  return {
    doc: envolver(doc, raiz),
    accessed: raiz.accessed,
    enumerated: () => raiz.enumerated,
    anidados,
  };
}

/** Cierra la observacion. Siempre en un `finally`: si no, se filtra a la siguiente. */
export function stopTracking(): void {
  observadorActivo = undefined;
}

const knownCache = new Map<string, ReadonlySet<string>>();

/**
 * Campos que el tipo declara en su ejemplo canonico, mas los universales.
 *
 * El ejemplo es la fuente correcta porque una prueba de integracion lo dibuja
 * de verdad con su motor: si dejara de ser valido, el catalogo fallaria antes
 * que esta funcion.
 */
export function knownFields(spec: TypeSpec): ReadonlySet<string> {
  const cached = knownCache.get(spec.type);
  if (cached !== undefined) return cached;

  const fields = new Set<string>(UNIVERSAL_FIELDS);
  try {
    const parsed: unknown = parseYaml(spec.example);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const key of Object.keys(parsed)) fields.add(key);
    }
  } catch {
    // Un ejemplo que no parsea es un fallo del catalogo, no de este analisis:
    // se queda con los universales y las pruebas del catalogo lo denuncian.
  }
  knownCache.set(spec.type, fields);
  return fields;
}

/**
 * Campos presentes en el bloque que ni el ejemplo declara ni el compilador leyo.
 *
 * Devuelve avisos, nunca errores: el bloque compila, solo que una parte de lo
 * que escribio el autor no llego al dibujo.
 */
export function unknownFields(
  doc: Record<string, unknown>,
  spec: TypeSpec | undefined,
  tracker?: FieldAccessTracker<object>,
): FieldWarning[] {
  if (spec === undefined) return [];
  if (tracker !== undefined && tracker.enumerated()) return [];

  const known = knownFields(spec);
  const accessed = tracker?.accessed;
  const warnings: FieldWarning[] = [];

  for (const field of Object.keys(doc)) {
    if (known.has(field)) continue;
    if (accessed !== undefined && accessed.has(field)) continue;

    const suggestion = nearestField(field, known);
    const message =
      suggestion !== undefined
        ? `el campo "${field}" no existe en el tipo ${spec.type}; quiza querias "${suggestion}"`
        : `el campo "${field}" no existe en el tipo ${spec.type} y se ha ignorado`;

    const warning: FieldWarning = {
      code: ERROR_CODES.DSL_FIELD_UNKNOWN,
      field,
      message,
      ...(suggestion !== undefined ? { suggestion } : {}),
    };
    warnings.push(warning);
  }

  return warnings;
}

/**
 * Campos sin usar en los mapas anidados del documento.
 *
 * Aqui no hay ejemplo canonico contra el que comparar —no se sabe que posicion
 * del ejemplo corresponde a cada mapa—, asi que el criterio es solo uno: si el
 * compilador no leyo la clave, esa clave no hizo nada. Sigue siendo un hecho.
 */
export function unknownNestedFields(tracker: FieldAccessTracker<object>): FieldWarning[] {
  const warnings: FieldWarning[] = [];
  for (const registro of tracker.anidados) {
    if (registro.enumerated) continue;
    for (const field of Object.keys(registro.objetivo)) {
      if (registro.accessed.has(field)) continue;
      const hermanas = [...registro.accessed].filter((k) => k in registro.objetivo);
      const suggestion = nearestField(field, new Set(hermanas));
      const donde = registro.ruta === '' ? '' : ` en ${registro.ruta}`;
      warnings.push({
        code: ERROR_CODES.DSL_FIELD_UNKNOWN,
        field,
        message:
          suggestion !== undefined
            ? `el campo "${field}"${donde} no se usa; quiza querias "${suggestion}"`
            : `el campo "${field}"${donde} no se usa y se ha ignorado`,
        ...(suggestion !== undefined ? { suggestion } : {}),
      });
    }
  }
  return warnings;
}

/**
 * Convierte los avisos en el detalle que acompana a un error ya producido.
 *
 * Cuando el bloque falla, la causa suele ser justo la errata: reportar solo
 * "falta participants" obliga al agente a adivinar que `particpants` sobraba.
 */
export function describeFieldWarnings(warnings: readonly FieldWarning[], spec: TypeSpec | undefined): string {
  if (warnings.length === 0) return '';
  const lines = warnings.map((w) => `  - ${w.message}`);
  // "del ejemplo" y no "de sequence": el ejemplo es el esqueleto minimo, y un
  // tipo puede admitir campos opcionales que no aparecen en el. Prometer una
  // lista cerrada seria mentir.
  const campos =
    spec === undefined ? '' : `\ncampos del ejemplo de ${spec.type}: ${[...knownFields(spec)].sort().join(', ')}`;
  const ficha = spec === undefined ? '' : `\nficha completa: docviz types ${spec.type}`;
  return `campos no reconocidos:\n${lines.join('\n')}${campos}${ficha}`;
}

/** Campo valido mas parecido, si la diferencia es propia de una errata. */
function nearestField(field: string, known: ReadonlySet<string>): string | undefined {
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of known) {
    const distance = editDistance(field, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  // El umbral es relativo ademas de absoluto: en un campo de tres letras, dos
  // ediciones ya son una palabra distinta.
  const limit = Math.min(MAX_TYPO_DISTANCE, Math.floor(field.length / 2));
  return best !== undefined && bestDistance <= limit && bestDistance > 0 ? best : undefined;
}

/** Distancia de Levenshtein con una sola fila de trabajo. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, substitution);
    }
    previous = current;
  }
  return previous[b.length]!;
}
