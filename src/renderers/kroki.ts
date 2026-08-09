/**
 * Backend Kroki (opcional).
 *
 * Alternativa a los motores locales para quien ya opere un Kroki self-hosted.
 * No es el modo por defecto y, salvo autorizacion explicita, rechaza cualquier
 * host que no sea local: la documentacion tratada puede ser confidencial y
 * enviarla a un servicio publico esta prohibido (seccion 12, puntos 1 y 2).
 */

import { ConfigError, RenderError } from '../core/errors.js';
import {
  MIME_TYPES,
  type DiagramRenderer,
  type OutputFormat,
  type RenderOptions,
  type RenderResult,
} from '../core/types.js';
import { assertFormat, enforceSize, svgResult } from './base.js';
import { applyTheme as applyGraphvizTheme } from './graphviz.js';

/** Correspondencia entre el tipo de DocViz y la ruta de la API de Kroki. */
const KROKI_PATHS: Readonly<Record<string, string>> = {
  plantuml: 'plantuml',
  mermaid: 'mermaid',
  d2: 'd2',
  graphviz: 'graphviz',
  'vega-lite': 'vegalite',
};

const PUBLIC_HOSTS = new Set(['kroki.io', 'www.kroki.io']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', 'kroki']);

export interface KrokiOptions {
  url: string;
  /** Permite apuntar a un host no local (Kroki corporativo en la intranet). */
  allowRemoteHost?: boolean;
  /** Autoriza explicitamente el servicio publico kroki.io. Desaconsejado. */
  allowPublicService?: boolean;
  headers?: Readonly<Record<string, string>>;
}

/**
 * Verifica que la URL apunte a una instancia propia.
 * Lanza `ConfigError` en el arranque, no en mitad del build.
 */
export function assertSafeKrokiUrl(rawUrl: string, options: KrokiOptions): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ConfigError(`renderers.kroki.url no es una URL valida: ${rawUrl}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError(`renderers.kroki.url debe usar http o https, no ${url.protocol}`);
  }
  if (PUBLIC_HOSTS.has(url.hostname) && options.allowPublicService !== true) {
    throw new ConfigError(
      'el servicio publico kroki.io esta bloqueado por defecto',
      'la documentacion puede ser confidencial; despliega Kroki self-hosted o activa renderers.kroki.allowPublicService de forma explicita',
    );
  }
  const isLocal = LOCAL_HOSTS.has(url.hostname) || url.hostname.endsWith('.local');
  if (!isLocal && options.allowRemoteHost !== true && options.allowPublicService !== true) {
    throw new ConfigError(
      `renderers.kroki.url apunta a un host remoto (${url.hostname})`,
      'activa renderers.kroki.allowRemoteHost si ese host es tu instancia self-hosted',
    );
  }
  return url;
}

export class KrokiRenderer implements DiagramRenderer {
  readonly type: string;
  readonly defaultFormat: OutputFormat;
  readonly supportedFormats: readonly OutputFormat[];

  private readonly url: URL;
  private readonly krokiPath: string;
  private readonly headers: Readonly<Record<string, string>>;
  private cachedVersion?: string;

  constructor(type: string, options: KrokiOptions) {
    const krokiPath = KROKI_PATHS[type];
    if (krokiPath === undefined) {
      throw new ConfigError(
        `Kroki no puede renderizar el tipo "${type}"`,
        `tipos soportados via Kroki: ${Object.keys(KROKI_PATHS).join(', ')}`,
      );
    }
    this.type = type;
    this.krokiPath = krokiPath;
    this.url = assertSafeKrokiUrl(options.url, options);
    this.headers = options.headers ?? {};
    this.defaultFormat = 'svg';
    this.supportedFormats = type === 'plantuml' ? (['svg', 'png'] as const) : (['svg'] as const);
  }

  async version(): Promise<string> {
    if (this.cachedVersion !== undefined) return this.cachedVersion;
    // Kroki expone su version en /health; si no responde, se usa el host como
    // discriminante para que el hash siga siendo estable y reproducible.
    try {
      const res = await fetch(new URL('/health', this.url), { signal: AbortSignal.timeout(5_000) });
      const body = (await res.json()) as { version?: string };
      this.cachedVersion = `kroki-${body.version ?? 'desconocida'}-${this.type}`;
    } catch {
      this.cachedVersion = `kroki-${this.url.host}-${this.type}`;
    }
    return this.cachedVersion;
  }

  async render(source: string, options: RenderOptions): Promise<RenderResult> {
    assertFormat(this.type, options.format, this.supportedFormats);

    // El tema se aplica antes de salir del proceso: Kroki recibe el diagrama ya
    // tematizado, igual que lo recibiria el motor local.
    const payload = this.applyTheme(source, options);
    const endpoint = new URL(`${trimSlash(this.url.pathname)}/${this.krokiPath}/${options.format}`, this.url);

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'text/plain; charset=utf-8', ...this.headers },
        body: payload,
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (err) {
      throw new RenderError(
        this.type,
        `no se pudo contactar con Kroki en ${endpoint.href}`,
        err instanceof Error ? err.message : String(err),
      );
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new RenderError(
        this.type,
        `Kroki respondio ${res.status} ${res.statusText}`,
        detail.slice(0, 2_000),
      );
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (options.format === 'png') {
      enforceSize(this.type, buffer, options.maxOutputBytes);
      return { format: 'png', content: buffer, mimeType: MIME_TYPES.png };
    }
    return svgResult(this.type, buffer.toString('utf8'), options);
  }

  private applyTheme(source: string, options: RenderOptions): string {
    const { theme } = options;
    switch (this.type) {
      case 'plantuml': {
        const trimmed = source.trim();
        const skin = theme.plantuml.skinparams.join('\n');
        const open = /^@start[a-z]+\b.*$/im.exec(trimmed);
        if (open === null) return `@startuml\n${skin}\n${trimmed}\n@enduml`;
        const at = open.index + open[0].length;
        return `${trimmed.slice(0, at)}\n${skin}\n${trimmed.slice(at)}`;
      }
      case 'graphviz':
        return applyGraphvizTheme(source, theme);
      case 'vega-lite': {
        const spec = JSON.parse(source) as Record<string, unknown>;
        return JSON.stringify({
          width: theme.vegaLite.width,
          height: theme.vegaLite.height,
          ...spec,
          config: { ...theme.vegaLite.config, ...((spec['config'] as object) ?? {}) },
        });
      }
      case 'mermaid':
      case 'd2':
      default:
        // Kroki no admite configuracion de tema por peticion para estos motores.
        return source;
    }
  }
}

function trimSlash(p: string): string {
  return p.replace(/\/+$/, '');
}

export function createKrokiRenderer(type: string, options: KrokiOptions): DiagramRenderer {
  return new KrokiRenderer(type, options);
}

export function krokiSupports(type: string): boolean {
  return type in KROKI_PATHS;
}
