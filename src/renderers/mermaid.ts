/**
 * Renderer Mermaid — Mermaid necesita medir texto en un DOM real, asi que se
 * ejecuta dentro de un Chromium local en modo headless.
 *
 * Nada sale a la red: la pagina es `about:blank`, el bundle de Mermaid se
 * inyecta desde `node_modules` y la navegacion queda bloqueada.
 */

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { RenderError } from '../core/errors.js';
import type { DiagramRenderer, OutputFormat, RenderOptions, RenderResult } from '../core/types.js';
import { packageVersion } from '../core/package-version.js';
import { assertFormat, asRenderError, svgResult } from './base.js';
import { browserNotFoundHelp, findBrowser } from './browser.js';

const TYPE = 'mermaid';
const SUPPORTED: readonly OutputFormat[] = ['svg'];

const require_ = createRequire(import.meta.url);

export interface MermaidOptions {
  /** Ruta explicita al ejecutable de Chromium. */
  browserPath?: string;
}

type Browser = {
  newPage(): Promise<Page>;
  close(): Promise<void>;
  connected?: boolean;
};
type Page = {
  setContent(html: string, options?: unknown): Promise<void>;
  addScriptTag(options: { content: string }): Promise<unknown>;
  evaluate<T, A extends unknown[]>(fn: (...args: A) => T | Promise<T>, ...args: A): Promise<T>;
  setRequestInterception?(v: boolean): Promise<void>;
  on(event: string, handler: (...args: never[]) => void): void;
};

export class MermaidRenderer implements DiagramRenderer {
  readonly type = TYPE;
  readonly defaultFormat: OutputFormat = 'svg';
  readonly supportedFormats = SUPPORTED;

  private readonly browserPath?: string;
  private browserPromise?: Promise<Browser>;
  private bundlePromise?: Promise<string>;
  private cachedVersion?: string;
  private counter = 0;

  constructor(options: MermaidOptions = {}) {
    this.browserPath = options.browserPath;
  }

  async version(): Promise<string> {
    if (this.cachedVersion !== undefined) return this.cachedVersion;
    this.cachedVersion = `mermaid-${packageVersion('mermaid')}`;
    return this.cachedVersion;
  }

  /** Bundle UMD autocontenido de Mermaid (define `window.mermaid`). */
  private async bundle(): Promise<string> {
    this.bundlePromise ??= (async () => {
      const entry = require_.resolve('mermaid/package.json');
      const file = path.join(path.dirname(entry), 'dist', 'mermaid.min.js');
      try {
        return await readFile(file, 'utf8');
      } catch (err) {
        throw new RenderError(
          TYPE,
          'no se encuentra el bundle de Mermaid',
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
          args: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--hide-scrollbars',
            '--mute-audio',
            // Sin acceso a red: el contenido puede ser confidencial.
            '--disable-background-networking',
            '--disable-sync',
            '--no-first-run',
            '--no-default-browser-check',
          ],
        })) as unknown as Browser;
      } catch (err) {
        throw asRenderError(TYPE, err, `no se pudo lanzar el navegador en ${executablePath}`);
      }
    })();
    return this.browserPromise;
  }

  async render(source: string, options: RenderOptions): Promise<RenderResult> {
    assertFormat(TYPE, options.format, SUPPORTED);
    if (source.trim() === '') throw new RenderError(TYPE, 'el diagrama Mermaid esta vacio');

    const browser = await this.browser();
    const bundle = await this.bundle();
    const page = await browser.newPage();
    const id = `docviz-${(this.counter += 1)}`;

    try {
      // Bloquea toda peticion de red que Mermaid pudiera intentar (p.ej. fuentes).
      await page.setRequestInterception?.(true);
      page.on('request', ((req: { url(): string; continue(): void; abort(): void }) => {
        if (req.url().startsWith('data:') || req.url() === 'about:blank') req.continue();
        else req.abort();
      }) as never);

      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:${options.theme.palette.background};font-family:${options.theme.fontFamily}}</style></head><body><div id="host"></div></body></html>`,
        { waitUntil: 'domcontentloaded' },
      );
      await page.addScriptTag({ content: bundle });

      const result = await withPageTimeout(
        options.timeoutMs,
        page.evaluate(
          async (args: { code: string; id: string; config: unknown }) => {
            const mermaid = (globalThis as unknown as { mermaid?: Record<string, never> }).mermaid;
            if (mermaid === undefined) return { error: 'el bundle de Mermaid no se cargo en la pagina' };
            try {
              (mermaid as unknown as { initialize(c: unknown): void }).initialize(args.config);
              const rendered = await (
                mermaid as unknown as { render(id: string, code: string): Promise<{ svg: string }> }
              ).render(args.id, args.code);
              return { svg: rendered.svg };
            } catch (e) {
              const err = e as { message?: string; str?: string };
              return { error: err.str ?? err.message ?? String(e) };
            }
          },
          {
            code: source,
            id,
            config: {
              startOnLoad: false,
              // `strict` desactiva HTML arbitrario y manejadores `click` dentro
              // del diagrama: el codigo viene de un documento, no de un humano.
              securityLevel: 'strict',
              theme: options.theme.mermaid.theme,
              themeVariables: options.theme.mermaid.themeVariables,
              fontFamily: options.theme.fontFamily,
              flowchart: { htmlLabels: false, useMaxWidth: false, curve: 'basis' },
              sequence: { useMaxWidth: false },
              gantt: { useMaxWidth: false },
              class: { useMaxWidth: false },
              state: { useMaxWidth: false },
              er: { useMaxWidth: false },
              journey: { useMaxWidth: false },
              pie: { useMaxWidth: false },
            },
          },
        ),
      );

      if ('error' in result && result.error !== undefined) {
        throw new RenderError(TYPE, 'Mermaid no pudo dibujar el diagrama', result.error);
      }
      const svg = (result as { svg?: string }).svg;
      if (svg === undefined || !svg.includes('<svg')) {
        throw new RenderError(TYPE, 'Mermaid no produjo un SVG valido');
      }
      return svgResult(TYPE, stripMermaidIds(svg, id), options);
    } finally {
      await (page as unknown as { close(): Promise<void> }).close().catch(() => undefined);
    }
  }

  async dispose(): Promise<void> {
    const browser = await this.browserPromise?.catch(() => undefined);
    this.browserPromise = undefined;
    await browser?.close().catch(() => undefined);
  }
}

/**
 * Mermaid usa el id de render como prefijo de todas sus clases CSS. Se
 * reemplaza por uno estable para que dos builds del mismo diagrama produzcan
 * bytes identicos (requisito de determinismo del hash).
 */
function stripMermaidIds(svg: string, id: string): string {
  return svg.split(id).join('docviz-diagram');
}

async function withPageTimeout<T>(timeoutMs: number, work: Promise<T>): Promise<T> {
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

export function createMermaidRenderer(options?: MermaidOptions): DiagramRenderer {
  return new MermaidRenderer(options);
}
