/**
 * Esquemas JSON del DSL y de la configuracion.
 *
 * Escribir un bloque es hoy a ciegas hasta que se ejecuta `check`. Con un
 * esquema, el editor avisa mientras se teclea: autocompleta los campos, marca
 * el que sobra y dice que valores admite `type`.
 *
 * Se derivan del catalogo y de la configuracion por defecto, no se escriben a
 * mano: un esquema que hay que mantener en paralelo se desfasa el mismo dia que
 * se anade un tipo, y entonces enganya en lugar de ayudar.
 */

import { parse as parseYaml } from 'yaml';
import { TYPE_CATALOG, type DslLang, type TypeSpec } from './catalog.js';
import { knownFields } from './fields.js';

const BORRADOR = 'https://json-schema.org/draft/2020-12/schema';

/** Las dos formas de escribir una relacion en el DSL. */
const FLECHAS = /(<--|<-|-->|->|\.\.>|=>)/;
const esFlecha = (clave: string): boolean => FLECHAS.test(clave);

const FORMA_ARISTA: Record<string, unknown> = {
  description: 'Admite `Origen -> Destino: etiqueta` o un mapa con `from`, `to` y `label`.',
  anyOf: [
    { type: 'string' },
    { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, label: { type: 'string' } } },
  ],
};

/**
 * Tipo JSON de un valor del ejemplo, para describir cada campo.
 *
 * Las listas se miran **enteras**, no por su primer elemento. Varios tipos las
 * tienen heterogeneas a proposito —el `flow` de `activity` mezcla pasos sueltos
 * con decisiones, y las ramas de un arbol admiten `- Texto` o `- {name: ...}`—,
 * asi que deducir la forma del primero describiria mal justo los tipos mas
 * expresivos del catalogo.
 */
function formaDe(valor: unknown): Record<string, unknown> {
  if (Array.isArray(valor)) {
    if (valor.length === 0) return { type: 'array' };
    const formas = unificar(valor.map(formaDe));
    return { type: 'array', items: formas.length === 1 ? formas[0]! : { anyOf: formas } };
  }
  if (valor !== null && typeof valor === 'object') {
    const claves = Object.keys(valor as Record<string, unknown>);
    // `- Usuario -> API: Login` es un **mapa** en YAML, no un texto: el ejemplo
    // llega con la flecha convertida en clave. Describirlo tal cual pondria
    // "Usuario -> API" como si fuera un campo del tipo, que es lo contrario de
    // ayudar. La forma real admite las dos escrituras.
    if (claves.length > 0 && claves.every(esFlecha)) return FORMA_ARISTA;

    const propiedades: Record<string, unknown> = {};
    for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) propiedades[clave] = formaDe(v);
    // Los mapas anidados quedan abiertos: el ejemplo canonico es el minimo, no
    // la lista completa de lo que admite cada elemento.
    return { type: 'object', properties: propiedades };
  }
  if (typeof valor === 'number') return { type: 'number' };
  if (typeof valor === 'boolean') return { type: 'boolean' };
  return { type: 'string' };
}

/**
 * Reduce varias formas observadas a las minimas necesarias.
 *
 * Dos objetos se funden en uno con la union de sus propiedades —es mas util
 * para autocompletar que ofrecer dos alternativas casi iguales— y lo que no es
 * objeto se agrupa por su tipo.
 */
function unificar(formas: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  const objetos = formas.filter((f) => f['type'] === 'object');
  const resto = formas.filter((f) => f['type'] !== 'object');

  const salida: Record<string, unknown>[] = [];
  if (objetos.length > 0) {
    const propiedades: Record<string, unknown> = {};
    for (const obj of objetos) {
      for (const [clave, forma] of Object.entries((obj['properties'] ?? {}) as Record<string, unknown>)) {
        propiedades[clave] ??= forma;
      }
    }
    salida.push({ type: 'object', properties: propiedades });
  }
  for (const forma of resto) {
    if (!salida.some((s) => s['type'] === forma['type'])) salida.push(forma);
  }
  return salida;
}

/** Campos que el ejemplo del tipo declara, con la forma que tienen alli. */
function propiedadesDe(spec: TypeSpec): Record<string, unknown> {
  let ejemplo: unknown;
  try {
    ejemplo = parseYaml(spec.example);
  } catch {
    ejemplo = undefined;
  }
  const propiedades: Record<string, unknown> = {};
  if (ejemplo !== null && typeof ejemplo === 'object' && !Array.isArray(ejemplo)) {
    for (const [clave, valor] of Object.entries(ejemplo as Record<string, unknown>)) {
      if (clave === 'type' || clave === 'title') continue;
      propiedades[clave] = formaDe(valor);
    }
  }
  // Los campos de la valla —`dataFile`, `model`…— no salen del ejemplo pero se
  // admiten igual, asi que el editor tiene que conocerlos.
  for (const campo of knownFields(spec)) {
    if (campo === 'type' || campo === 'title' || propiedades[campo] !== undefined) continue;
    propiedades[campo] = campo === 'include' || campo === 'exclude' ? { type: 'array', items: { type: 'string' } } : { type: 'string' };
  }
  return propiedades;
}

/** Esquema de un tipo concreto, con su proposito como descripcion. */
export function esquemaDeTipo(spec: TypeSpec, estricto = false): Record<string, unknown> {
  return {
    title: spec.type,
    description: `${spec.purpose} ${spec.whenToUse}`,
    type: 'object',
    properties: {
      type: { const: spec.type, description: spec.purpose },
      title: { type: 'string', description: 'Titulo del diagrama; tambien es el texto alternativo de la imagen.' },
      ...propiedadesDe(spec),
    },
    required: ['type'],
    // Por defecto el esquema no marca lo que no conoce. El ejemplo canonico es
    // el esqueleto minimo, no la lista completa de lo que admite cada tipo, asi
    // que un editor estricto avisaria de campos legitimos. Quien conoce el
    // catalogo puede pedir lo contrario con `--strict`; el analisis exacto de
    // campos sobrantes lo hace `docviz check`, que si sabe cuales se leyeron.
    ...(estricto ? { additionalProperties: false } : {}),
  };
}

/**
 * Esquema de una valla entera.
 *
 * Se resuelve por el valor de `type`, que es como lo hace el compilador: el
 * editor ensena los campos del tipo declarado y no la union de los 57.
 */
export function esquemaDeValla(lang: DslLang, estricto = false): Record<string, unknown> {
  const specs = TYPE_CATALOG.filter((s) => s.lang === lang);
  return {
    $schema: BORRADOR,
    title: `Bloque \`${lang}\` de DocViz`,
    type: 'object',
    properties: {
      type: {
        description: 'Que quieres explicar. `docviz suggest "..."` lo recomienda a partir de una frase.',
        enum: specs.map((s) => s.type),
        ...(lang === 'architecture' ? { default: 'c4-context' } : {}),
      },
    },
    required: lang === 'architecture' ? [] : ['type'],
    allOf: specs.map((spec) => ({
      if: { properties: { type: { const: spec.type } }, required: ['type'] },
      then: esquemaDeTipo(spec, estricto),
    })),
  };
}

/**
 * Esquema de `docviz.config.yaml`.
 *
 * Se escribe a partir de la configuracion por defecto para que las claves y sus
 * valores sean los que el cargador entiende de verdad.
 */
export function esquemaDeConfiguracion(temas: readonly string[]): Record<string, unknown> {
  const motor = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    type: 'object',
    properties: {
      enabled: { type: 'boolean', default: true },
      backend: { enum: ['local', 'kroki'] },
      ...extra,
    },
  });

  return {
    $schema: BORRADOR,
    title: 'Configuracion de DocViz',
    type: 'object',
    properties: {
      source: { type: 'string', description: 'Directorio de documentos fuente.', default: 'docs-src' },
      output: {
        type: 'object',
        properties: {
          dir: { type: 'string', default: 'docs' },
          assetsDir: { type: 'string', default: 'assets/generated' },
        },
      },
      theme: {
        description: 'Uno de los incluidos por su nombre, o un tema de marca con `base` y `palette`.',
        type: 'object',
        properties: {
          name: { type: 'string', examples: [...temas] },
          base: { enum: [...temas], description: 'Tema del que parte uno de marca.' },
          palette: { type: 'object', description: 'Colores hexadecimales que se sobrescriben.' },
          darkPalette: { type: 'object' },
          fontFamily: { type: 'string' },
        },
      },
      cache: {
        type: 'object',
        properties: { enabled: { type: 'boolean', default: true }, dir: { type: 'string', default: '.docviz-cache' } },
      },
      hash: { type: 'object', properties: { length: { type: 'integer', minimum: 8, maximum: 16, default: 12 } } },
      formats: {
        type: 'object',
        description: 'Formato por motor: `svg` o `png`.',
        additionalProperties: { enum: ['svg', 'png'] },
      },
      renderers: {
        type: 'object',
        properties: {
          backend: { enum: ['local', 'kroki'], default: 'local' },
          timeoutMs: { type: 'integer', minimum: 1, default: 60000 },
          maxOutputBytes: { type: 'integer', minimum: 1 },
          noSandbox: { type: 'boolean', description: 'Desactiva el sandbox de Chromium. Solo hace falta como root.' },
          png: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean', default: true },
              scale: { type: 'number', exclusiveMinimum: 0, maximum: 4, default: 2 },
              scheme: { enum: ['light', 'dark'], default: 'light' },
            },
          },
          plantuml: motor({ jar: { type: 'string' }, java: { type: 'string' }, maxHeap: { type: 'string' } }),
          mermaid: motor({ browserPath: { type: 'string' } }),
          d2: motor({ layout: { enum: ['dagre', 'elk'] } }),
          graphviz: motor({ engine: { type: 'string' } }),
          vegaLite: motor(),
          likec4: motor(),
          svgbob: motor(),
          bpmn: motor({ browserPath: { type: 'string' } }),
          kroki: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              allowRemoteHost: { type: 'boolean' },
              allowPublicService: { type: 'boolean', description: 'El servicio publico kroki.io esta bloqueado por defecto.' },
            },
          },
        },
      },
    },
  };
}
