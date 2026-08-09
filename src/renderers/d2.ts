/**
 * Renderer D2 — build WebAssembly oficial (`@terrastruct/d2`).
 *
 * Local, sin red y sin binario externo. Se compila y se dibuja en el mismo
 * proceso; el `fs` virtual del compilador solo contiene el diagrama en curso,
 * de modo que un `...@archivo` no puede alcanzar el disco real.
 */

import { RenderError } from '../core/errors.js';
import type { DiagramRenderer, OutputFormat, RenderOptions, RenderResult } from '../core/types.js';
import { packageVersion } from '../core/package-version.js';
import { assertFormat, asRenderError, svgResult } from './base.js';

const TYPE = 'd2';
const SUPPORTED: readonly OutputFormat[] = ['svg'];

type D2Instance = {
  compile(input: unknown, options?: unknown): Promise<{ diagram: unknown; renderOptions: unknown }>;
  render(diagram: unknown, options?: unknown): Promise<string>;
};

export interface D2Options {
  /** Motor de layout: `dagre` (por defecto) o `elk`. */
  layout?: 'dagre' | 'elk';
}

export class D2Renderer implements DiagramRenderer {
  readonly type = TYPE;
  readonly defaultFormat: OutputFormat = 'svg';
  readonly supportedFormats = SUPPORTED;

  private readonly layout: 'dagre' | 'elk';
  private instancePromise?: Promise<D2Instance>;
  private cachedVersion?: string;

  constructor(options: D2Options = {}) {
    this.layout = options.layout ?? 'dagre';
  }

  private async instance(): Promise<D2Instance> {
    this.instancePromise ??= (async () => {
      const mod = await import('@terrastruct/d2');
      return new mod.D2() as unknown as D2Instance;
    })();
    return this.instancePromise;
  }

  async version(): Promise<string> {
    if (this.cachedVersion !== undefined) return this.cachedVersion;
    this.cachedVersion = `d2-${packageVersion('@terrastruct/d2')}-${this.layout}`;
    return this.cachedVersion;
  }

  async render(source: string, options: RenderOptions): Promise<RenderResult> {
    assertFormat(TYPE, options.format, SUPPORTED);
    if (source.trim() === '') {
      throw new RenderError(TYPE, 'el diagrama D2 esta vacio');
    }
    const d2 = await this.instance();
    const { theme } = options;

    let svg: string;
    try {
      const compiled = await d2.compile(
        { fs: { index: source }, inputPath: 'index', options: { layout: this.layout } },
        undefined,
      );
      svg = await d2.render(compiled.diagram, {
        ...(compiled.renderOptions as Record<string, unknown>),
        themeID: theme.d2.themeID,
        darkThemeID: theme.d2.darkThemeID,
        sketch: theme.d2.sketch,
        pad: theme.d2.pad,
        center: true,
        // Sin `scale: 1` el SVG sale con `width`/`height` ajustados a pantalla,
        // lo que en un `<img>` de Markdown produce una imagen borrosa.
        scale: 1,
        noXMLTag: true,
      });
    } catch (err) {
      throw asRenderError(TYPE, err, 'D2 no pudo compilar el diagrama');
    }

    if (typeof svg !== 'string' || !svg.includes('<svg')) {
      throw new RenderError(TYPE, 'D2 no produjo un SVG valido');
    }
    return svgResult(TYPE, svg, options);
  }

  async dispose(): Promise<void> {
    // El worker WASM de D2 mantiene vivo el event loop del proceso.
    const instance = await this.instancePromise?.catch(() => undefined);
    const disposable = instance as unknown as { worker?: { terminate?: () => void } } | undefined;
    disposable?.worker?.terminate?.();
    this.instancePromise = undefined;
  }
}

export function createD2Renderer(options?: D2Options): DiagramRenderer {
  return new D2Renderer(options);
}
