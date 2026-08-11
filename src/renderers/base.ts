/**
 * Piezas compartidas por todos los renderers: limite de tiempo, limite de
 * tamano y construccion del `RenderResult` (seccion 12, puntos 3 y 4).
 */

import { RenderError } from '../core/errors.js';
import { MIME_TYPES, type OutputFormat, type RenderOptions, type RenderResult } from '../core/types.js';
import { applyColorScheme } from './color-scheme.js';
import { finalizeSvg } from './svg-utils.js';

/** Ejecuta una promesa con limite de tiempo; superarlo es un `RenderError`. */
export async function withTimeout<T>(
  renderer: string,
  timeoutMs: number,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new RenderError(renderer, `el render supero el limite de ${timeoutMs} ms`));
    }, timeoutMs);
    timer.unref?.();
  });
  try {
    return await Promise.race([work(controller.signal), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Rechaza recursos que superen el tamano maximo configurado. */
export function enforceSize(renderer: string, content: Buffer, maxBytes: number): void {
  if (content.byteLength > maxBytes) {
    throw new RenderError(
      renderer,
      `el recurso generado ocupa ${content.byteLength} bytes y supera el maximo de ${maxBytes}`,
      'reduce el numero de nodos del diagrama o sube renderers.maxOutputBytes en docviz.config.yaml',
    );
  }
}

/** Comprueba que el formato pedido este soportado por el renderer. */
export function assertFormat(
  renderer: string,
  format: OutputFormat,
  supported: readonly OutputFormat[],
): void {
  if (!supported.includes(format)) {
    throw new RenderError(
      renderer,
      `el formato "${format}" no esta soportado por el renderer ${renderer}`,
      `formatos soportados: ${supported.join(', ')}`,
    );
  }
}

/** Normaliza, sanea y empaqueta un SVG como `RenderResult`. */
export function svgResult(
  renderer: string,
  svg: string,
  options: RenderOptions,
): RenderResult {
  // El esquema dual se aplica al final, sobre los colores que el tema ya inyecto.
  const finalized = applyColorScheme(finalizeSvg(svg, options.title), options.theme);
  const content = Buffer.from(finalized, 'utf8');
  enforceSize(renderer, content, options.maxOutputBytes);
  return { format: 'svg', content, mimeType: MIME_TYPES.svg };
}

export function pngResult(
  renderer: string,
  png: Buffer,
  options: RenderOptions,
): RenderResult {
  enforceSize(renderer, png, options.maxOutputBytes);
  return { format: 'png', content: png, mimeType: MIME_TYPES.png };
}

/** Convierte un error desconocido en `RenderError` sin perder el detalle. */
export function asRenderError(renderer: string, err: unknown, fallback: string): RenderError {
  if (err instanceof RenderError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new RenderError(renderer, fallback, message);
}
