/**
 * Renderer Vega-Lite — compilacion y dibujo en proceso, sin navegador.
 *
 * `vega-lite` compila la especificacion a Vega y `vega` la dibuja a SVG con el
 * renderer `none` (headless). El resultado es un SVG estatico: el Markdown
 * final no depende de JavaScript (criterio de aceptacion de la seccion 26).
 */

import { RenderError } from '../core/errors.js';
import type { DiagramRenderer, OutputFormat, RenderOptions, RenderResult } from '../core/types.js';
import { packageVersion } from '../core/package-version.js';
import { assertFormat, asRenderError, svgResult } from './base.js';

const TYPE = 'vega-lite';
const SUPPORTED: readonly OutputFormat[] = ['svg'];

/**
 * Claves de carga de datos remota. Se bloquean: la documentacion puede ser
 * confidencial y un `data.url` convertiria el build en una peticion de red
 * (seccion 12, punto 2).
 */
const REMOTE_DATA_KEYS = ['url'];

export class VegaLiteRenderer implements DiagramRenderer {
  readonly type = TYPE;
  readonly defaultFormat: OutputFormat = 'svg';
  readonly supportedFormats = SUPPORTED;

  private cachedVersion?: string;

  async version(): Promise<string> {
    if (this.cachedVersion !== undefined) return this.cachedVersion;
    this.cachedVersion = `vega-lite-${packageVersion('vega-lite')}+vega-${packageVersion('vega')}`;
    return this.cachedVersion;
  }

  async render(source: string, options: RenderOptions): Promise<RenderResult> {
    assertFormat(TYPE, options.format, SUPPORTED);

    let spec: Record<string, unknown>;
    try {
      spec = JSON.parse(source) as Record<string, unknown>;
    } catch (err) {
      throw new RenderError(
        TYPE,
        'la especificacion Vega-Lite no es JSON valido',
        err instanceof Error ? err.message : String(err),
      );
    }
    if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) {
      throw new RenderError(TYPE, 'la especificacion Vega-Lite debe ser un objeto JSON');
    }

    assertNoRemoteData(spec);

    const { theme } = options;
    const themed: Record<string, unknown> = {
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      width: theme.vegaLite.width,
      height: theme.vegaLite.height,
      ...spec,
      // El `config` del tema se mezcla debajo del que traiga el autor.
      config: { ...theme.vegaLite.config, ...((spec['config'] as object) ?? {}) },
    };
    if (options.title !== undefined && themed['title'] === undefined) {
      themed['title'] = options.title;
    }

    try {
      const vegaLite = await import('vega-lite');
      const vega = await import('vega');
      const compiled = vegaLite.compile(themed as never);
      const runtime = vega.parse(compiled.spec, undefined, { ast: true });
      const view = new vega.View(runtime, { renderer: 'none' });
      // `loader` nulo: cualquier intento residual de cargar datos externos falla.
      const svg = await view.toSVG();
      await view.finalize();
      return svgResult(TYPE, svg, options);
    } catch (err) {
      throw asRenderError(TYPE, err, 'Vega-Lite no pudo generar el grafico');
    }
  }
}

/** Rechaza `data.url` en la especificacion o en cualquier sub-especificacion. */
function assertNoRemoteData(node: unknown, path = '$'): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((item, i) => assertNoRemoteData(item, `${path}[${i}]`));
    return;
  }
  const obj = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'data' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const remoteKey of REMOTE_DATA_KEYS) {
        if (remoteKey in (value as Record<string, unknown>)) {
          throw new RenderError(
            TYPE,
            'no se admite carga remota de datos (data.url)',
            `encontrado en ${path}.data.${remoteKey}; incrusta los valores con "data": { "values": [...] }`,
          );
        }
      }
    }
    assertNoRemoteData(value, `${path}.${key}`);
  }
}

export function createVegaLiteRenderer(): DiagramRenderer {
  return new VegaLiteRenderer();
}
