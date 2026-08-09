/**
 * Logica de las herramientas MCP, independiente del transporte.
 *
 * Se separa del servidor para poder probarla sin levantar stdio, y para que la
 * misma implementacion sirva a cualquier otro adaptador.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build, check } from '../build/builder.js';
import { verify } from '../build/verify.js';
import { loadConfig, resolveFromRoot } from '../config/load.js';
import { DocVizError, BuildFailedError } from '../core/errors.js';
import { compileDsl, dslCatalog, isDslLanguage } from '../dsl/index.js';
import { buildRegistry } from '../renderers/index.js';
import { getTheme } from '../themes/index.js';
import { toPosix } from '../core/paths.js';

export interface ToolResult {
  ok: boolean;
  [key: string]: unknown;
}

/** Tipos que el agente puede pedir a `docviz_render_diagram`. */
export function renderableTypes(): string[] {
  const catalog = dslCatalog();
  return [...catalog.diagram, ...catalog.chart, ...catalog.architecture].sort();
}

function describeError(err: unknown): { ok: false; error: string; detail?: string } {
  if (err instanceof BuildFailedError) return { ok: false, error: err.message, detail: err.format() };
  if (err instanceof DocVizError) {
    const out: { ok: false; error: string; detail?: string } = { ok: false, error: err.message };
    const detail = err.format();
    if (detail !== '') out.detail = detail;
    return out;
  }
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}

/**
 * `docviz_validate_document`
 *
 * Valida los bloques de un documento (o de todo el directorio fuente) sin
 * renderizar. Es la herramienta que un agente debe llamar antes de dar por
 * escrita la documentacion.
 */
export async function validateDocument(args: {
  cwd?: string;
  source?: string;
  content?: string;
}): Promise<ToolResult> {
  try {
    // Con `content` se valida un texto en memoria a traves de un directorio
    // temporal: el agente puede comprobar lo que acaba de escribir sin tocar
    // el repositorio.
    if (args.content !== undefined) {
      const dir = await mkdtemp(path.join(tmpdir(), 'docviz-mcp-'));
      try {
        const src = path.join(dir, 'docs-src');
        await writeFile(path.join(await ensureDir(src), 'documento.md'), args.content, 'utf8');
        const config = await loadConfig({ cwd: dir });
        config.rootDir = dir;
        const result = await check(config);
        return {
          ok: result.errors.length === 0,
          blocks: result.blocks,
          findings: result.findings.map((f) => ({ line: f.line, lang: f.lang, engine: f.rendererType, title: f.title })),
          errors: result.errors.map((e) => e.format()),
        };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }

    const config = await loadConfig({
      cwd: args.cwd,
      overrides: args.source !== undefined ? { source: args.source } : {},
    });
    const result = await check(config);
    return {
      ok: result.errors.length === 0,
      documents: result.documents,
      blocks: result.blocks,
      findings: result.findings,
      errors: result.errors.map((e) => e.format()),
    };
  } catch (err) {
    return describeError(err);
  }
}

/**
 * `docviz_build_document`
 *
 * Compila el directorio fuente y devuelve el resumen: documentos escritos,
 * diagramas generados y aciertos de cache.
 */
export async function buildDocuments(args: {
  cwd?: string;
  source?: string;
  output?: string;
  theme?: string;
  clean?: boolean;
}): Promise<ToolResult> {
  try {
    const config = await loadConfig({
      cwd: args.cwd,
      overrides: {
        ...(args.source !== undefined ? { source: args.source } : {}),
        ...(args.output !== undefined ? { output: args.output } : {}),
        ...(args.theme !== undefined ? { theme: args.theme } : {}),
      },
    });
    const result = await build(config, { clean: args.clean === true });
    const report = await verify(resolveFromRoot(config, config.output));
    return {
      ok: true,
      stats: result.stats,
      documents: result.documents,
      assets: result.assets.map((a) => ({ path: a.relativePath, format: a.format, fromCache: a.fromCache })),
      verification: { images: report.images, issues: report.issues },
    };
  } catch (err) {
    return describeError(err);
  }
}

/**
 * `docviz_render_diagram`
 *
 * Renderiza un unico diagrama declarativo y devuelve el recurso. El agente
 * describe la intencion (`uml-sequence`, `strategy-tree`, `bar`...) y DocViz
 * elige el motor.
 */
export async function renderDiagram(args: {
  type: string;
  source: string;
  theme?: string;
  cwd?: string;
  /** Directorio donde escribir el recurso. Si se omite, se devuelve en linea. */
  outputDir?: string;
  title?: string;
}): Promise<ToolResult> {
  try {
    const config = await loadConfig({
      cwd: args.cwd,
      overrides: args.theme !== undefined ? { theme: args.theme } : {},
    });
    const theme = getTheme(config.theme.name);

    // El `type` puede ser un tipo del DSL o directamente un motor.
    const registry = buildRegistry(config);
    let rendererType: string;
    let source: string;
    let title = args.title;

    const directEngine = registry.resolve(args.type);
    if (directEngine !== undefined) {
      rendererType = directEngine;
      source = args.source;
    } else {
      const lang = languageForType(args.type);
      if (lang === undefined) {
        return {
          ok: false,
          error: `el tipo "${args.type}" no existe`,
          detail: `tipos validos: ${renderableTypes().join(', ')}`,
        };
      }
      const compiled = compileDsl(lang, prependType(args.type, args.source, lang));
      rendererType = compiled.rendererType;
      source = compiled.source;
      title ??= compiled.title;
    }

    const renderer = registry.get(rendererType);
    const format = config.formats[rendererType] ?? renderer.defaultFormat;
    const rendered = await renderer.render(source, {
      format,
      theme,
      ...(title !== undefined ? { title } : {}),
      timeoutMs: config.renderers.timeoutMs,
      maxOutputBytes: config.renderers.maxOutputBytes,
    });
    await registry.disposeAll().catch(() => undefined);

    if (args.outputDir !== undefined) {
      const dir = path.resolve(config.rootDir, args.outputDir);
      await ensureDir(dir);
      const name = `${(title ?? rendererType).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${format}`;
      const target = path.join(dir, name);
      await writeFile(target, rendered.content);
      return {
        ok: true,
        engine: rendererType,
        format,
        path: toPosix(path.relative(config.rootDir, target)),
        bytes: rendered.content.byteLength,
      };
    }

    return {
      ok: true,
      engine: rendererType,
      format,
      bytes: rendered.content.byteLength,
      content: format === 'svg' ? rendered.content.toString('utf8') : rendered.content.toString('base64'),
      encoding: format === 'svg' ? 'utf8' : 'base64',
    };
  } catch (err) {
    return describeError(err);
  }
}

/**
 * `docviz_preview`
 *
 * Devuelve el Markdown compilado y la lista de recursos referenciados, para que
 * el agente pueda comprobar el resultado sin abrir un navegador.
 */
export async function previewDocument(args: {
  cwd?: string;
  output?: string;
  document?: string;
}): Promise<ToolResult> {
  try {
    const config = await loadConfig({
      cwd: args.cwd,
      overrides: args.output !== undefined ? { output: args.output } : {},
    });
    const outputDir = resolveFromRoot(config, config.output);
    const report = await verify(outputDir);

    if (args.document === undefined) {
      return {
        ok: report.issues.length === 0 && report.residualBlocks.length === 0,
        documents: report.documents,
        images: report.images,
        issues: report.issues,
        residualBlocks: report.residualBlocks,
      };
    }

    const target = path.resolve(outputDir, args.document);
    if (path.relative(outputDir, target).startsWith('..')) {
      return { ok: false, error: 'el documento pedido esta fuera del directorio de salida' };
    }
    const markdown = await readFile(target, 'utf8');
    return {
      ok: report.issues.length === 0,
      document: toPosix(path.relative(outputDir, target)),
      markdown,
      issues: report.issues.filter((i) => i.file === toPosix(path.relative(outputDir, target))),
    };
  } catch (err) {
    return describeError(err);
  }
}

/** `docviz_types`: catalogo de tipos y temas disponibles. */
export function listTypes(): ToolResult {
  return { ok: true, ...dslCatalog(), themes: Object.keys({ default: 0, corporate: 0, executive: 0, dark: 0 }) };
}

/** Determina a que valla de DSL pertenece un tipo. */
function languageForType(type: string): 'diagram' | 'chart' | 'architecture' | undefined {
  const catalog = dslCatalog();
  const normalized = type.trim().toLowerCase();
  if (catalog.diagram.includes(normalized)) return 'diagram';
  if (catalog.chart.includes(normalized)) return 'chart';
  if (catalog.architecture.includes(normalized)) return 'architecture';
  if (isDslLanguage(normalized)) return normalized;
  return undefined;
}

/**
 * El agente envia el cuerpo sin la linea `type:`; se le antepone para que el
 * compilador del DSL reciba un documento completo.
 */
function prependType(type: string, source: string, lang: string): string {
  if (/^\s*type\s*:/m.test(source)) return source;
  if (isDslLanguage(type) && type === lang) return source;
  return `type: ${type}\n${source}`;
}

async function ensureDir(dir: string): Promise<string> {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(dir, { recursive: true });
  return dir;
}
