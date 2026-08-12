/**
 * Construccion del registro de renderers a partir de la configuracion.
 *
 * Es el unico lugar del proyecto donde se decide que motor atiende cada
 * lenguaje. Anadir un renderer nuevo se reduce a registrar una entrada mas.
 */

import path from 'node:path';
import { RendererRegistry } from '../core/registry.js';
import { createD2Renderer } from './d2.js';
import { createGraphvizRenderer } from './graphviz.js';
import { createKrokiRenderer, krokiSupports } from './kroki.js';
import { createLikeC4Renderer } from './likec4.js';
import { createMermaidRenderer } from './mermaid.js';
import { createPlantUmlRenderer } from './plantuml.js';
import { createVegaLiteRenderer } from './vega-lite.js';
import { createSvgbobRenderer } from './svgbob.js';
import { createBpmnRenderer } from './bpmn.js';
import type { DocVizConfig, RendererBackend } from '../config/types.js';
import type { DiagramRenderer } from '../core/types.js';

export { RendererRegistry } from '../core/registry.js';

/** Alias de lenguaje aceptados en la valla de codigo Markdown. */
const ALIASES: Readonly<Record<string, readonly string[]>> = {
  plantuml: ['puml', 'uml'],
  mermaid: ['mmd'],
  d2: [],
  graphviz: ['dot'],
  'vega-lite': ['vegalite', 'vl'],
  likec4: ['c4'],
  svgbob: ['ascii-art'],
  bpmn: [],
};

export function buildRegistry(config: DocVizConfig): RendererRegistry {
  const registry = new RendererRegistry();
  const r = config.renderers;
  const resolve = (engine: { backend?: RendererBackend }): RendererBackend => engine.backend ?? r.backend;

  const withKroki = (type: string, local: () => DiagramRenderer, engine: { backend?: RendererBackend }) => {
    if (resolve(engine) === 'kroki' && krokiSupports(type)) {
      return createKrokiRenderer(type, r.kroki);
    }
    return local();
  };

  if (r.plantuml.enabled) {
    registry.register(
      'plantuml',
      withKroki(
        'plantuml',
        () =>
          createPlantUmlRenderer({
            jarPath: r.plantuml.jar !== undefined ? path.resolve(config.rootDir, r.plantuml.jar) : undefined,
            javaPath: r.plantuml.java,
            maxHeap: r.plantuml.maxHeap,
          }),
        r.plantuml,
      ),
      ALIASES['plantuml'],
    );
  }

  if (r.mermaid.enabled) {
    registry.register(
      'mermaid',
      withKroki('mermaid', () => createMermaidRenderer({ browserPath: r.mermaid.browserPath }), r.mermaid),
      ALIASES['mermaid'],
    );
  }

  if (r.d2.enabled) {
    registry.register(
      'd2',
      withKroki('d2', () => createD2Renderer({ layout: r.d2.layout }), r.d2),
      ALIASES['d2'],
    );
  }

  if (r.graphviz.enabled) {
    registry.register(
      'graphviz',
      withKroki('graphviz', () => createGraphvizRenderer({ engine: r.graphviz.engine }), r.graphviz),
      ALIASES['graphviz'],
    );
  }

  if (r.vegaLite.enabled) {
    registry.register(
      'vega-lite',
      withKroki('vega-lite', () => createVegaLiteRenderer(), r.vegaLite),
      ALIASES['vega-lite'],
    );
  }

  // LikeC4 es un renderer especializado; Kroki no lo cubre.
  if (r.likec4.enabled) {
    registry.register('likec4', createLikeC4Renderer(), ALIASES['likec4']);
  }

  // C4 dibujado con PlantUML: respaldo de LikeC4, sin dependencias adicionales.
  if (r.plantuml.enabled) {
    registry.register(
      'plantuml-c4',
      createPlantUmlRenderer({
        jarPath: r.plantuml.jar !== undefined ? path.resolve(config.rootDir, r.plantuml.jar) : undefined,
        javaPath: r.plantuml.java,
        maxHeap: r.plantuml.maxHeap,
      }),
    );
  }

  if (r.svgbob.enabled) {
    registry.register('svgbob', createSvgbobRenderer(), ALIASES['svgbob']);
  }

  if (r.bpmn.enabled) {
    registry.register('bpmn', createBpmnRenderer({ browserPath: r.bpmn.browserPath }), ALIASES['bpmn']);
  }

  return registry;
}

export { createD2Renderer } from './d2.js';
export { createGraphvizRenderer } from './graphviz.js';
export { createKrokiRenderer, assertSafeKrokiUrl } from './kroki.js';
export { createLikeC4Renderer } from './likec4.js';
export { createMermaidRenderer } from './mermaid.js';
export { createPlantUmlRenderer } from './plantuml.js';
export { createVegaLiteRenderer } from './vega-lite.js';
export { createSvgbobRenderer } from './svgbob.js';
export { createBpmnRenderer } from './bpmn.js';
