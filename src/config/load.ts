/**
 * Carga y validacion de `docviz.config.yaml`.
 *
 * La configuracion es totalmente opcional: sin archivo, los valores por defecto
 * ya producen un build correcto, local y seguro.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ConfigError } from '../core/errors.js';
import { DEFAULT_CACHE_DIR } from '../core/cache.js';
import { DEFAULT_HASH_LENGTH, MAX_HASH_LENGTH, MIN_HASH_LENGTH } from '../core/hash.js';
import { assertRelativeDir } from '../core/paths.js';
import { buildTheme_, themeNames } from '../themes/index.js';
import type { OutputFormat } from '../core/types.js';
import type { DocVizConfig, RendererBackend } from './types.js';

export const CONFIG_FILE_NAMES = ['docviz.config.yaml', 'docviz.config.yml', '.docvizrc.yaml'];

const VALID_FORMATS: readonly OutputFormat[] = ['svg', 'png'];
const VALID_BACKENDS: readonly RendererBackend[] = ['local', 'kroki'];

export function defaultConfig(rootDir: string): DocVizConfig {
  return {
    source: 'docs-src',
    output: 'docs',
    assetsDir: 'assets/generated',
    formats: {
      plantuml: 'svg',
      mermaid: 'svg',
      d2: 'svg',
      graphviz: 'svg',
      'vega-lite': 'svg',
      likec4: 'svg',
      'plantuml-c4': 'svg',
      svgbob: 'svg',
      bpmn: 'svg',
    },
    theme: { name: 'default' },
    cache: { enabled: true, dir: DEFAULT_CACHE_DIR },
    hash: { length: DEFAULT_HASH_LENGTH },
    renderers: {
      backend: 'local',
      timeoutMs: 60_000,
      maxOutputBytes: 8 * 1024 * 1024,
      kroki: {
        url: 'http://localhost:8000',
        allowRemoteHost: false,
        allowPublicService: false,
        headers: {},
      },
      plantuml: { enabled: true, maxHeap: '1024m' },
      mermaid: { enabled: true },
      d2: { enabled: true, layout: 'dagre' },
      graphviz: { enabled: true, engine: 'dot' },
      vegaLite: { enabled: true },
      likec4: { enabled: true },
      svgbob: { enabled: true },
      bpmn: { enabled: true },
    },
    rootDir,
  };
}

/** Busca el archivo de configuracion desde `startDir` hacia arriba. */
export function findConfigFile(startDir: string): string | undefined {
  let dir = path.resolve(startDir);
  for (;;) {
    for (const name of CONFIG_FILE_NAMES) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export interface LoadConfigOptions {
  /** Ruta explicita al archivo de configuracion. */
  configPath?: string;
  /** Directorio desde el que se busca la configuracion. */
  cwd?: string;
  /** Sobrescrituras provenientes de la linea de comandos. */
  overrides?: Partial<{
    source: string;
    output: string;
    theme: string;
    cacheEnabled: boolean;
    krokiUrl: string;
    backend: RendererBackend;
  }>;
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<DocVizConfig> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const configPath = options.configPath !== undefined ? path.resolve(cwd, options.configPath) : findConfigFile(cwd);

  let raw: unknown;
  if (configPath !== undefined) {
    if (!existsSync(configPath)) {
      throw new ConfigError(`no se encuentra el archivo de configuracion: ${configPath}`);
    }
    const text = await readFile(configPath, 'utf8');
    try {
      raw = parseYaml(text) ?? {};
    } catch (err) {
      throw new ConfigError(
        `no se pudo interpretar ${configPath}`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  const rootDir = configPath !== undefined ? path.dirname(configPath) : cwd;
  const config = mergeConfig(defaultConfig(rootDir), raw);
  if (configPath !== undefined) config.configPath = configPath;

  applyOverrides(config, options.overrides ?? {});
  validate(config);
  return config;
}

/** Fusiona el YAML del usuario sobre los valores por defecto, con validacion. */
export function mergeConfig(base: DocVizConfig, raw: unknown): DocVizConfig {
  if (raw === undefined || raw === null) return base;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ConfigError('la raiz de docviz.config.yaml debe ser un mapa');
  }
  const doc = raw as Record<string, unknown>;
  const out: DocVizConfig = structuredClone(base);

  // `output` admite dos formas: la corta (`output: docs`) y el mapa con
  // `dir`/`assetsDir`. La corta se comprueba primero para no rechazarla como
  // "deberia ser un mapa".
  if (typeof doc['output'] === 'string') {
    out.output = doc['output'];
  } else {
    const output = obj(doc['output'], 'output');
    if (output !== undefined) {
      if (typeof output['dir'] === 'string') out.output = output['dir'];
      if (typeof output['assetsDir'] === 'string') out.assetsDir = output['assetsDir'];
    }
  }
  if (typeof doc['source'] === 'string') out.source = doc['source'];

  const formats = obj(doc['formats'], 'formats');
  if (formats !== undefined) {
    for (const [type, value] of Object.entries(formats)) {
      if (typeof value !== 'string' || !VALID_FORMATS.includes(value as OutputFormat)) {
        throw new ConfigError(
          `formats.${type} debe ser "svg" o "png"`,
          `valor recibido: ${JSON.stringify(value)}`,
        );
      }
      out.formats[type] = value as OutputFormat;
    }
  }

  const theme = doc['theme'];
  if (typeof theme === 'string') out.theme.name = theme;
  else {
    const t = obj(theme, 'theme');
    if (t !== undefined && typeof t['name'] === 'string') out.theme.name = t['name'];
    // Un tema declarado con `palette` o `base` es de marca: se construye
    // partiendo de uno incluido en lugar de buscarse en la lista.
    if (t !== undefined && (t['palette'] !== undefined || t['darkPalette'] !== undefined || t['base'] !== undefined)) {
      out.theme.custom = {
        name: typeof t['name'] === 'string' ? t['name'] : 'marca',
        ...(typeof t['base'] === 'string' ? { base: t['base'] } : {}),
        ...(obj(t['palette'], 'theme.palette') !== undefined ? { palette: obj(t['palette'], 'theme.palette')! } : {}),
        ...(obj(t['darkPalette'], 'theme.darkPalette') !== undefined
          ? { darkPalette: obj(t['darkPalette'], 'theme.darkPalette')! }
          : {}),
        ...(typeof t['fontFamily'] === 'string' ? { fontFamily: t['fontFamily'] } : {}),
      };
    }
  }

  const cache = obj(doc['cache'], 'cache');
  if (cache !== undefined) {
    if (typeof cache['enabled'] === 'boolean') out.cache.enabled = cache['enabled'];
    if (typeof cache['dir'] === 'string') out.cache.dir = cache['dir'];
  }

  const hash = obj(doc['hash'], 'hash');
  if (hash !== undefined && typeof hash['length'] === 'number') out.hash.length = hash['length'];

  const renderers = obj(doc['renderers'], 'renderers');
  if (renderers !== undefined) {
    const r = out.renderers;
    if (typeof renderers['backend'] === 'string') r.backend = backend(renderers['backend'], 'renderers.backend');
    if (typeof renderers['timeoutMs'] === 'number') r.timeoutMs = renderers['timeoutMs'];
    if (typeof renderers['maxOutputBytes'] === 'number') r.maxOutputBytes = renderers['maxOutputBytes'];
    if (typeof renderers['noSandbox'] === 'boolean') r.noSandbox = renderers['noSandbox'];

    const kroki = obj(renderers['kroki'], 'renderers.kroki');
    if (kroki !== undefined) {
      if (typeof kroki['url'] === 'string') r.kroki.url = kroki['url'];
      if (typeof kroki['allowRemoteHost'] === 'boolean') r.kroki.allowRemoteHost = kroki['allowRemoteHost'];
      if (typeof kroki['allowPublicService'] === 'boolean') {
        r.kroki.allowPublicService = kroki['allowPublicService'];
      }
      const headers = obj(kroki['headers'], 'renderers.kroki.headers');
      if (headers !== undefined) {
        r.kroki.headers = Object.fromEntries(
          Object.entries(headers).map(([k, v]) => [k, String(v)]),
        );
      }
    }

    applyEngine(r.plantuml, renderers['plantuml'], 'renderers.plantuml', (cfg, node) => {
      if (typeof node['jar'] === 'string') cfg.jar = node['jar'];
      if (typeof node['java'] === 'string') cfg.java = node['java'];
      if (typeof node['maxHeap'] === 'string') cfg.maxHeap = node['maxHeap'];
    });
    applyEngine(r.mermaid, renderers['mermaid'], 'renderers.mermaid', (cfg, node) => {
      if (typeof node['browserPath'] === 'string') cfg.browserPath = node['browserPath'];
    });
    applyEngine(r.d2, renderers['d2'], 'renderers.d2', (cfg, node) => {
      if (node['layout'] === 'dagre' || node['layout'] === 'elk') cfg.layout = node['layout'];
    });
    applyEngine(r.graphviz, renderers['graphviz'], 'renderers.graphviz', (cfg, node) => {
      if (typeof node['engine'] === 'string') cfg.engine = node['engine'];
    });
    applyEngine(r.vegaLite, renderers['vega-lite'] ?? renderers['vegaLite'], 'renderers.vega-lite', () => undefined);

    const likec4 = obj(renderers['likec4'], 'renderers.likec4');
    if (likec4 !== undefined && typeof likec4['enabled'] === 'boolean') {
      r.likec4.enabled = likec4['enabled'];
    }
    applyEngine(r.svgbob, renderers['svgbob'], 'renderers.svgbob', () => undefined);
    applyEngine(r.bpmn, renderers['bpmn'], 'renderers.bpmn', (cfg, node) => {
      if (typeof node['browserPath'] === 'string') cfg.browserPath = node['browserPath'];
    });
  }

  return out;
}

function applyEngine<T extends { enabled: boolean; backend?: RendererBackend }>(
  cfg: T,
  node: unknown,
  field: string,
  extra: (cfg: T, node: Record<string, unknown>) => void,
): void {
  if (node === undefined || node === null) return;
  if (typeof node === 'boolean') {
    cfg.enabled = node;
    return;
  }
  const record = obj(node, field);
  if (record === undefined) return;
  if (typeof record['enabled'] === 'boolean') cfg.enabled = record['enabled'];
  if (typeof record['backend'] === 'string') cfg.backend = backend(record['backend'], `${field}.backend`);
  extra(cfg, record);
}

function obj(value: unknown, field: string): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigError(`${field} debe ser un mapa`, `valor recibido: ${JSON.stringify(value)}`);
  }
  return value as Record<string, unknown>;
}

function backend(value: string, field: string): RendererBackend {
  if (!VALID_BACKENDS.includes(value as RendererBackend)) {
    throw new ConfigError(`${field} debe ser "local" o "kroki"`, `valor recibido: ${value}`);
  }
  return value as RendererBackend;
}

function applyOverrides(config: DocVizConfig, overrides: NonNullable<LoadConfigOptions['overrides']>): void {
  if (overrides.source !== undefined) config.source = overrides.source;
  if (overrides.output !== undefined) config.output = overrides.output;
  if (overrides.theme !== undefined) config.theme.name = overrides.theme;
  if (overrides.cacheEnabled !== undefined) config.cache.enabled = overrides.cacheEnabled;
  if (overrides.krokiUrl !== undefined) {
    config.renderers.kroki.url = overrides.krokiUrl;
    config.renderers.backend = 'kroki';
  }
  // Las opciones de CLI se validan igual que el YAML: `--backend nube` debe
  // fallar en el arranque, no dejar el build corriendo en modo local en silencio.
  if (overrides.backend !== undefined) {
    config.renderers.backend = backend(String(overrides.backend), '--backend');
  }
}

function validate(config: DocVizConfig): void {
  if (config.theme.custom !== undefined) {
    // Se construye ahora, no al dibujar: un color mal escrito tiene que fallar
    // al cargar la configuracion y no a mitad del primer diagrama.
    const base = config.theme.custom.base ?? 'default';
    if (!themeNames().includes(base)) {
      throw new ConfigError(
        `el tema base "${base}" no existe`,
        `temas disponibles: ${themeNames().join(', ')}`,
      );
    }
    buildTheme_(config.theme.custom);
    return;
  }
  if (!themeNames().includes(config.theme.name)) {
    throw new ConfigError(
      `el tema "${config.theme.name}" no existe`,
      `temas disponibles: ${themeNames().join(', ')}`,
    );
  }
  assertRelativeDir(config.assetsDir, 'output.assetsDir');
  const { length } = config.hash;
  if (!Number.isInteger(length) || length < MIN_HASH_LENGTH || length > MAX_HASH_LENGTH) {
    throw new ConfigError(
      `hash.length debe ser un entero entre ${MIN_HASH_LENGTH} y ${MAX_HASH_LENGTH}`,
      `valor recibido: ${length}`,
    );
  }
  if (config.renderers.timeoutMs <= 0) {
    throw new ConfigError('renderers.timeoutMs debe ser mayor que cero');
  }
  if (config.renderers.maxOutputBytes <= 0) {
    throw new ConfigError('renderers.maxOutputBytes debe ser mayor que cero');
  }
}

/** Resuelve una ruta de la configuracion contra su directorio base. */
export function resolveFromRoot(config: DocVizConfig, p: string): string {
  return path.resolve(config.rootDir, p);
}
