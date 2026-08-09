/**
 * Renderer LikeC4 — renderer especializado, no pasa por Kroki.
 *
 * Usa la API programatica de `likec4` para parsear el DSL, validar el modelo y
 * calcular el layout (Graphviz WASM), y despues dibuja la vista con el emisor
 * SVG propio (`likec4-svg.ts`) aplicando el tema del proyecto.
 */

import { RenderError } from '../core/errors.js';
import type { DiagramRenderer, OutputFormat, RenderOptions, RenderResult } from '../core/types.js';
import { packageVersion } from '../core/package-version.js';
import { assertFormat, asRenderError, svgResult } from './base.js';
import { renderLikeC4View, type LikeC4View } from './likec4-svg.js';

const TYPE = 'likec4';
const SUPPORTED: readonly OutputFormat[] = ['svg'];

export interface LikeC4Options {
  /** Nombre de la vista a renderizar cuando el modelo define varias. */
  view?: string;
}

interface LikeC4Instance {
  diagrams(): Promise<LikeC4View[]>;
  dispose(): Promise<void>;
}

export class LikeC4Renderer implements DiagramRenderer {
  readonly type = TYPE;
  readonly defaultFormat: OutputFormat = 'svg';
  readonly supportedFormats = SUPPORTED;

  private cachedVersion?: string;

  async version(): Promise<string> {
    if (this.cachedVersion !== undefined) return this.cachedVersion;
    // El emisor SVG es nuestro: su version tambien invalida el cache.
    this.cachedVersion = `likec4-${packageVersion('likec4')}+docviz-svg-1`;
    return this.cachedVersion;
  }

  async render(source: string, options: RenderOptions): Promise<RenderResult> {
    assertFormat(TYPE, options.format, SUPPORTED);
    if (source.trim() === '') throw new RenderError(TYPE, 'el modelo LikeC4 esta vacio');

    let instance: LikeC4Instance | undefined;
    let views: LikeC4View[];
    try {
      const { LikeC4 } = await import('likec4');
      instance = (await LikeC4.fromSource(source, {
        logger: false,
        printErrors: false,
        throwIfInvalid: true,
        graphviz: 'wasm',
      })) as unknown as LikeC4Instance;
      views = await instance.diagrams();
    } catch (err) {
      throw asRenderError(TYPE, err, 'LikeC4 rechazo el modelo');
    } finally {
      // El servicio de lenguaje deja timers vivos si no se libera.
      await instance?.dispose?.().catch(() => undefined);
    }

    if (views.length === 0) {
      throw new RenderError(
        TYPE,
        'el modelo no define ninguna vista',
        'anade un bloque `views { view index { include * } }`',
      );
    }

    const requested = options.title;
    const view = pickView(views, requested);
    const svg = renderLikeC4View(view, options.theme);
    return svgResult(TYPE, svg, options);
  }
}

/**
 * Elige la vista a dibujar: la que coincida por id o titulo con lo pedido, o la
 * primera declarada. Un bloque Markdown produce exactamente una imagen.
 */
function pickView(views: LikeC4View[], requested: string | undefined): LikeC4View {
  if (requested !== undefined) {
    const match = views.find(
      (v) => v.id === requested || (typeof v.title === 'string' && v.title === requested),
    );
    if (match !== undefined) return match;
  }
  const index = views.find((v) => v.id === 'index');
  return index ?? views[0]!;
}

export function createLikeC4Renderer(options?: LikeC4Options): DiagramRenderer {
  void options;
  return new LikeC4Renderer();
}
