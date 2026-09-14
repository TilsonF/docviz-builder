/**
 * PNG para los motores que solo emiten SVG.
 *
 * Ocho de los nueve motores solo producen SVG, y para una presentacion, un Word
 * o un correo hace falta PNG. La pieza para convertirlos ya existia
 * —`scripts/rasterize.mjs`, usada para las evidencias de las pruebas— pero
 * vivia fuera del build, asi que 45 de los 57 tipos no tenian forma de salir en
 * PNG.
 *
 * No se anade ninguna dependencia: el Chromium que dibuja Mermaid y BPMN es el
 * mismo que rasteriza, y con el mismo endurecimiento (sandbox, sin red).
 */

import { RenderError } from '../core/errors.js';
import type { DiagramRenderer, OutputFormat, RenderOptions, RenderResult } from '../core/types.js';
import { MIME_TYPES } from '../core/types.js';
import { browserNotFoundHelp, chromiumLaunchArgs, findBrowser, shouldDisableSandbox } from './browser.js';

const TYPE = 'png';

/** Limite del lienzo: por encima, el navegador empieza a recortar. */
const MAXIMO_LADO = 4000;

export interface RasterOptions {
  /**
   * Densidad de la imagen. 2 da una imagen nitida en pantallas de retina y en
   * una diapositiva proyectada, que es donde acaba un PNG.
   */
  scale?: number;
  /**
   * Modo del visor que se emula.
   *
   * Un PNG es una sola imagen y no puede llevar las dos variantes del tema como
   * hace el SVG: hay que elegir una, y lo razonable por defecto es la clara.
   */
  scheme?: 'light' | 'dark';
  browserPath?: string;
  noSandbox?: boolean;
  /** Sustituye el lanzador real. Solo se usa en pruebas. */
  launch?: (executablePath: string, opciones?: { noSandbox: boolean }) => Promise<RasterBrowser>;
  findExecutable?: (explicit?: string) => string | undefined;
}

export type RasterBrowser = {
  newPage(): Promise<RasterPage>;
  close(): Promise<void>;
};

export type RasterPage = {
  setContent(html: string, options?: unknown): Promise<void>;
  setViewport(v: { width: number; height: number; deviceScaleFactor: number }): Promise<void>;
  emulateMediaFeatures?(features: Array<{ name: string; value: string }>): Promise<void>;
  screenshot(options: { omitBackground: boolean; type: 'png' }): Promise<Uint8Array>;
  close(): Promise<void>;
};

/** Ancho y alto declarados en la etiqueta `<svg>`. */
function dimensiones(svg: string): { width: number; height: number } {
  const apertura = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? '';
  const leer = (attr: string, porDefecto: number): number => {
    const valor = new RegExp(`\\b${attr}="(\\d+(?:\\.\\d+)?)"`, 'i').exec(apertura)?.[1];
    const n = valor === undefined ? Number.NaN : Number(valor);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.ceil(n), MAXIMO_LADO) : porDefecto;
  };
  return { width: leer('width', 900), height: leer('height', 700) };
}

export class Rasterizador {
  private browserPromise?: Promise<RasterBrowser>;
  private readonly launch: NonNullable<RasterOptions['launch']>;
  private readonly findExecutable: (explicit?: string) => string | undefined;

  constructor(private readonly options: RasterOptions = {}) {
    this.launch = options.launch ?? defaultLaunch;
    this.findExecutable = options.findExecutable ?? findBrowser;
  }

  private async browser(): Promise<RasterBrowser> {
    this.browserPromise ??= (async () => {
      const executablePath = this.findExecutable(this.options.browserPath);
      if (executablePath === undefined) {
        throw new RenderError(TYPE, 'no se encontro un navegador para rasterizar a PNG', browserNotFoundHelp());
      }
      return this.launch(executablePath, { noSandbox: shouldDisableSandbox(this.options.noSandbox) });
    })();
    return this.browserPromise;
  }

  /** Convierte un SVG ya terminado en PNG. */
  async aPng(svg: string): Promise<Buffer> {
    const { width, height } = dimensiones(svg);
    const scale = this.options.scale ?? 2;
    const scheme = this.options.scheme ?? 'light';
    const page = await (await this.browser()).newPage();

    try {
      await page.setViewport({ width, height, deviceScaleFactor: scale });
      await page.emulateMediaFeatures?.([{ name: 'prefers-color-scheme', value: scheme }]);

      // El SVG se carga como imagen y no en linea, igual que en un visor
      // Markdown: es la unica forma de que su variante clara u oscura se active
      // como se activara de verdad.
      const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
      await page.setContent(
        `<!doctype html><html><body style="margin:0">` +
          `<img src="${dataUri}" width="${width}" height="${height}"></body></html>`,
        { waitUntil: 'load' },
      );

      // Sin fondo: el del tema ya viene dentro del propio SVG, y añadir otro
      // por detras taparia la transparencia de los que no lo llevan.
      return Buffer.from(await page.screenshot({ omitBackground: true, type: 'png' }));
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
 * Marca con la que el envoltorio recuerda a quien envuelve.
 *
 * Un decorador que oculta al decorado obliga a quien pregunta "que motor hay
 * detras de este tipo" a adivinarlo. Es un simbolo para que no aparezca al
 * serializar ni al recorrer las claves.
 */
const ENVUELTO = Symbol('docviz.envuelto');

/** Motor real detras de un renderer, atraviese o no un envoltorio. */
export function motorReal(renderer: DiagramRenderer): DiagramRenderer {
  const interno = (renderer as unknown as Record<symbol, DiagramRenderer>)[ENVUELTO];
  return interno === undefined ? renderer : motorReal(interno);
}

/**
 * Envuelve un renderer para que tambien sepa emitir PNG.
 *
 * El renderer no se entera: dibuja su SVG como siempre y la conversion ocurre
 * despues, con el SVG ya saneado y con el titulo puesto.
 */
export function conPng(renderer: DiagramRenderer, rasterizador: Rasterizador): DiagramRenderer {
  if (renderer.supportedFormats.includes('png')) return renderer;
  const formatos: readonly OutputFormat[] = [...renderer.supportedFormats, 'png'];

  const envoltorio: DiagramRenderer = {
    type: renderer.type,
    defaultFormat: renderer.defaultFormat,
    supportedFormats: formatos,
    version: () => renderer.version(),
    render: async (source: string, options: RenderOptions): Promise<RenderResult> => {
      if (options.format !== 'png') return renderer.render(source, options);

      const svg = await renderer.render(source, { ...options, format: 'svg' });
      const png = await rasterizador.aPng(svg.content.toString('utf8'));
      if (png.byteLength > options.maxOutputBytes) {
        throw new RenderError(
          renderer.type,
          `el PNG ocupa ${png.byteLength} bytes y el limite es ${options.maxOutputBytes}`,
          'baja renderers.png.scale o sube renderers.maxOutputBytes',
        );
      }
      return { format: 'png', content: png, mimeType: MIME_TYPES.png };
    },
    dispose: renderer.dispose === undefined ? undefined : () => renderer.dispose!(),
  };

  // La marca va aparte del literal: es un detalle de implementacion y no tiene
  // por que aparecer en la interfaz que ve el resto del build.
  Object.defineProperty(envoltorio, ENVUELTO, { value: renderer, enumerable: false });
  return envoltorio;
}

const defaultLaunch: NonNullable<RasterOptions['launch']> = async (executablePath, opciones) => {
  const puppeteer = await import('puppeteer-core');
  return (await puppeteer.default.launch({
    executablePath,
    headless: true,
    args: chromiumLaunchArgs(opciones?.noSandbox === true),
  })) as unknown as RasterBrowser;
};
