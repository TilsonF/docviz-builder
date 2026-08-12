/**
 * Punto de entrada del DSL de alto nivel.
 *
 * El agente que escribe documentacion solo necesita aprender tres vallas:
 *
 *     ```diagram```      intencion visual (secuencia, flujo, arbol, ...)
 *     ```chart```        comparacion o tendencia cuantitativa
 *     ```architecture``` modelo C4
 *
 * DocViz decide el motor. Los lenguajes nativos (`plantuml`, `mermaid`, `d2`,
 * `graphviz`, `vega-lite`, `likec4`) siguen disponibles como via de escape.
 */

import { parse as parseYaml } from 'yaml';
import { DslValidationError } from '../core/errors.js';
import { compileChartType, compileType } from './compile.js';
import { findType, TYPE_CATALOG, typeNames, type TypeSpec } from './catalog.js';
import { asRecord, optionalString } from './util.js';

export const DSL_LANGUAGES = ['diagram', 'chart', 'architecture'] as const;
export type DslLanguage = (typeof DSL_LANGUAGES)[number];

export interface CompiledDsl {
  /** Motor que finalmente dibuja el bloque. */
  rendererType: string;
  source: string;
  title?: string;
  /** Ficha del tipo resuelto, util para diagnosticos. */
  spec?: TypeSpec;
}

/** Predicado que indica si un motor esta disponible en el registro actual. */
export type EngineAvailability = (engine: string) => boolean;

const ALL_AVAILABLE: EngineAvailability = () => true;

export function isDslLanguage(lang: string): lang is DslLanguage {
  return (DSL_LANGUAGES as readonly string[]).includes(lang);
}

/** Catalogo legible, usado por `docviz types` y por las herramientas MCP. */
export function dslCatalog(): Record<DslLanguage, string[]> {
  return {
    diagram: typeNames('diagram'),
    chart: typeNames('chart'),
    architecture: typeNames('architecture'),
  };
}

/** Catalogo completo con los metadatos de cada tipo. */
export function dslCatalogDetailed(): readonly TypeSpec[] {
  return TYPE_CATALOG;
}

export function compileDsl(
  lang: string,
  source: string,
  isAvailable: EngineAvailability = ALL_AVAILABLE,
): CompiledDsl {
  if (!isDslLanguage(lang)) {
    throw new DslValidationError(
      `"${lang}" no es un lenguaje de DSL de DocViz`,
      `lenguajes validos: ${DSL_LANGUAGES.join(', ')}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(source);
  } catch (err) {
    throw new DslValidationError(
      `el bloque ${lang} no es YAML valido`,
      err instanceof Error ? err.message : String(err),
    );
  }
  if (parsed === null || parsed === undefined) {
    throw new DslValidationError(`el bloque ${lang} esta vacio`, exampleFor(lang));
  }

  const doc = asRecord(parsed, lang);
  const title = optionalString(doc, 'title');
  const declared = optionalString(doc, 'type');

  if (declared === undefined && lang !== 'architecture') {
    throw new DslValidationError(`el bloque ${lang} necesita un campo "type"`, exampleFor(lang));
  }
  const typeName = declared ?? 'c4-context';

  // El tipo debe pertenecer a la valla en la que se declaro: escribir un
  // `type: bar` dentro de un bloque `diagram` es un error del autor, no una
  // conversion silenciosa.
  const spec = findType(typeName);
  if (spec !== undefined && spec.lang !== lang) {
    throw new DslValidationError(
      `el tipo "${typeName}" pertenece a la valla \`${spec.lang}\`, no a \`${lang}\``,
      `escribe el bloque como \`\`\`${spec.lang} en lugar de \`\`\`${lang}`,
    );
  }

  const compiled =
    lang === 'chart' ? compileChartType(doc, typeName) : compileType(doc, typeName, isAvailable);

  const result: CompiledDsl = {
    rendererType: compiled.engine,
    source: compiled.source,
    spec: compiled.spec,
  };
  if (title !== undefined) result.title = title;
  return result;
}

function exampleFor(lang: DslLanguage): string {
  const spec = findType(lang === 'diagram' ? 'sequence' : lang === 'chart' ? 'bar' : 'c4-context');
  return spec !== undefined ? `ejemplo:\n${spec.example}` : '';
}

export { compileType, compileChartType, typesForEngine, compiledTypeNames, compilerEngines } from './compile.js';
export { TYPE_CATALOG, findType, typeNames, typesFor, allTypeNames } from './catalog.js';
export type { TypeSpec, DslLang } from './catalog.js';
export { compileChartOfType } from './chart.js';
export { compileArchitecture, architectureLikeC4 } from './architecture.js';

/** Nombres de tipo de `diagram`, en orden alfabetico. */
export function diagramTypeNames(): string[] {
  return typeNames('diagram');
}

/** Nombres de tipo de `chart`, en orden alfabetico. */
export function chartTypeNames(): string[] {
  return typeNames('chart');
}
