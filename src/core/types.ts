/**
 * Contratos publicos de DocViz Builder.
 *
 * El parser Markdown solo conoce estas interfaces; ningun detalle de PlantUML,
 * Mermaid, D2, Vega-Lite, Graphviz o LikeC4 se filtra hacia arriba.
 */

import type { Theme } from '../themes/types.js';

export type OutputFormat = 'svg' | 'png';

export const MIME_TYPES: Record<OutputFormat, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
};

/** Opciones que el builder entrega a cada renderer en cada invocacion. */
export interface RenderOptions {
  /** Formato pedido. El renderer debe fallar si no lo soporta. */
  format: OutputFormat;
  /** Tema resuelto del proyecto. */
  theme: Theme;
  /** Titulo del diagrama, util para `<title>` accesible dentro del SVG. */
  title?: string;
  /** Milisegundos maximos de render. Superarlo es un error, no un warning. */
  timeoutMs: number;
  /** Tamano maximo aceptado del recurso generado, en bytes. */
  maxOutputBytes: number;
}

export interface RenderResult {
  format: OutputFormat;
  content: Buffer;
  mimeType: string;
}

/**
 * Un renderer traduce un lenguaje declarativo a una imagen.
 *
 * `version()` participa en el hash del recurso: si el motor cambia de version,
 * los recursos cacheados se invalidan solos.
 */
export interface DiagramRenderer {
  readonly type: string;
  readonly defaultFormat: OutputFormat;
  readonly supportedFormats: readonly OutputFormat[];
  /** Identificador estable de la version del motor subyacente. */
  version(): Promise<string>;
  render(source: string, options: RenderOptions): Promise<RenderResult>;
  /** Libera recursos persistentes (navegador, wasm, JVM). */
  dispose?(): Promise<void>;
}

/** Un bloque declarativo detectado dentro de un documento Markdown. */
export interface DiagramBlock {
  /** Lenguaje de la valla: `plantuml`, `mermaid`, `diagram`, `chart`, ... */
  lang: string;
  /** Tipo de renderer final tras resolver el DSL de alto nivel. */
  rendererType: string;
  /** Codigo fuente que recibira el renderer. */
  source: string;
  /** Codigo fuente tal cual aparece en el documento (DSL sin compilar). */
  rawSource: string;
  /** Titulo usado como alt text y como base del nombre de archivo. */
  title: string;
  /** Formato pedido explicitamente en la valla, si lo hubo. */
  requestedFormat?: OutputFormat;
  /** Posicion en el documento fuente, para reemplazo quirurgico y errores. */
  start: number;
  end: number;
  line: number;
}

export interface RenderedAsset {
  /** Ruta relativa al directorio de salida, con separadores POSIX. */
  relativePath: string;
  absolutePath: string;
  hash: string;
  format: OutputFormat;
  bytes: number;
  fromCache: boolean;
}

export interface BuildStats {
  documents: number;
  blocks: number;
  generated: number;
  cacheHits: number;
}
