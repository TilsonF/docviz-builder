/**
 * Despacho de compiladores: (tipo, motor) -> fuente.
 *
 * Es la union entre el catalogo, que declara la intencion, y los compiladores,
 * que hablan el idioma de cada motor. Un tipo con respaldo aparece aqui dos
 * veces, una por cada motor, porque el respaldo no es reenviar el mismo texto:
 * hay que compilarlo de nuevo.
 */

import { ERROR_CODES } from '../core/errors.js';
import { fail } from './util.js';
import { findType, TYPE_CATALOG, type TypeSpec } from './catalog.js';
import {
  activityDiagram,
  beforeAfter,
  capabilityMap,
  classDiagram,
  dependencyGraph,
  flowchart,
  gantt,
  matrix2x2,
  operatingModel,
  pillars,
  roadmap,
  sequence,
  stateDiagram,
  tree,
  valueChain,
} from './diagram.js';
import {
  componentDiagram,
  deployment,
  entityRelationship,
  jsonTree,
  plantUmlGantt,
  plantUmlMindmap,
  useCase,
  wireframe,
  workBreakdown,
  yamlTree,
} from './diagram-technical.js';
import {
  block,
  gitGraph,
  journey,
  kanban,
  mindmap,
  quadrant,
  radar,
  sankey,
  treemap,
} from './diagram-product.js';
import { asciiArt, bpmn } from './diagram-bpmn.js';
import { architectureC4, d2Flow, mermaidErd, mermaidTimeline, vegaQuadrant } from './fallbacks.js';
import {
  d2Activity,
  d2Block,
  d2Class,
  d2Component,
  d2Deployment,
  d2Journey,
  d2Kanban,
  d2Sequence,
  d2State,
  d2UseCase,
  d2Wbs,
} from './fallbacks-d2.js';
import { architectureLikeC4 } from './architecture.js';
import { compileChartOfType } from './chart.js';

type Compiler = (doc: Record<string, unknown>) => string;

/**
 * Compiladores por tipo y motor.
 *
 * El motor listado como `engine` en el catalogo debe existir aqui; una prueba
 * comprueba que catalogo y compiladores no se desincronicen.
 */
const COMPILERS: Readonly<Record<string, Readonly<Record<string, Compiler>>>> = {
  // UML
  sequence: { plantuml: sequence, d2: d2Sequence },
  class: { plantuml: classDiagram, d2: d2Class },
  state: { plantuml: stateDiagram, d2: d2State },
  activity: { plantuml: activityDiagram, d2: d2Activity },
  erd: { plantuml: entityRelationship, mermaid: mermaidErd },
  'use-case': { plantuml: useCase, d2: d2UseCase },
  component: { plantuml: componentDiagram, d2: d2Component },
  deployment: { plantuml: deployment, d2: d2Deployment },
  wireframe: { plantuml: wireframe },
  json: { plantuml: jsonTree },
  yaml: { plantuml: yamlTree },
  wbs: { plantuml: workBreakdown, d2: d2Wbs },

  // Flujos, tiempo y producto
  flow: { mermaid: flowchart, d2: d2Flow },
  gantt: { mermaid: gantt, plantuml: plantUmlGantt },
  journey: { mermaid: journey, d2: d2Journey },
  'git-graph': { mermaid: gitGraph },
  kanban: { mermaid: kanban, d2: d2Kanban },
  quadrant: { mermaid: quadrant, 'vega-lite': vegaQuadrant },
  sankey: { mermaid: sankey },
  treemap: { mermaid: treemap },
  radar: { mermaid: radar },
  mindmap: { mermaid: mindmap, plantuml: plantUmlMindmap },
  block: { mermaid: block, d2: d2Block },

  // Ejecutivos y dependencias
  'strategy-tree': { d2: tree },
  'issue-tree': { d2: tree },
  'decision-tree': { d2: tree },
  'strategy-pillars': { d2: pillars },
  'capability-map': { d2: capabilityMap },
  'operating-model': { d2: operatingModel },
  'value-chain': { d2: valueChain },
  'before-after': { d2: beforeAfter },
  'matrix-2x2': { d2: matrix2x2 },
  timeline: { d2: roadmap, mermaid: mermaidTimeline },
  roadmap: { d2: roadmap },
  'dependency-map': { graphviz: dependencyGraph },

  // Notaciones especiales
  bpmn: { bpmn },
  ascii: { svgbob: asciiArt },

  // Arquitectura
  'c4-context': { likec4: architectureLikeC4, 'plantuml-c4': architectureC4 },
  'c4-container': { likec4: architectureLikeC4, 'plantuml-c4': architectureC4 },
  'c4-component': { likec4: architectureLikeC4, 'plantuml-c4': architectureC4 },
};

export interface ResolvedCompilation {
  /** Motor que finalmente dibuja: puede ser el preferido o un respaldo. */
  engine: string;
  source: string;
  spec: TypeSpec;
}

/**
 * Decide que motor usar y compila.
 *
 * `isAvailable` permite al llamador informar de que motores estan registrados;
 * si el preferido no lo esta, se prueba con los respaldos declarados.
 */
export function compileType(
  doc: Record<string, unknown>,
  typeName: string,
  isAvailable: (engine: string) => boolean,
): ResolvedCompilation {
  const spec = findType(typeName);
  if (spec === undefined) {
    fail(
      `el tipo "${typeName}" no existe`,
      `tipos disponibles: ${TYPE_CATALOG.map((s) => s.type).sort().join(', ')}`,
      ERROR_CODES.DSL_TYPE,
    );
  }

  const byEngine = COMPILERS[spec.type];
  if (byEngine === undefined) {
    fail(`el tipo "${spec.type}" esta en el catalogo pero no tiene compilador`);
  }

  const candidates = [spec.engine, ...(spec.fallbacks ?? [])];
  const usable = candidates.filter((engine) => byEngine[engine] !== undefined);
  const chosen = usable.find((engine) => isAvailable(engine));

  if (chosen === undefined) {
    const alternatives = usable.length > 1 ? ` (respaldos: ${usable.slice(1).join(', ')})` : '';
    fail(
      `el tipo "${spec.type}" necesita el motor ${spec.engine}${alternatives}, y no hay ninguno disponible`,
      'habilita ese renderer en docviz.config.yaml o instala lo que necesita: Java para PlantUML, un Chromium para Mermaid y BPMN',
      ERROR_CODES.RENDERER_UNAVAILABLE,
    );
  }

  return { engine: chosen, source: byEngine[chosen]!(doc), spec };
}

/** Compila un grafico, que siempre se resuelve con Vega-Lite. */
export function compileChartType(doc: Record<string, unknown>, typeName: string): ResolvedCompilation {
  const spec = findType(typeName);
  if (spec === undefined || spec.lang !== 'chart') {
    fail(
      `el tipo de grafico "${typeName}" no existe`,
      `tipos disponibles: ${TYPE_CATALOG.filter((s) => s.lang === 'chart').map((s) => s.type).sort().join(', ')}`,
      ERROR_CODES.DSL_TYPE,
    );
  }
  return { engine: spec.engine, source: compileChartOfType(doc, spec.type), spec };
}

/** Tipos que tienen compilador para el motor indicado. */
export function typesForEngine(engine: string): string[] {
  return Object.entries(COMPILERS)
    .filter(([, byEngine]) => byEngine[engine] !== undefined)
    .map(([type]) => type)
    .sort();
}

/** Nombres de tipo que tienen compilador, para comprobar la sincronia. */
export function compiledTypeNames(): string[] {
  return Object.keys(COMPILERS).sort();
}

/** Motores declarados en el mapa de compiladores. */
export function compilerEngines(type: string): string[] {
  return Object.keys(COMPILERS[type] ?? {});
}
