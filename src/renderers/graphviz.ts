/**
 * Renderer Graphviz — WebAssembly local (`@hpcc-js/wasm-graphviz`).
 *
 * No requiere binario del sistema ni red. El modulo WASM se carga una sola vez
 * y se reutiliza durante todo el build.
 */

import { RenderError } from '../core/errors.js';
import type { DiagramRenderer, OutputFormat, RenderOptions, RenderResult } from '../core/types.js';
import { packageVersion } from '../core/package-version.js';
import { assertFormat, asRenderError, svgResult } from './base.js';
import type { Theme } from '../themes/types.js';

const TYPE = 'graphviz';
const SUPPORTED: readonly OutputFormat[] = ['svg'];

type GraphvizModule = { layout(source: string, format: string, engine: string): string };

export interface GraphvizOptions {
  /** Motor de layout: dot, neato, fdp, circo, twopi, osage, patchwork. */
  engine?: string;
}

const VALID_ENGINES = new Set(['dot', 'neato', 'fdp', 'sfdp', 'circo', 'twopi', 'osage', 'patchwork']);

export class GraphvizRenderer implements DiagramRenderer {
  readonly type = TYPE;
  readonly defaultFormat: OutputFormat = 'svg';
  readonly supportedFormats = SUPPORTED;

  private readonly engine: string;
  private modulePromise?: Promise<GraphvizModule>;
  private cachedVersion?: string;

  constructor(options: GraphvizOptions = {}) {
    const engine = options.engine ?? 'dot';
    if (!VALID_ENGINES.has(engine)) {
      throw new RenderError(
        TYPE,
        `motor de layout desconocido: ${engine}`,
        `motores validos: ${[...VALID_ENGINES].join(', ')}`,
      );
    }
    this.engine = engine;
  }

  private async load(): Promise<GraphvizModule> {
    this.modulePromise ??= (async () => {
      const { Graphviz } = await import('@hpcc-js/wasm-graphviz');
      return (await Graphviz.load()) as unknown as GraphvizModule;
    })();
    return this.modulePromise;
  }

  async version(): Promise<string> {
    if (this.cachedVersion !== undefined) return this.cachedVersion;
    const graphviz = await this.load();
    // El propio WASM expone su version; si no, se usa la del paquete npm.
    const raw = (graphviz as unknown as { version?: () => string }).version?.();
    const version = typeof raw === 'string' && raw !== '' ? raw : packageVersion('@hpcc-js/wasm-graphviz');
    this.cachedVersion = `graphviz-${version}-${this.engine}`;
    return this.cachedVersion;
  }

  async render(source: string, options: RenderOptions): Promise<RenderResult> {
    assertFormat(TYPE, options.format, SUPPORTED);
    const graphviz = await this.load();
    const themed = applyTheme(source, options.theme);
    let svg: string;
    try {
      svg = graphviz.layout(themed, 'svg', this.engine);
    } catch (err) {
      throw asRenderError(TYPE, err, 'Graphviz no pudo procesar el grafo (revisa la sintaxis DOT)');
    }
    if (typeof svg !== 'string' || !svg.includes('<svg')) {
      throw new RenderError(TYPE, 'Graphviz no produjo un SVG valido');
    }
    return svgResult(TYPE, svg, options);
  }
}

/**
 * Inserta los atributos por defecto del tema dentro del cuerpo del grafo.
 *
 * Se insertan al principio del bloque para que cualquier atributo escrito por
 * el autor los sobrescriba.
 */
export function applyTheme(source: string, theme: Theme): string {
  const trimmed = source.trim();
  const openBrace = trimmed.indexOf('{');
  if (openBrace < 0) {
    throw new RenderError(
      TYPE,
      'el grafo no tiene cuerpo: falta la llave de apertura',
      'ejemplo minimo: digraph G { A -> B; }',
    );
  }
  const defaults = [
    `  graph [${attrs(theme.graphviz.graph)}];`,
    `  node [${attrs(theme.graphviz.node)}];`,
    `  edge [${attrs(theme.graphviz.edge)}];`,
  ].join('\n');
  return `${trimmed.slice(0, openBrace + 1)}\n${defaults}\n${trimmed.slice(openBrace + 1)}`;
}

function attrs(map: Readonly<Record<string, string>>): string {
  return Object.entries(map)
    .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
    .join(', ');
}

export function createGraphvizRenderer(options?: GraphvizOptions): DiagramRenderer {
  return new GraphvizRenderer(options);
}
