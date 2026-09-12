/**
 * Orquestador del build.
 *
 * Recorre los documentos fuente, resuelve cada bloque declarativo, renderiza
 * (o reutiliza del cache) y escribe el Markdown compilado junto a sus recursos.
 */

import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AssetCache } from '../core/cache.js';
import { BuildFailedError, DocVizError, ERROR_CODES, RenderError } from '../core/errors.js';
import { fullHash, HashRegistry, shortHash } from '../core/hash.js';
import {
  assertInside,
  displayPath,
  ensureAssetsDir,
  relativeAssetPath,
  assetFileName,
  toPosix,
} from '../core/paths.js';
import type { BuildStats, DiagramBlock, OutputFormat, RenderedAsset } from '../core/types.js';
import { buildRegistry } from '../renderers/index.js';
import type { RendererRegistry } from '../core/registry.js';
import { compileDsl, DSL_LANGUAGES } from '../dsl/index.js';
import { scanDocument, type ScanResult } from '../markdown/scan.js';
import { applyReplacements, type Replacement } from '../markdown/transform.js';
import { getTheme, themeFingerprint } from '../themes/index.js';
import { resolveFromRoot } from '../config/load.js';
import type { DocVizConfig } from '../config/types.js';

export interface BuildOptions {
  /** Borra el directorio de salida antes de compilar. */
  clean?: boolean;
  /** Continua tras un error de render en lugar de abortar. No es el defecto. */
  continueOnError?: boolean;
  verbose?: boolean;
  /** Receptor de mensajes de progreso. */
  onLog?: (message: string) => void;
}

/** Aviso localizado que no impide compilar. */
export interface BuildWarning {
  file: string;
  line: number;
  lang: string;
  code: string;
  field: string;
  message: string;
}

export interface BuildResult {
  stats: BuildStats;
  documents: Array<{ source: string; output: string; blocks: number }>;
  assets: RenderedAsset[];
  errors: DocVizError[];
  warnings: BuildWarning[];
}

export interface CheckResult {
  documents: number;
  blocks: number;
  /** Bloques de DSL que no llegaron a compilar. */
  invalidBlocks: number;
  errors: DocVizError[];
  warnings: BuildWarning[];
  findings: Array<{ file: string; line: number; lang: string; rendererType: string; title: string }>;
}

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);
const IGNORED_DIRS = new Set(['node_modules', '.git', '.docviz-cache']);

// --------------------------------------------------------------------------
// check: validacion estructural sin renderizar
// --------------------------------------------------------------------------

/**
 * Comprueba que todos los bloques sean interpretables: lenguaje registrado,
 * DSL valido y renderer disponible. No dibuja nada, por lo que es rapido y
 * sirve como compuerta previa al build.
 */
export async function check(config: DocVizConfig): Promise<CheckResult> {
  const sourceDir = resolveFromRoot(config, config.source);
  const registry = buildRegistry(config);
  const files = await collectMarkdown(sourceDir);
  const errors: DocVizError[] = [];
  const warnings: BuildWarning[] = [];
  const findings: CheckResult['findings'] = [];
  let blocks = 0;
  let invalidBlocks = 0;

  for (const file of files) {
    const relative = displayPath(config.rootDir, file);
    const text = await readFile(file, 'utf8');
    let scanned: ScanResult;
    try {
      scanned = scanBlocks(text, registry);
    } catch (err) {
      errors.push(toDocVizError(err, { file: relative }));
      continue;
    }
    // Cada bloque invalido se reporta con su linea: el escaneo ya no se detiene
    // en el primero, asi que una sola pasada los enumera todos.
    for (const issue of scanned.errors) {
      invalidBlocks += 1;
      errors.push(toDocVizError(issue.error, { file: relative, line: issue.line }));
    }
    warnings.push(...scanned.warnings.map((w) => ({ file: relative, ...w })));
    for (const block of scanned.blocks) {
      blocks += 1;
      if (!registry.has(block.rendererType)) {
        errors.push(
          new DocVizError(
            `no hay renderer disponible para "${block.rendererType}"`,
            { file: relative, line: block.line, renderer: block.rendererType },
            `renderers habilitados: ${registry.types().join(', ')}`,
            ERROR_CODES.RENDERER_UNAVAILABLE,
          ),
        );
        continue;
      }
      const renderer = registry.get(block.rendererType);
      const format = resolveFormat(block, config, renderer.defaultFormat);
      if (!renderer.supportedFormats.includes(format)) {
        errors.push(
          new DocVizError(
            `el renderer ${block.rendererType} no puede producir ${format}`,
            { file: relative, line: block.line, renderer: block.rendererType },
            `formatos soportados: ${renderer.supportedFormats.join(', ')}`,
            ERROR_CODES.FORMAT_UNSUPPORTED,
          ),
        );
        continue;
      }
      findings.push({
        file: relative,
        line: block.line,
        lang: block.lang,
        rendererType: block.rendererType,
        title: block.title,
      });
    }
  }

  await registry.disposeAll().catch(() => undefined);
  return { documents: files.length, blocks, invalidBlocks, errors, warnings, findings };
}

// --------------------------------------------------------------------------
// build
// --------------------------------------------------------------------------

export async function build(config: DocVizConfig, options: BuildOptions = {}): Promise<BuildResult> {
  const log = options.onLog ?? (() => undefined);
  const sourceDir = resolveFromRoot(config, config.source);
  const outputDir = resolveFromRoot(config, config.output);

  if (path.resolve(sourceDir) === path.resolve(outputDir)) {
    throw new DocVizError(
      'el directorio de salida no puede ser el mismo que el de origen',
      {},
      `origen y salida apuntan a ${sourceDir}`,
    );
  }

  if (options.clean === true) {
    await rm(outputDir, { recursive: true, force: true });
    log(`limpieza: se elimino ${toPosix(path.relative(config.rootDir, outputDir))}`);
  }

  const theme = getTheme(config.theme.name);
  const fingerprintValue = themeFingerprint(theme);
  const registry = buildRegistry(config);
  const cache = new AssetCache(resolveFromRoot(config, config.cache.dir), config.cache.enabled);
  const assetsDir = await ensureAssetsDir(outputDir, config.assetsDir);
  const hashes = new HashRegistry();

  const files = await collectMarkdown(sourceDir);
  const result: BuildResult = {
    stats: { documents: 0, blocks: 0, generated: 0, cacheHits: 0 },
    documents: [],
    assets: [],
    errors: [],
    warnings: [],
  };

  try {
    for (const file of files) {
      const relativeSource = displayPath(config.rootDir, file);
      const text = await readFile(file, 'utf8');

      let scanned: ScanResult;
      try {
        scanned = scanBlocks(text, registry);
      } catch (err) {
        result.errors.push(toDocVizError(err, { file: relativeSource }));
        continue;
      }
      const blocks: DiagramBlock[] = scanned.blocks;

      // Un bloque que no compila no cancela el resto del documento: se reporta
      // con su linea y los demas siguen dibujandose.
      for (const issue of scanned.errors) {
        result.errors.push(toDocVizError(issue.error, { file: relativeSource, line: issue.line }));
      }
      result.warnings.push(...scanned.warnings.map((w) => ({ file: relativeSource, ...w })));

      const outputPath = assertInside(outputDir, path.relative(sourceDir, file));
      const replacements: Replacement[] = [];

      for (const block of blocks) {
        result.stats.blocks += 1;
        try {
          const asset = await renderBlock({
            block,
            config,
            registry,
            cache,
            hashes,
            assetsDir,
            themeName: config.theme.name,
            themeFingerprintValue: fingerprintValue,
            theme,
          });
          result.assets.push(asset);
          if (asset.fromCache) result.stats.cacheHits += 1;
          else result.stats.generated += 1;
          replacements.push({
            block,
            assetPath: relativeAssetPath(path.dirname(outputPath), asset.absolutePath),
          });
          if (options.verbose === true) {
            log(`  ${asset.fromCache ? 'cache' : 'render'}  ${block.rendererType.padEnd(10)} ${asset.relativePath}`);
          }
        } catch (err) {
          const error = toDocVizError(err, {
            file: relativeSource,
            line: block.line,
            renderer: block.rendererType,
          });
          result.errors.push(error);
          if (options.continueOnError !== true) continue;
          log(`  aviso: se conserva el bloque original por error de render (${relativeSource}:${block.line})`);
        }
      }

      // Los documentos solo se escriben si el build va a considerarse valido.
      if (result.errors.length === 0 || options.continueOnError === true) {
        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, applyReplacements(text, replacements), 'utf8');
        result.documents.push({
          source: relativeSource,
          output: toPosix(path.relative(config.rootDir, outputPath)),
          blocks: blocks.length,
        });
        result.stats.documents += 1;
      }
    }

    // Archivos que no son Markdown se copian tal cual (imagenes, adjuntos).
    if (result.errors.length === 0 || options.continueOnError === true) {
      await copyNonMarkdown(sourceDir, outputDir);
    }
  } finally {
    await registry.disposeAll().catch(() => undefined);
  }

  if (result.errors.length > 0 && options.continueOnError !== true) {
    throw new BuildFailedError(result.errors);
  }
  return result;
}

interface RenderBlockArgs {
  block: DiagramBlock;
  config: DocVizConfig;
  registry: RendererRegistry;
  cache: AssetCache;
  hashes: HashRegistry;
  assetsDir: string;
  themeName: string;
  themeFingerprintValue: string;
  theme: ReturnType<typeof getTheme>;
}

async function renderBlock(args: RenderBlockArgs): Promise<RenderedAsset> {
  const { block, config, registry, cache, hashes, assetsDir, theme } = args;
  const renderer = registry.get(block.rendererType);
  const format = resolveFormat(block, config, renderer.defaultFormat);
  const version = await renderer.version();

  const hashInput = {
    rendererType: block.rendererType,
    source: block.source,
    themeName: args.themeName,
    themeFingerprint: args.themeFingerprintValue,
    rendererVersion: version,
    format,
  };
  const digest = fullHash(hashInput);
  const short = shortHash(hashInput, config.hash.length);

  const claim = hashes.claim(short, digest);
  if (!claim.ok) {
    throw new RenderError(
      block.rendererType,
      `colision de hash truncado (${short})`,
      `dos diagramas distintos producen el mismo prefijo de ${config.hash.length} caracteres; sube hash.length en docviz.config.yaml`,
      ERROR_CODES.HASH_COLLISION,
    );
  }

  const fileName = assetFileName(block.title, short, format);
  const absolutePath = assertInside(assetsDir, fileName);
  const relativePath = toPosix(path.relative(path.dirname(assetsDir), absolutePath));

  const cached = await cache.get(digest, format);
  if (cached !== undefined) {
    await writeFile(absolutePath, cached);
    return {
      relativePath,
      absolutePath,
      hash: short,
      format,
      bytes: cached.byteLength,
      fromCache: true,
    };
  }

  const rendered = await renderer.render(block.source, {
    format,
    theme,
    title: block.title,
    timeoutMs: config.renderers.timeoutMs,
    maxOutputBytes: config.renderers.maxOutputBytes,
  });

  await cache.set(digest, format, rendered.content);
  await writeFile(absolutePath, rendered.content);
  return {
    relativePath,
    absolutePath,
    hash: short,
    format,
    bytes: rendered.content.byteLength,
    fromCache: false,
  };
}

function resolveFormat(
  block: DiagramBlock,
  config: DocVizConfig,
  fallback: OutputFormat,
): OutputFormat {
  return block.requestedFormat ?? config.formats[block.rendererType] ?? fallback;
}

function scanBlocks(text: string, registry: RendererRegistry): ScanResult {
  return scanDocument(text, {
    resolveLanguage: (lang) => registry.resolve(lang),
    // El DSL necesita saber que motores hay registrados: si el preferido no
    // esta, compila para el respaldo declarado en lugar de abortar.
    compileDsl: (lang, source) => compileDsl(lang, source, (engine) => registry.has(engine)),
    dslLanguages: DSL_LANGUAGES,
  });
}

function toDocVizError(err: unknown, location: { file?: string; line?: number; renderer?: string }): DocVizError {
  if (err instanceof DocVizError) return err.withLocation(location);
  const message = err instanceof Error ? err.message : String(err);
  return new DocVizError(message, location, err instanceof Error ? err.stack : undefined);
}

// --------------------------------------------------------------------------
// Recorrido del arbol de documentos
// --------------------------------------------------------------------------

export async function collectMarkdown(dir: string): Promise<string[]> {
  const out: string[] = [];
  await walk(dir, (file) => {
    if (MARKDOWN_EXTENSIONS.has(path.extname(file).toLowerCase())) out.push(file);
  });
  return out.sort();
}

async function copyNonMarkdown(sourceDir: string, outputDir: string): Promise<void> {
  const files: string[] = [];
  await walk(sourceDir, (file) => {
    if (!MARKDOWN_EXTENSIONS.has(path.extname(file).toLowerCase())) files.push(file);
  });
  for (const file of files) {
    const target = assertInside(outputDir, path.relative(sourceDir, file));
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(file, target);
  }
}

async function walk(dir: string, onFile: (file: string) => void): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      await walk(full, onFile);
    } else if (entry.isFile()) {
      onFile(full);
    }
  }
}
