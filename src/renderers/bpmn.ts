/**
 * Renderer BPMN (bpmn-js dentro de un Chromium local).
 *
 * bpmn-js es la implementacion de referencia de la notacion, pero es una
 * biblioteca de navegador: necesita un DOM para medir y dibujar. Se ejecuta con
 * el mismo Chromium que usa Mermaid, sin acceso a la red.
 */

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { RenderError } from '../core/errors.js';
import type { DiagramRenderer, OutputFormat, RenderOptions, RenderResult } from '../core/types.js';
import { packageVersion } from '../core/package-version.js';
import { assertFormat, asRenderError, svgResult } from './base.js';
import { browserNotFoundHelp, findBrowser } from './browser.js';
import { renderBpmnInPage } from './in-page.js';
import type { Theme } from '../themes/types.js';

const TYPE = 'bpmn';
const SUPPORTED: readonly OutputFormat[] = ['svg'];

const require_ = createRequire(import.meta.url);

export interface BpmnOptions {
  browserPath?: string;
}

type Browser = { newPage(): Promise<Page>; close(): Promise<void> };
type Page = {
  setContent(html: string, options?: unknown): Promise<void>;
  addScriptTag(options: { content: string }): Promise<unknown>;
  evaluate<T, A extends unknown[]>(fn: (...args: A) => T | Promise<T>, ...args: A): Promise<T>;
  setRequestInterception?(v: boolean): Promise<void>;
  on(event: string, handler: (...args: never[]) => void): void;
  close(): Promise<void>;
};

export class BpmnRenderer implements DiagramRenderer {
  readonly type = TYPE;
  readonly defaultFormat: OutputFormat = 'svg';
  readonly supportedFormats = SUPPORTED;

  private readonly browserPath?: string;
  private browserPromise?: Promise<Browser>;
  private bundlePromise?: Promise<string>;
  private cachedVersion?: string;

  constructor(options: BpmnOptions = {}) {
    this.browserPath = options.browserPath;
  }

  async version(): Promise<string> {
    this.cachedVersion ??= `bpmn-js-${packageVersion('bpmn-js')}`;
    return this.cachedVersion;
  }

  private async bundle(): Promise<string> {
    this.bundlePromise ??= (async () => {
      const pkg = require_.resolve('bpmn-js/package.json');
      const file = path.join(path.dirname(pkg), 'dist', 'bpmn-viewer.production.min.js');
      try {
        return await readFile(file, 'utf8');
      } catch (err) {
        throw new RenderError(
          TYPE,
          'no se encuentra el visor de bpmn-js',
          `${file}\n${err instanceof Error ? err.message : String(err)}`,
        );
      }
    })();
    return this.bundlePromise;
  }

  private async browser(): Promise<Browser> {
    this.browserPromise ??= (async () => {
      const executablePath = findBrowser(this.browserPath);
      if (executablePath === undefined) {
        throw new RenderError(TYPE, 'no se encontro un navegador Chromium', browserNotFoundHelp());
      }
      const puppeteer = await import('puppeteer-core');
      try {
        return (await puppeteer.default.launch({
          executablePath,
          headless: true,
          args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-background-networking'],
        })) as unknown as Browser;
      } catch (err) {
        throw asRenderError(TYPE, err, `no se pudo lanzar el navegador en ${executablePath}`);
      }
    })();
    return this.browserPromise;
  }

  async render(source: string, options: RenderOptions): Promise<RenderResult> {
    assertFormat(TYPE, options.format, SUPPORTED);
    if (!source.includes('<bpmn:definitions') && !source.includes('<definitions')) {
      throw new RenderError(
        TYPE,
        'el contenido no es un proceso BPMN 2.0',
        'usa el bloque `diagram` con `type: bpmn`; DocViz genera el XML y su trazado',
      );
    }

    const browser = await this.browser();
    const bundle = await this.bundle();
    const page = await browser.newPage();

    try {
      await page.setRequestInterception?.(true);
      page.on('request', ((req: { url(): string; continue(): void; abort(): void }) => {
        if (req.url().startsWith('data:') || req.url() === 'about:blank') req.continue();
        else req.abort();
      }) as never);

      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">` +
          `<div id="lienzo" style="width:2000px;height:1400px"></div></body></html>`,
        { waitUntil: 'domcontentloaded' },
      );
      await page.addScriptTag({ content: bundle });

      const result = await withTimeout(options.timeoutMs, page.evaluate(renderBpmnInPage, source));

      if ('error' in result && result.error !== undefined) {
        throw new RenderError(TYPE, 'bpmn-js no pudo dibujar el proceso', result.error);
      }
      const svg = (result as { svg?: string }).svg;
      if (svg === undefined || !svg.includes('<svg')) {
        throw new RenderError(TYPE, 'bpmn-js no produjo un SVG valido');
      }
      return svgResult(TYPE, applyTheme(svg, options.theme), options);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async dispose(): Promise<void> {
    const browser = await this.browserPromise?.catch(() => undefined);
    this.browserPromise = undefined;
    await browser?.close().catch(() => undefined);
  }
}

/**
 * bpmn-js dibuja en negro sobre transparente. Se anaden el fondo del tema y una
 * hoja de estilos que colorea trazos y textos sin alterar la notacion: en BPMN
 * la forma tiene significado normativo, el color no.
 */
export function applyTheme(svg: string, theme: Theme): string {
  const style =
    `<style>` +
    `.djs-visual > :is(rect,circle,path,polygon,polyline){stroke:${theme.palette.text};}` +
    `.djs-visual > :is(rect,circle){fill:${theme.palette.surface};}` +
    `.djs-visual > text, .djs-label{fill:${theme.palette.text};font-family:${theme.fontFamily};}` +
    `.djs-visual > path{fill:none;}` +
    `marker path, marker polyline{fill:${theme.palette.text};stroke:${theme.palette.text};}` +
    `</style>`;

  const open = /<svg\b[^>]*>/i.exec(svg);
  if (open === null) return svg;
  const at = open.index + open[0].length;
  // El fondo se pinta como primer elemento para que la imagen no sea transparente.
  const background = `<rect x="-100000" y="-100000" width="200000" height="200000" fill="${theme.palette.background}"/>`;
  return `${svg.slice(0, at)}${style}${background}${svg.slice(at)}`;
}

async function withTimeout<T>(timeoutMs: number, work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new RenderError(TYPE, `el render supero el limite de ${timeoutMs} ms`)),
          timeoutMs,
        );
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function createBpmnRenderer(options?: BpmnOptions): DiagramRenderer {
  return new BpmnRenderer(options);
}
