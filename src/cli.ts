/**
 * Interfaz de linea de comandos (seccion 17).
 *
 *   docviz build <source> --output <target> [--theme ...] [--clean] ...
 *   docviz check <source>
 *   docviz verify <output>
 *   docviz preview <output>
 *   docviz types
 */

import path from 'node:path';
import { Command } from 'commander';
import { build, check } from './build/builder.js';
import { startPreview } from './build/preview.js';
import { verify } from './build/verify.js';
import { loadConfig, resolveFromRoot } from './config/load.js';
import { BuildFailedError, DocVizError } from './core/errors.js';
import { dslCatalog } from './dsl/index.js';
import { themeNames } from './themes/index.js';
import type { RendererBackend } from './config/types.js';

const VERSION = '0.1.0';

export function createProgram(): Command {
  const program = new Command();
  program
    .name('docviz')
    .description('Compila bloques declarativos de diagramas dentro de Markdown a imagenes SVG/PNG.')
    .version(VERSION);

  program
    .command('build')
    .description('compila los documentos de <source> hacia el directorio de salida')
    .argument('[source]', 'directorio de documentos fuente')
    .option('-o, --output <dir>', 'directorio de salida')
    .option('-t, --theme <name>', `tema visual (${themeNames().join(', ')})`)
    .option('-c, --config <file>', 'archivo de configuracion')
    .option('--clean', 'borra el directorio de salida antes de compilar', false)
    .option('--verbose', 'muestra cada diagrama procesado', false)
    .option('--no-cache', 'ignora el cache y vuelve a renderizar todo')
    .option('--renderer-url <url>', 'URL de una instancia Kroki self-hosted')
    .option('--backend <backend>', 'backend por defecto: local | kroki')
    .option('--continue-on-error', 'no aborta ante un diagrama invalido', false)
    .action(async (source: string | undefined, opts: BuildCliOptions) => {
      const config = await loadConfig({
        configPath: opts.config,
        overrides: {
          ...(source !== undefined ? { source } : {}),
          ...(opts.output !== undefined ? { output: opts.output } : {}),
          ...(opts.theme !== undefined ? { theme: opts.theme } : {}),
          ...(opts.cache === false ? { cacheEnabled: false } : {}),
          ...(opts.rendererUrl !== undefined ? { krokiUrl: opts.rendererUrl } : {}),
          ...(opts.backend !== undefined ? { backend: opts.backend } : {}),
        },
      });

      const started = Date.now();
      const result = await build(config, {
        clean: opts.clean,
        verbose: opts.verbose,
        continueOnError: opts.continueOnError,
        onLog: (m) => process.stdout.write(`${m}\n`),
      });

      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      process.stdout.write(
        [
          '',
          `documentos:      ${result.stats.documents}`,
          `diagramas:       ${result.stats.blocks}`,
          `regenerados:     ${result.stats.generated}`,
          `cache hits:      ${result.stats.cacheHits}`,
          `salida:          ${path.relative(process.cwd(), resolveFromRoot(config, config.output))}`,
          `tema:            ${config.theme.name}`,
          `tiempo:          ${elapsed}s`,
          '',
        ].join('\n'),
      );

      if (result.errors.length > 0) {
        process.stderr.write(`\n${result.errors.map((e) => e.format()).join('\n\n')}\n`);
        process.stderr.write(`\n${result.errors.length} diagrama(s) fallaron (--continue-on-error activo)\n`);
        process.exitCode = 1;
      }
    });

  program
    .command('check')
    .description('valida los bloques declarativos sin renderizar')
    .argument('[source]', 'directorio de documentos fuente')
    .option('-c, --config <file>', 'archivo de configuracion')
    .option('--verbose', 'lista cada bloque detectado', false)
    .action(async (source: string | undefined, opts: { config?: string; verbose?: boolean }) => {
      const config = await loadConfig({
        configPath: opts.config,
        overrides: source !== undefined ? { source } : {},
      });
      const result = await check(config);

      if (opts.verbose === true) {
        for (const f of result.findings) {
          process.stdout.write(`  ${f.file}:${f.line}  ${f.lang} -> ${f.rendererType}  "${f.title}"\n`);
        }
      }
      process.stdout.write(
        `\ndocumentos: ${result.documents}\nbloques:    ${result.blocks}\nerrores:    ${result.errors.length}\n`,
      );
      if (result.errors.length > 0) {
        process.stderr.write(`\n${result.errors.map((e) => e.format()).join('\n\n')}\n`);
        process.exitCode = 1;
        return;
      }
      process.stdout.write('\ncheck OK\n');
    });

  program
    .command('verify')
    .description('comprueba que el Markdown compilado no tenga imagenes rotas')
    .argument('[output]', 'directorio de salida a verificar')
    .option('-c, --config <file>', 'archivo de configuracion')
    .action(async (output: string | undefined, opts: { config?: string }) => {
      const config = await loadConfig({
        configPath: opts.config,
        overrides: output !== undefined ? { output } : {},
      });
      const dir = resolveFromRoot(config, config.output);
      const result = await verify(dir);

      process.stdout.write(
        `\ndocumentos: ${result.documents}\nimagenes:   ${result.images}\nproblemas:  ${result.issues.length}\n`,
      );
      for (const block of result.residualBlocks) {
        process.stderr.write(
          `AVISO ${block.file}:${block.line} quedo un bloque "${block.lang}" sin compilar en la salida\n`,
        );
      }
      if (result.issues.length > 0) {
        for (const issue of result.issues) {
          process.stderr.write(`ERROR ${issue.file}:${issue.line} ${issue.url} -> ${issue.reason}\n`);
        }
        process.exitCode = 1;
        return;
      }
      if (result.residualBlocks.length > 0) {
        process.exitCode = 1;
        return;
      }
      process.stdout.write('\nverify OK\n');
    });

  program
    .command('preview')
    .description('sirve el Markdown compilado para revisarlo visualmente')
    .argument('[output]', 'directorio de salida a servir')
    .option('-c, --config <file>', 'archivo de configuracion')
    .option('-p, --port <port>', 'puerto', '4321')
    .action(async (output: string | undefined, opts: { config?: string; port: string }) => {
      const config = await loadConfig({
        configPath: opts.config,
        overrides: output !== undefined ? { output } : {},
      });
      const dir = resolveFromRoot(config, config.output);
      const server = await startPreview(dir, Number.parseInt(opts.port, 10));
      process.stdout.write(`previsualizacion en ${server.url}\npulsa Ctrl+C para detener\n`);
      await new Promise<void>((resolve) => {
        process.on('SIGINT', () => {
          void server.close().then(resolve);
        });
      });
    });

  program
    .command('types')
    .description('lista los tipos disponibles del DSL de alto nivel')
    .action(() => {
      const catalog = dslCatalog();
      for (const [lang, types] of Object.entries(catalog)) {
        process.stdout.write(`\n\`\`\`${lang}\`\`\`\n`);
        for (const type of types) process.stdout.write(`  - ${type}\n`);
      }
      process.stdout.write(`\ntemas: ${themeNames().join(', ')}\n`);
    });

  return program;
}

interface BuildCliOptions {
  output?: string;
  theme?: string;
  config?: string;
  clean?: boolean;
  verbose?: boolean;
  cache?: boolean;
  rendererUrl?: string;
  backend?: RendererBackend;
  continueOnError?: boolean;
}

export async function run(argv: readonly string[] = process.argv): Promise<number> {
  try {
    await createProgram().parseAsync([...argv]);
    return typeof process.exitCode === 'number' ? process.exitCode : 0;
  } catch (err) {
    if (err instanceof BuildFailedError) {
      process.stderr.write(`\n${err.format()}\n\n${err.message}\n`);
      return 1;
    }
    if (err instanceof DocVizError) {
      process.stderr.write(`\n${err.format()}\n`);
      return 1;
    }
    process.stderr.write(`\nERROR inesperado\n${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    return 1;
  }
}
