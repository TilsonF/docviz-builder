/**
 * Modelo de configuracion (seccion 18 de la especificacion).
 */

import type { OutputFormat } from '../core/types.js';

export type RendererBackend = 'local' | 'kroki';

export interface KrokiConfig {
  url: string;
  allowRemoteHost: boolean;
  allowPublicService: boolean;
  headers: Record<string, string>;
}

export interface RenderersConfig {
  /** Backend por defecto para los motores que admiten ambos. */
  backend: RendererBackend;
  /** Milisegundos maximos por diagrama. */
  timeoutMs: number;
  /** Bytes maximos por recurso generado. */
  maxOutputBytes: number;
  kroki: KrokiConfig;
  plantuml: { enabled: boolean; backend?: RendererBackend; jar?: string; java?: string; maxHeap: string };
  mermaid: { enabled: boolean; backend?: RendererBackend; browserPath?: string };
  d2: { enabled: boolean; backend?: RendererBackend; layout: 'dagre' | 'elk' };
  graphviz: { enabled: boolean; backend?: RendererBackend; engine: string };
  vegaLite: { enabled: boolean; backend?: RendererBackend };
  likec4: { enabled: boolean };
  svgbob: { enabled: boolean };
  bpmn: { enabled: boolean; browserPath?: string };
  /**
   * Desactiva el sandbox de Chromium (Mermaid y BPMN).
   *
   * Sin definir, se decide sola: activada como root —donde Chromium no arranca
   * de otra forma— y desactivada en cualquier otro caso.
   */
  noSandbox?: boolean;
}

export interface DocVizConfig {
  /** Directorio raiz de los documentos fuente. */
  source: string;
  /** Directorio raiz de los documentos compilados. */
  output: string;
  /** Subdirectorio de recursos, relativo a `output`. */
  assetsDir: string;
  /** Formato preferido por tipo de renderer. */
  formats: Record<string, OutputFormat>;
  theme: { name: string };
  cache: { enabled: boolean; dir: string };
  hash: { length: number };
  renderers: RenderersConfig;
  /** Ruta del archivo de configuracion del que se cargo, si lo hubo. */
  configPath?: string;
  /** Directorio base al que se resuelven las rutas relativas. */
  rootDir: string;
}
