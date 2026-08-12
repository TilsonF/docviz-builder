/**
 * Renderer de arte ASCII (svgbob, WebAssembly local).
 *
 * Convierte un dibujo hecho con caracteres en un SVG limpio. Cubre el mismo
 * terreno que GoAT o ditaa: esquemas que ya existen en un RFC, un README o un
 * comentario de codigo y que conviene publicar legibles sin volver a dibujarlos.
 */

import { RenderError } from '../core/errors.js';
import type { DiagramRenderer, OutputFormat, RenderOptions, RenderResult } from '../core/types.js';
import { packageVersion } from '../core/package-version.js';
import { assertFormat, asRenderError, svgResult } from './base.js';
import type { Theme } from '../themes/types.js';

const TYPE = 'svgbob';
const SUPPORTED: readonly OutputFormat[] = ['svg'];

type SvgbobModule = { render(source: string): string };

export class SvgbobRenderer implements DiagramRenderer {
  readonly type = TYPE;
  readonly defaultFormat: OutputFormat = 'svg';
  readonly supportedFormats = SUPPORTED;

  private modulePromise?: Promise<SvgbobModule>;
  private cachedVersion?: string;

  private async load(): Promise<SvgbobModule> {
    // El paquete solo declara `module`, sin `main` ni `exports`: hay que
    // apuntar al archivo, o Node busca un `index.js` que no existe.
    this.modulePromise ??= import('svgbob-wasm/svgbob_wasm.js').then((m) => m as unknown as SvgbobModule);
    return this.modulePromise;
  }

  async version(): Promise<string> {
    // El estilo lo aplica DocViz sobre la salida, asi que forma parte del hash.
    this.cachedVersion ??= `svgbob-${packageVersion('svgbob-wasm')}+docviz-style-1`;
    return this.cachedVersion;
  }

  async render(source: string, options: RenderOptions): Promise<RenderResult> {
    assertFormat(TYPE, options.format, SUPPORTED);
    if (source.trim() === '') throw new RenderError(TYPE, 'el dibujo esta vacio');

    const svgbob = await this.load();
    let svg: string;
    try {
      svg = svgbob.render(source);
    } catch (err) {
      throw asRenderError(TYPE, err, 'svgbob no pudo interpretar el dibujo');
    }
    if (typeof svg !== 'string' || !svg.includes('<svg')) {
      throw new RenderError(TYPE, 'svgbob no produjo un SVG valido');
    }
    return svgResult(TYPE, applyTheme(svg, options.theme), options);
  }
}

/**
 * svgbob incrusta su propia hoja de estilos en blanco y negro. Se sustituye por
 * la del tema para que el dibujo no desentone con el resto de diagramas.
 */
export function applyTheme(svg: string, theme: Theme): string {
  const style = [
    `line, path, circle, rect, polygon { stroke: ${theme.palette.text}; stroke-width: 2; ` +
      'stroke-opacity: 1; fill-opacity: 1; stroke-linecap: round; stroke-linejoin: miter; }',
    `text { fill: ${theme.palette.text}; font-family: ${theme.fontFamily}; font-size: 14px; }`,
    `rect.backdrop { fill: ${theme.palette.background}; }`,
    '.broken { stroke-dasharray: 8; }',
    `.filled { fill: ${theme.palette.text}; }`,
    '.bg_filled { fill: ' + theme.palette.surface + '; stroke-width: 1; }',
    '.nofill { fill: ' + theme.palette.background + '; }',
    '.end_marked_arrow { marker-end: url(#arrow); }',
    '.start_marked_arrow { marker-start: url(#arrow); }',
  ].join('\n');

  return svg.replace(/<style[^>]*>[\s\S]*?<\/style>/i, `<style>\n${style}\n</style>`);
}

export function createSvgbobRenderer(): DiagramRenderer {
  return new SvgbobRenderer();
}
