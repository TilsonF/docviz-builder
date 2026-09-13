/**
 * Deteccion de bloques declarativos dentro de un documento Markdown.
 *
 * El analisis se hace con `unified` + `remark` sobre el AST (mdast), no con
 * expresiones regulares (seccion 13). Las regex que aparecen aqui operan sobre
 * el `meta` de una valla ya identificada por el parser, no sobre el documento.
 */

import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { toString as mdastToString } from 'mdast-util-to-string';
import type { Code, Heading, Root } from 'mdast';
import type { DiagramBlock, OutputFormat } from '../core/types.js';

export interface CompiledBlock {
  rendererType: string;
  source: string;
  title?: string;
  /** Campos declarados que el compilador no uso. */
  warnings?: ReadonlyArray<{ code: string; field: string; message: string }>;
}

export interface ScanContext {
  /** Devuelve el tipo canonico de renderer para un lenguaje, o `undefined`. */
  resolveLanguage(lang: string): string | undefined;
  /** Compila el DSL de alto nivel. Solo se invoca para lenguajes de DSL. */
  compileDsl?(lang: string, source: string): CompiledBlock;
  /** Lenguajes de DSL de alto nivel (`diagram`, `chart`, `architecture`). */
  dslLanguages: readonly string[];
}

/** Bloque que no se pudo compilar, con la linea en la que empieza su valla. */
export interface ScanIssue {
  line: number;
  lang: string;
  error: unknown;
}

/** Aviso localizado: el bloque compila, pero parte de lo escrito no se dibuja. */
export interface ScanWarning {
  line: number;
  lang: string;
  code: string;
  field: string;
  message: string;
}

export interface ScanResult {
  tree: Root;
  blocks: DiagramBlock[];
  /**
   * Errores de compilacion del DSL, uno por bloque.
   *
   * El escaneo no aborta al primero: un documento con tres bloques rotos debe
   * reportar los tres, o corregirlos cuesta tres builds completos.
   */
  errors: ScanIssue[];
  warnings: ScanWarning[];
}

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml', 'toml'])
  .use(remarkGfm);

export function parseMarkdown(text: string): Root {
  return processor.parse(text) as Root;
}

/**
 * Recorre el documento y devuelve los bloques compilables en orden de aparicion.
 *
 * Los bloques cuyo lenguaje no esta registrado (`typescript`, `bash`, `json`,
 * vallas sin lenguaje) se dejan intactos: no aparecen en el resultado.
 */
export function scanDocument(text: string, context: ScanContext): ScanResult {
  const tree = parseMarkdown(text);
  const blocks: DiagramBlock[] = [];
  const errors: ScanIssue[] = [];
  const warnings: ScanWarning[] = [];

  // Encabezados con su offset, para deducir el titulo del diagrama siguiente.
  const headings: Array<{ offset: number; text: string }> = [];
  visit(tree, 'heading', (node: Heading) => {
    const offset = node.position?.start.offset;
    if (offset === undefined) return;
    const value = mdastToString(node).trim();
    if (value !== '') headings.push({ offset, text: value });
  });

  visit(tree, 'code', (node: Code) => {
    const lang = (node.lang ?? '').trim().toLowerCase();
    if (lang === '') return;

    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    const line = node.position?.start.line;
    if (start === undefined || end === undefined || line === undefined) return;

    const isDsl = context.dslLanguages.includes(lang);
    const rendererFromLang = context.resolveLanguage(lang);
    if (!isDsl && rendererFromLang === undefined) return;

    const meta = parseMeta(node.meta ?? undefined);
    const rawSource = node.value;

    let rendererType: string;
    let source: string;
    let dslTitle: string | undefined;

    if (isDsl) {
      if (context.compileDsl === undefined) return;
      let compiled: CompiledBlock;
      try {
        compiled = context.compileDsl(lang, rawSource);
      } catch (err) {
        errors.push({ line, lang, error: err });
        return;
      }
      rendererType = compiled.rendererType;
      source = compiled.source;
      dslTitle = compiled.title;
      for (const w of compiled.warnings ?? []) {
        warnings.push({ line, lang, code: w.code, field: w.field, message: w.message });
      }
    } else {
      rendererType = rendererFromLang!;
      source = rawSource;
    }

    const title =
      meta.title ??
      dslTitle ??
      nearestHeading(headings, start) ??
      defaultTitle(lang);

    const block: DiagramBlock = {
      lang,
      rendererType,
      source,
      rawSource,
      title,
      start,
      end,
      line,
    };
    if (meta.format !== undefined) block.requestedFormat = meta.format;
    blocks.push(block);
  });

  blocks.sort((a, b) => a.start - b.start);
  errors.sort((a, b) => a.line - b.line);
  warnings.sort((a, b) => a.line - b.line);
  return { tree, blocks, errors, warnings };
}

export interface FenceMeta {
  title?: string;
  format?: OutputFormat;
}

/**
 * Opciones escritas junto al lenguaje de la valla:
 *
 *     ```plantuml title="Flujo de autenticacion" format=svg
 */
export function parseMeta(meta: string | undefined): FenceMeta {
  const out: FenceMeta = {};
  if (meta === undefined || meta.trim() === '') return out;

  const attrRe = /(\w[\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(meta)) !== null) {
    const key = m[1]!.toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    if (key === 'title' || key === 'alt') out.title = value;
    else if (key === 'format' && (value === 'svg' || value === 'png')) out.format = value;
  }
  return out;
}

function nearestHeading(headings: Array<{ offset: number; text: string }>, offset: number): string | undefined {
  let best: string | undefined;
  for (const h of headings) {
    if (h.offset < offset) best = h.text;
    else break;
  }
  return best;
}

function defaultTitle(lang: string): string {
  const names: Record<string, string> = {
    plantuml: 'Diagrama UML',
    mermaid: 'Diagrama de flujo',
    d2: 'Diagrama',
    graphviz: 'Grafo de dependencias',
    'vega-lite': 'Grafico',
    likec4: 'Arquitectura',
    diagram: 'Diagrama',
    chart: 'Grafico',
    architecture: 'Arquitectura',
  };
  return names[lang] ?? 'Diagrama';
}
