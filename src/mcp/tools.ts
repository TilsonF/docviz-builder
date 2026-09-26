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
import { diff as diffTrees } from '../build/diff.js';
import { verify } from '../build/verify.js';
import { loadConfig, resolveFromRoot } from '../config/load.js';
import { DocVizError, BuildFailedError, ERROR_CODES } from '../core/errors.js';
import { parse as parseYaml } from 'yaml';
import {
  compileDsl,
  dslCatalog,
  dslCatalogDetailed,
  findType,
  isDslLanguage,
  unknownFields,
  nestedTyposFromExample,
  type FieldWarning,
} from '../dsl/index.js';
import { TYPE_CATALOG, type TypeSpec } from '../dsl/catalog.js';
import { buildRegistry } from '../renderers/index.js';
import { getTheme, resolveTheme, themeNames } from '../themes/index.js';
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

function describeError(err: unknown): { ok: false; error: string; detail?: string; code?: string } {
  if (err instanceof BuildFailedError) return { ok: false, error: err.message, detail: err.format() };
  if (err instanceof DocVizError) {
    // El codigo va aparte del texto: permite al agente decidir la correccion
    // sin analizar un mensaje escrito para personas.
    const out: { ok: false; error: string; detail?: string; code?: string } = {
      ok: false,
      error: err.message,
      code: err.code,
    };
    const detail = err.format();
    if (detail !== '') out.detail = detail;
    return out;
  }
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}

/** Error estructurado: lo que un agente necesita para corregir sin leer texto. */
function structuredError(err: DocVizError): Record<string, unknown> {
  return {
    code: err.code,
    message: err.message,
    ...(err.location.file !== undefined ? { file: err.location.file } : {}),
    ...(err.location.line !== undefined ? { line: err.location.line } : {}),
    ...(err.location.renderer !== undefined ? { engine: err.location.renderer } : {}),
    ...(err.detail !== undefined ? { detail: err.detail } : {}),
  };
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
          invalidBlocks: result.invalidBlocks,
          findings: result.findings.map((f) => ({ line: f.line, lang: f.lang, engine: f.rendererType, title: f.title })),
          warnings: result.warnings,
          errors: result.errors.map(structuredError),
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
      invalidBlocks: result.invalidBlocks,
      findings: result.findings,
      warnings: result.warnings,
      errors: result.errors.map(structuredError),
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
      warnings: result.warnings,
      verification: { images: report.images, issues: report.issues },
    };
  } catch (err) {
    return describeError(err);
  }
}

/**
 * `docviz_diff`
 *
 * Compara los diagramas de dos versiones de la documentacion. El agente que
 * acaba de reescribir un documento puede comprobar asi que no toco de mas.
 */
export async function diffDocuments(args: {
  cwd?: string;
  base: string;
  head: string;
}): Promise<ToolResult> {
  try {
    const config = await loadConfig(args.cwd !== undefined ? { cwd: args.cwd } : {});
    const result = await diffTrees(
      config,
      path.resolve(config.rootDir, args.base),
      path.resolve(config.rootDir, args.head),
    );
    return {
      ok: true,
      summary: result.summary,
      // Los iguales no se devuelven: son la mayoria y no aportan nada a quien
      // pregunta que cambio.
      entries: result.entries.filter((e) => e.status !== 'unchanged'),
      issues: result.issues,
    };
  } catch (err) {
    return describeError(err);
  }
}

/**
 * `docviz_fix`
 *
 * Recibe un bloque que no compila y devuelve el bloque corregido.
 *
 * No adivina: solo aplica las correcciones que se deducen del propio catalogo
 * —renombrar un campo cuya errata es inequivoca— y vuelve a compilar para decir
 * si con eso basta. Cuando no basta, devuelve el diagnostico y el esqueleto
 * canonico del tipo, que es lo que el agente necesita para reescribirlo.
 *
 * Existe porque el ciclo "falla, lee el error, reintenta" cuesta una llamada al
 * modelo cada vuelta, y la mitad de las vueltas son una letra cambiada de sitio.
 */
export function fixBlock(args: { lang?: string; source: string }): ToolResult {
  const lang = args.lang ?? 'diagram';
  if (!isDslLanguage(lang)) {
    return { ok: false, error: `"${lang}" no es una valla de DocViz`, code: ERROR_CODES.DSL_TYPE };
  }

  const original = args.source;
  const primero = intentar(lang, original);
  if (primero.ok && primero.warnings.length === 0) {
    return { ok: true, cambiado: false, source: original, aplicado: [], nota: 'el bloque ya compilaba' };
  }

  // Las erratas se corrigen sobre el texto, no sobre el YAML ya interpretado:
  // asi se conservan comentarios, orden y sangrado tal como los escribio quien
  // lo redacto. Devolver un bloque reformateado seria devolver otro bloque.
  const aplicado: Array<{ de: string; a: string }> = [];
  let corregido = original;
  for (const aviso of primero.warnings) {
    if (aviso.suggestion === undefined) continue;
    const renombrado = renombrarClave(corregido, aviso.field, aviso.suggestion);
    if (renombrado === undefined) continue;
    corregido = renombrado;
    aplicado.push({ de: aviso.field, a: aviso.suggestion });
  }

  const segundo = intentar(lang, corregido);
  const spec = primero.spec ?? segundo.spec;

  if (segundo.ok && segundo.warnings.length === 0) {
    return { ok: true, cambiado: aplicado.length > 0, source: corregido, aplicado };
  }

  return {
    ok: false,
    cambiado: aplicado.length > 0,
    source: corregido,
    aplicado,
    ...(segundo.error !== undefined ? { error: segundo.error.message, code: segundo.error.code, detail: segundo.error.format() } : {}),
    pendientes: segundo.warnings.map((w) => w.message),
    ...(spec !== undefined ? { ejemplo: `\`\`\`${spec.lang}\n${spec.example}\n\`\`\`` } : {}),
  };
}

interface Intento {
  ok: boolean;
  warnings: FieldWarning[];
  error?: DocVizError;
  spec?: TypeSpec;
}

function intentar(lang: string, source: string): Intento {
  try {
    const compiled = compileDsl(lang, source);
    const salida: Intento = { ok: true, warnings: [...(compiled.warnings ?? [])] };
    if (compiled.spec !== undefined) salida.spec = compiled.spec;
    return salida;
  } catch (err) {
    const salida: Intento = { ok: false, warnings: [] };
    if (err instanceof DocVizError) salida.error = err;

    // Aunque no compile, se puede saber de que tipo hablaba para devolver su
    // ejemplo y para detectar las erratas: es justo el caso en el que hacen
    // falta, porque la errata suele ser la causa del fallo.
    const declarado = /^\s*type:\s*(\S+)/m.exec(source)?.[1];
    const spec = declarado === undefined ? undefined : findType(declarado);
    if (spec !== undefined) {
      salida.spec = spec;
      try {
        const doc = parseYaml(source) as Record<string, unknown> | null;
        if (doc !== null && typeof doc === 'object' && !Array.isArray(doc)) {
          // Tambien las erratas anidadas: si el campo mal escrito era
          // obligatorio, el compilador lanzo y no hay rastreador de accesos,
          // que es de donde salen normalmente.
          salida.warnings = [...unknownFields(doc, spec), ...nestedTyposFromExample(doc, spec)];
        }
      } catch {
        // YAML invalido: no hay campos que analizar, solo el error de sintaxis.
      }
    }
    return salida;
  }
}

/**
 * Renombra una clave de YAML conservando el resto del texto.
 *
 * Se niega si el destino ya existe: fusionar dos claves no es una correccion,
 * es perder una de las dos.
 */
function renombrarClave(texto: string, de: string, a: string): string | undefined {
  const escapado = de.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // El guion de lista se CAPTURA y se devuelve. Antes era un grupo sin
  // capturar, asi que renombrar una clave dentro de una lista se lo comia:
  // «  - labl: A» salia como «  label: A» y el bloque dejaba de ser YAML
  // valido. `fix` devolvia algo peor que lo que recibio.
  const origen = new RegExp(`^(\\s*)(- )?${escapado}(\\s*:)`, 'm');
  if (!origen.test(texto)) return undefined;
  if (new RegExp(`^\\s*(?:- )?${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`, 'm').test(texto)) return undefined;
  return texto.replace(
    origen,
    (_m, sangria: string, guion: string | undefined, dosPuntos: string) =>
      `${sangria}${guion ?? ''}${a}${dosPuntos}`,
  );
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
    const theme = resolveTheme(config);

    // El `type` puede ser un tipo del DSL o directamente un motor.
    const registry = buildRegistry(config);
    let rendererType: string;
    let source: string;
    let title = args.title;

    let warnings: ReadonlyArray<{ code: string; field: string; message: string }> = [];

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
      warnings = compiled.warnings ?? [];
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
        ...(warnings.length > 0 ? { warnings } : {}),
      };
    }

    return {
      ok: true,
      engine: rendererType,
      format,
      bytes: rendered.content.byteLength,
      content: format === 'svg' ? rendered.content.toString('utf8') : rendered.content.toString('base64'),
      encoding: format === 'svg' ? 'utf8' : 'base64',
      ...(warnings.length > 0 ? { warnings } : {}),
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

/**
 * `docviz_types`: catalogo de tipos y temas.
 *
 * Devuelve el proposito y el cuando usar de cada tipo, no solo su nombre: un
 * listado de nombres obliga a adivinar, y adivinar es justo lo que se quiere
 * evitar.
 */
export function listTypes(args: { detailed?: boolean } = {}): ToolResult {
  if (args.detailed === false) {
    return { ok: true, ...dslCatalog(), themes: themeNames() };
  }
  return {
    ok: true,
    themes: themeNames(),
    types: dslCatalogDetailed().map((spec) => ({
      type: spec.type,
      lang: spec.lang,
      engine: spec.engine,
      fallbacks: spec.fallbacks ?? [],
      aliases: spec.aliases ?? [],
      purpose: spec.purpose,
      whenToUse: spec.whenToUse,
      whenNotToUse: spec.whenNotToUse,
      example: spec.example,
    })),
  };
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

// --------------------------------------------------------------------------
// Recomendacion de tipo
// --------------------------------------------------------------------------

/**
 * `docviz_suggest`
 *
 * Recibe una frase con lo que se quiere explicar y devuelve los tipos mas
 * adecuados, con su esqueleto listo para rellenar.
 *
 * Existe porque recordar cuarenta y tantos tipos no es razonable, ni para una
 * persona ni para un modelo. Consultar es mas fiable que recordar, y el
 * esqueleto evita el segundo error habitual: acertar el tipo y equivocarse en
 * la forma.
 */
export function suggestType(args: { need: string; limit?: number }): ToolResult {
  const need = (args.need ?? '').trim();
  if (need === '') {
    return { ok: false, error: 'describe en una frase que quieres explicar' };
  }

  const terms = tokenize(need);
  const scored = TYPE_CATALOG.map((spec) => ({ spec, score: score(spec, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.spec.type.localeCompare(b.spec.type));

  const limit = Math.min(Math.max(args.limit ?? 3, 1), 8);
  const matches = scored.slice(0, limit);

  if (matches.length === 0) {
    return {
      ok: true,
      need,
      matches: [],
      // Sin coincidencia, la respuesta util no es una lista larga sino un aviso:
      // muchas veces la respuesta correcta es no dibujar nada.
      advice:
        'Ninguna intencion del catalogo encaja claramente. Comprueba si una tabla o un parrafo ' +
        'comunican mejor; si aun asi quieres un diagrama, consulta docviz_types.',
    };
  }

  return {
    ok: true,
    need,
    matches: matches.map(({ spec }) => ({
      type: spec.type,
      lang: spec.lang,
      engine: spec.engine,
      purpose: spec.purpose,
      whenToUse: spec.whenToUse,
      whenNotToUse: spec.whenNotToUse,
      block: `\`\`\`${spec.lang}\n${spec.example}\n\`\`\``,
    })),
  };
}

const STOP_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'y', 'o', 'que',
  'como', 'para', 'por', 'con', 'sin', 'en', 'se', 'su', 'sus', 'lo', 'es', 'son', 'quiero',
  'necesito', 'mostrar', 'explicar', 'dibujar', 'diagrama', 'grafico', 'the', 'a', 'of', 'to',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Cuantos tipos del catalogo usan cada palabra.
 *
 * Es lo que separa una senal de un ruido. "componente" aparece en la prosa de
 * media docena de tipos, asi que encontrarla en la peticion no distingue nada;
 * "embudo" aparece en uno. Sin esta correccion, una peticion larga acumulaba un
 * punto por cada palabra generica en cada tipo y enterraba al unico que
 * importaba: era la causa de los cuatro fallos que el eval no lograba explicar.
 */
interface Frecuencias {
  prosa: Map<string, number>;
  total: number;
}

let frecuencias: Frecuencias | undefined;

/**
 * Prosa del tipo en los dos idiomas.
 *
 * Se concatenan a proposito en lugar de elegir uno: la peticion puede venir en
 * cualquiera de los dos —y a menudo mezclada, con el termino tecnico en ingles
 * dentro de una frase en español— y detectar el idioma para luego acertar solo
 * a veces seria peor que mirar en ambos.
 */
function prosaDe(spec: {
  purpose: string;
  whenToUse: string;
  en?: { purpose: string; whenToUse: string };
}): string {
  const ingles = spec.en === undefined ? '' : ` ${spec.en.purpose} ${spec.en.whenToUse}`;
  return `${spec.purpose} ${spec.whenToUse}${ingles}`;
}

function calcularFrecuencias(): Frecuencias {
  if (frecuencias !== undefined) return frecuencias;
  const prosa = new Map<string, number>();
  for (const spec of TYPE_CATALOG) {
    for (const t of new Set(tokenize(prosaDe(spec)))) prosa.set(t, (prosa.get(t) ?? 0) + 1);
  }

  frecuencias = { prosa, total: TYPE_CATALOG.length };
  return frecuencias;
}

/**
 * Peso de una palabra: 1 si es casi exclusiva de un tipo, cerca de 0 si la usan
 * todos. Se acota por abajo para que una palabra muy comun siga sumando algo.
 */
function peso(termino: string, frecuencia: Map<string, number>, total: number): number {
  const df = frecuencia.get(termino) ?? 0;
  if (df === 0) return 1;
  const valor = Math.log(total / (1 + df)) / Math.log(total);
  return Math.max(0.05, Math.min(1, valor));
}

/**
 * Puntua un tipo frente a los terminos de la peticion.
 *
 * Las palabras clave pesan mas que el texto libre: son las que el catalogo
 * declara a proposito para este uso, mientras que una coincidencia en la
 * descripcion puede ser casual. Y dentro de cada categoria, cada palabra pesa
 * segun lo especifica que sea (ver `calcularFrecuencias`).
 */
function score(
  spec: {
    type: string;
    keywords: readonly string[];
    purpose: string;
    whenToUse: string;
    en?: { purpose: string; whenToUse: string };
  },
  terms: readonly string[],
): number {
  if (terms.length === 0) return 0;
  const { prosa: dfProsa, total } = calcularFrecuencias();
  const keywords = spec.keywords.map((k) => k.toLowerCase());
  const tokensProsa = new Set(tokenize(prosaDe(spec)));
  const name = spec.type.toLowerCase();

  let total_ = 0;
  for (const term of terms) {
    if (name.includes(term)) total_ += 6;
    if (keywords.some((k) => k === term)) total_ += 5;
    else if (keywords.some((k) => k.includes(term) || term.includes(k))) total_ += 3;
    // Coincidencia por raiz: quien escribe "interactuan" se refiere a
    // "interaccion", y exigir la forma exacta desaprovecha el catalogo.
    else if (keywords.some((k) => sharePrefix(k, term))) total_ += 2;
    // Solo la prosa se pondera. Una palabra clave la puso alguien a proposito
    // para este tipo; una coincidencia en la descripcion puede ser casual, y
    // cuanto mas comun sea la palabra, mas probable es que lo sea.
    if (tokensProsa.has(term)) total_ += peso(term, dfProsa, total);
  }
  return total_;
}

/** Dos palabras comparten raiz si coinciden en sus primeros seis caracteres. */
function sharePrefix(a: string, b: string): boolean {
  const n = 6;
  return a.length >= n && b.length >= n && a.slice(0, n) === b.slice(0, n);
}
