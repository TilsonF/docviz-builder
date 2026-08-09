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
import { compileArchitecture, ARCHITECTURE_TYPES } from './architecture.js';
import { chartTypeNames, compileChart } from './chart.js';
import { compileDiagram, diagramTypeNames } from './diagram.js';
import { asRecord, optionalString } from './util.js';

export const DSL_LANGUAGES = ['diagram', 'chart', 'architecture'] as const;
export type DslLanguage = (typeof DSL_LANGUAGES)[number];

export interface CompiledDsl {
  rendererType: string;
  source: string;
  title?: string;
}

export function isDslLanguage(lang: string): lang is DslLanguage {
  return (DSL_LANGUAGES as readonly string[]).includes(lang);
}

/** Catalogo legible, usado por `docviz types` y por la herramienta MCP. */
export function dslCatalog(): Record<DslLanguage, string[]> {
  return {
    diagram: diagramTypeNames(),
    chart: chartTypeNames(),
    architecture: [...ARCHITECTURE_TYPES],
  };
}

export function compileDsl(lang: string, source: string): CompiledDsl {
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

  let compiled: { rendererType: string; source: string };
  switch (lang) {
    case 'diagram':
      compiled = compileDiagram(doc);
      break;
    case 'chart':
      compiled = compileChart(doc);
      break;
    case 'architecture':
      compiled = compileArchitecture(doc);
      break;
  }

  const result: CompiledDsl = { rendererType: compiled.rendererType, source: compiled.source };
  if (title !== undefined) result.title = title;
  return result;
}

function exampleFor(lang: DslLanguage): string {
  switch (lang) {
    case 'diagram':
      return [
        'ejemplo:',
        'type: sequence',
        'title: Autenticacion',
        'participants:',
        '  - Usuario',
        '  - API',
        'flow:',
        '  - Usuario -> API: Login',
      ].join('\n');
    case 'chart':
      return [
        'ejemplo:',
        'type: bar',
        'title: Defectos por sprint',
        'data:',
        '  - label: SP1',
        '    value: 42',
      ].join('\n');
    case 'architecture':
      return [
        'ejemplo:',
        'type: c4-context',
        'title: Contexto',
        'elements:',
        '  - id: usuario',
        '    kind: person',
        '    name: Usuario',
        '  - id: core',
        '    kind: system',
        '    name: Core',
        'relations:',
        '  - from: usuario',
        '    to: core',
        '    label: Utiliza',
      ].join('\n');
  }
}

export { compileDiagram, diagramTypeNames } from './diagram.js';
export { compileChart, chartTypeNames } from './chart.js';
export { compileArchitecture } from './architecture.js';
