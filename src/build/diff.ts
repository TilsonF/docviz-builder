/**
 * Comparacion de dos arboles de documentos.
 *
 * Responde a una pregunta que el build no responde: **que diagramas cambiaron**
 * entre dos versiones de la documentacion. En una revision de codigo, el
 * diff de un `.md` muestra que se toco un bloque YAML, pero no si el dibujo
 * resultante es distinto; y el nombre del recurso generado cambia tambien
 * cuando solo cambio el tema o la version del motor.
 *
 * Por eso la identidad que se compara aqui no es la del recurso, sino la del
 * contenido efectivo: `motor + fuente compilada`. Un cambio de tema no aparece
 * como cambio de diagrama, y reordenar el YAML sin alterar el resultado
 * tampoco.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fingerprint } from '../core/hash.js';
import { toPosix } from '../core/paths.js';
import { compileDsl, DSL_LANGUAGES } from '../dsl/index.js';
import { scanDocument } from '../markdown/scan.js';
import { buildRegistry } from '../renderers/index.js';
import type { RendererRegistry } from '../core/registry.js';
import type { DocVizConfig } from '../config/types.js';
import { collectMarkdown } from './builder.js';

export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface DiffEntry {
  status: DiffStatus;
  /** Ruta del documento, relativa al directorio comparado. */
  file: string;
  title: string;
  /** Linea en head; para un diagrama eliminado, la que tenia en base. */
  line: number;
  lang: string;
  engine: string;
  /** Motor anterior, presente solo si cambio. */
  previousEngine?: string;
  baseHash?: string;
  headHash?: string;
}

/** Bloque que no se pudo interpretar en uno de los dos lados. */
export interface DiffIssue {
  side: 'base' | 'head';
  file: string;
  line: number;
  message: string;
}

export interface DiffResult {
  base: string;
  head: string;
  entries: DiffEntry[];
  issues: DiffIssue[];
  summary: { added: number; removed: number; changed: number; unchanged: number };
}

interface InventoryEntry {
  file: string;
  title: string;
  line: number;
  lang: string;
  engine: string;
  hash: string;
}

/**
 * Compara los diagramas de `baseDir` con los de `headDir`.
 *
 * No renderiza: compila el DSL y se queda con la fuente que recibiria el motor.
 * Un lado invalido no aborta la comparacion —la version antigua puede estar
 * rota y aun asi interesa saber que cambio— pero sus bloques se reportan.
 */
export async function diff(config: DocVizConfig, baseDir: string, headDir: string): Promise<DiffResult> {
  const registry = buildRegistry(config);
  try {
    const base = await inventory(baseDir, registry, 'base');
    const head = await inventory(headDir, registry, 'head');

    const entries: DiffEntry[] = [];
    const summary = { added: 0, removed: 0, changed: 0, unchanged: 0 };

    for (const [key, headEntry] of head.entries) {
      const baseEntry = base.entries.get(key);
      if (baseEntry === undefined) {
        entries.push({ status: 'added', ...describe(headEntry), headHash: headEntry.hash });
        summary.added += 1;
        continue;
      }
      if (baseEntry.hash === headEntry.hash && baseEntry.engine === headEntry.engine) {
        entries.push({
          status: 'unchanged',
          ...describe(headEntry),
          baseHash: baseEntry.hash,
          headHash: headEntry.hash,
        });
        summary.unchanged += 1;
        continue;
      }
      entries.push({
        status: 'changed',
        ...describe(headEntry),
        ...(baseEntry.engine !== headEntry.engine ? { previousEngine: baseEntry.engine } : {}),
        baseHash: baseEntry.hash,
        headHash: headEntry.hash,
      });
      summary.changed += 1;
    }

    for (const [key, baseEntry] of base.entries) {
      if (head.entries.has(key)) continue;
      entries.push({ status: 'removed', ...describe(baseEntry), baseHash: baseEntry.hash });
      summary.removed += 1;
    }

    entries.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));

    return {
      base: toPosix(baseDir),
      head: toPosix(headDir),
      entries,
      issues: [...base.issues, ...head.issues],
      summary,
    };
  } finally {
    await registry.disposeAll().catch(() => undefined);
  }
}

/** `true` si algo cambio entre las dos versiones. */
export function hasChanges(result: DiffResult): boolean {
  return result.summary.added + result.summary.removed + result.summary.changed > 0;
}

function describe(entry: InventoryEntry): { file: string; title: string; line: number; lang: string; engine: string } {
  return { file: entry.file, title: entry.title, line: entry.line, lang: entry.lang, engine: entry.engine };
}

/**
 * Recorre un directorio y devuelve sus diagramas indexados.
 *
 * La clave es `archivo::titulo::repeticion`. Usar el titulo y no la linea es
 * deliberado: insertar un parrafo desplaza todos los bloques del documento, y
 * un diff que marca doce diagramas como nuevos por eso no sirve de nada.
 */
async function inventory(
  dir: string,
  registry: RendererRegistry,
  side: 'base' | 'head',
): Promise<{ entries: Map<string, InventoryEntry>; issues: DiffIssue[] }> {
  const entries = new Map<string, InventoryEntry>();
  const issues: DiffIssue[] = [];
  const files = await collectMarkdown(dir);

  for (const file of files) {
    const relative = toPosix(path.relative(dir, file));
    const text = await readFile(file, 'utf8');
    const scanned = scanDocument(text, {
      resolveLanguage: (lang) => registry.resolve(lang),
      compileDsl: (lang, source) => compileDsl(lang, source, (engine) => registry.has(engine)),
      dslLanguages: DSL_LANGUAGES,
    });

    for (const issue of scanned.errors) {
      issues.push({
        side,
        file: relative,
        line: issue.line,
        message: issue.error instanceof Error ? issue.error.message : String(issue.error),
      });
    }

    const seen = new Map<string, number>();
    for (const block of scanned.blocks) {
      const base = `${relative}::${block.title}`;
      const occurrence = (seen.get(base) ?? 0) + 1;
      seen.set(base, occurrence);
      entries.set(`${base}::${occurrence}`, {
        file: relative,
        title: block.title,
        line: block.line,
        lang: block.lang,
        engine: block.rendererType,
        hash: fingerprint({ engine: block.rendererType, source: block.source }),
      });
    }
  }

  return { entries, issues };
}

/** Reporte legible, en el orden en que aparecen los documentos. */
export function formatDiff(result: DiffResult, options: { all?: boolean } = {}): string {
  const marks: Record<DiffStatus, string> = { added: '+', removed: '-', changed: '~', unchanged: ' ' };
  const shown = result.entries.filter((e) => options.all === true || e.status !== 'unchanged');

  const lines = ['', `base: ${result.base}`, `head: ${result.head}`, ''];
  if (shown.length === 0) {
    lines.push('  sin cambios en los diagramas');
  } else {
    const width = Math.max(...shown.map((e) => `${e.file}:${e.line}`.length));
    for (const entry of shown) {
      const motor = entry.previousEngine === undefined ? entry.engine : `${entry.previousEngine} -> ${entry.engine}`;
      lines.push(`  ${marks[entry.status]} ${`${entry.file}:${entry.line}`.padEnd(width)}  "${entry.title}"  (${entry.lang}, ${motor})`);
    }
  }

  const { added, removed, changed, unchanged } = result.summary;
  lines.push('', `resumen: ${added} nuevo(s), ${removed} eliminado(s), ${changed} modificado(s), ${unchanged} igual(es)`);

  for (const issue of result.issues) {
    lines.push(`AVISO [${issue.side}] ${issue.file}:${issue.line} no se pudo interpretar: ${issue.message}`);
  }
  lines.push('');
  return lines.join('\n');
}
