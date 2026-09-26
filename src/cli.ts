/**
 * Interfaz de linea de comandos (seccion 17).
 *
 *   docviz build <source> --output <target> [--theme ...] [--clean] [--watch]
 *   docviz check <source>
 *   docviz diff <base> <head>
 *   docviz setup
 *   docviz skill
 *   docviz fix <archivo>
 *   docviz schema [valla]
 *   docviz bundle [output] --to <dir>
 *   docviz verify <output>
 *   docviz preview <output> [--watch]
 *   docviz types
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Command } from 'commander';
import { build, check, type BuildWarning } from './build/builder.js';
import { diff, formatDiff, hasChanges } from './build/diff.js';
import { diagnosticar, formatearDiagnostico } from './build/doctor.js';
import { init, formatearInit } from './build/init.js';
import { startPreview } from './build/preview.js';
import { watchSource } from './build/watch.js';
import { bundle, formatearBundle } from './build/bundle.js';
import { installSkill, formatearSkill } from './build/skill.js';
import { fixBlock } from './mcp/tools.js';
import { verify } from './build/verify.js';
import { loadConfig, resolveFromRoot } from './config/load.js';
import { BuildFailedError, DocVizError } from './core/errors.js';
import { dslCatalog, findType, TYPE_CATALOG, type TypeSpec } from './dsl/index.js';
import { esquemaDeConfiguracion, esquemaDeTipo, esquemaDeValla } from './dsl/esquema.js';
import { suggestType } from './mcp/tools.js';
import { themeNames } from './themes/index.js';
import type { RendererBackend } from './config/types.js';

const VERSION = '0.5.2';

const ejecutar = promisify(execFile);

/** Lee el bloque de la entrada estandar, para encadenarlo con otro comando. */
async function leerEntrada(): Promise<string> {
  const trozos: Buffer[] = [];
  for await (const trozo of process.stdin) trozos.push(Buffer.from(trozo as Buffer));
  return Buffer.concat(trozos).toString('utf8');
}

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
    .option('-w, --watch', 'recompila cada vez que cambie un documento', false)
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

      escribirAvisos(result.warnings);

      if (result.errors.length > 0) {
        process.stderr.write(`\n${result.errors.map((e) => e.format()).join('\n\n')}\n`);
        process.stderr.write(`\n${result.errors.length} diagrama(s) fallaron (--continue-on-error activo)\n`);
        process.exitCode = 1;
      }

      if (opts.watch === true) {
        const origen = resolveFromRoot(config, config.source);
        await observar(origen, async () => {
          // En modo observacion un error no puede tumbar el proceso: se
          // reporta y se sigue esperando al siguiente guardado.
          await recompilar(config, { continueOnError: true });
        });
      }
    });

  program
    .command('check')
    .description('valida los bloques declarativos sin renderizar')
    .argument('[source]', 'directorio de documentos fuente')
    .option('-c, --config <file>', 'archivo de configuracion')
    .option('--verbose', 'lista cada bloque detectado', false)
    .option('--json', 'salida en JSON, para un editor o un pipeline', false)
    .action(async (source: string | undefined, opts: { config?: string; verbose?: boolean; json?: boolean }) => {
      const config = await loadConfig({
        configPath: opts.config,
        overrides: source !== undefined ? { source } : {},
      });
      const result = await check(config);

      if (opts.json === true) {
        // Todo por stdout y nada por stderr: quien consume esto analiza una
        // sola corriente, y un aviso suelto en la otra le rompe el JSON.
        process.stdout.write(
          `${JSON.stringify(
            {
              ok: result.errors.length === 0,
              documents: result.documents,
              blocks: result.blocks,
              invalidBlocks: result.invalidBlocks,
              findings: result.findings,
              warnings: result.warnings,
              errors: result.errors.map((e) => ({
                code: e.code,
                message: e.message,
                ...(e.location.file !== undefined ? { file: e.location.file } : {}),
                ...(e.location.line !== undefined ? { line: e.location.line } : {}),
                ...(e.location.renderer !== undefined ? { engine: e.location.renderer } : {}),
                ...(e.detail !== undefined ? { detail: e.detail } : {}),
              })),
            },
            null,
            2,
          )}\n`,
        );
        if (result.errors.length > 0) process.exitCode = 1;
        return;
      }

      if (opts.verbose === true) {
        for (const f of result.findings) {
          process.stdout.write(`  ${f.file}:${f.line}  ${f.lang} -> ${f.rendererType}  "${f.title}"\n`);
        }
      }
      // El conteo distingue los bloques que compilan de los que no: decir
      // "bloques: 0" cuando habia tres rotos oculta justo lo que hay que ver.
      const invalidos = result.invalidBlocks > 0 ? `  (${result.invalidBlocks} invalido(s))` : '';
      process.stdout.write(
        `\ndocumentos: ${result.documents}\nbloques:    ${result.blocks}${invalidos}\n` +
          `avisos:     ${result.warnings.length}\nerrores:    ${result.errors.length}\n`,
      );
      escribirAvisos(result.warnings);
      if (result.errors.length > 0) {
        process.stderr.write(`\n${result.errors.map((e) => e.format()).join('\n\n')}\n`);
        process.exitCode = 1;
        return;
      }
      process.stdout.write('\ncheck OK\n');
    });

  program
    .command('diff')
    .description('compara los diagramas de dos versiones de la documentacion')
    .argument('<base>', 'directorio de la version anterior')
    .argument('<head>', 'directorio de la version nueva')
    .option('-c, --config <file>', 'archivo de configuracion')
    .option('--all', 'incluye tambien los diagramas que no cambiaron', false)
    .option('--json', 'salida en JSON', false)
    .option('--exit-code', 'termina con codigo 1 si algo cambio, como git diff', false)
    .action(async (base: string, head: string, opts: DiffCliOptions) => {
      const config = await loadConfig(opts.config !== undefined ? { configPath: opts.config } : {});
      const result = await diff(config, path.resolve(base), path.resolve(head));

      process.stdout.write(
        opts.json === true ? `${JSON.stringify(result, null, 2)}\n` : formatDiff(result, { all: opts.all }),
      );
      if (opts.exitCode === true && hasChanges(result)) process.exitCode = 1;
    });

  program
    .command('bundle')
    .description('deja la salida lista para subirla a un wiki, sin subirla')
    .argument('[output]', 'directorio de salida compilada')
    .option('-c, --config <file>', 'archivo de configuracion')
    .option('--to <dir>', 'directorio donde dejar el paquete')
    .option('--json', 'imprime solo el manifiesto', false)
    .action(async (output: string | undefined, opts: { config?: string; to?: string; json?: boolean }) => {
      const config = await loadConfig({
        configPath: opts.config,
        overrides: output !== undefined ? { output } : {},
      });
      const manifiesto = await bundle({
        origen: resolveFromRoot(config, config.output),
        version: VERSION,
        ...(opts.to !== undefined ? { destino: path.resolve(opts.to) } : {}),
      });

      if (opts.json === true) {
        process.stdout.write(`${JSON.stringify(manifiesto, null, 2)}\n`);
      } else {
        process.stdout.write(formatearBundle(manifiesto, opts.to));
      }
      // Una referencia rota no impide empaquetar el resto, pero no puede pasar
      // por buena: quien publique subiria un documento con un hueco.
      if (manifiesto.incidencias.length > 0) process.exitCode = 1;
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
    .option('-w, --watch', 'recompila al guardar y recarga el navegador', false)
    .action(async (output: string | undefined, opts: { config?: string; port: string; watch?: boolean }) => {
      const config = await loadConfig({
        configPath: opts.config,
        overrides: output !== undefined ? { output } : {},
      });
      const dir = resolveFromRoot(config, config.output);
      const observando = opts.watch === true;

      // Con `--watch` se compila antes de servir: si no, la primera pagina
      // seria la de la sesion anterior, o ninguna.
      if (observando) await recompilar(config, { continueOnError: true });

      const server = await startPreview(dir, Number.parseInt(opts.port, 10), { liveReload: observando });
      process.stdout.write(
        `previsualizacion en ${server.url}\n` +
          (observando ? `observando ${path.relative(process.cwd(), resolveFromRoot(config, config.source))}\n` : '') +
          'pulsa Ctrl+C para detener\n',
      );

      const watcher = observando
        ? watchSource(resolveFromRoot(config, config.source), {
            onLog: (m) => process.stderr.write(`${m}\n`),
            onChange: async () => {
              await recompilar(config, { continueOnError: true });
              server.recargar();
            },
          })
        : undefined;

      await new Promise<void>((resolve) => {
        process.on('SIGINT', () => {
          watcher?.close();
          void server.close().then(resolve);
        });
      });
    });

  program
    .command('init')
    .description('prepara este proyecto para usar DocViz')
    .option('-t, --theme <name>', `tema inicial (${themeNames().join(', ')})`, 'default')
    .option('--force', 'sobrescribe los archivos que ya existan', false)
    .action(async (opts: { theme: string; force?: boolean }) => {
      if (!themeNames().includes(opts.theme)) {
        process.stderr.write(`el tema "${opts.theme}" no existe\ntemas: ${themeNames().join(', ')}\n`);
        process.exitCode = 1;
        return;
      }
      const result = await init({ cwd: process.cwd(), theme: opts.theme, force: opts.force === true });
      process.stdout.write(formatearInit(result, opts.theme));
    });

  program
    .command('fix')
    .description('corrige las erratas de un bloque que no compila')
    .argument('<archivo>', 'archivo con el bloque, o - para leer de la entrada estandar')
    .option('-l, --lang <valla>', 'valla del bloque: diagram | chart | architecture', 'diagram')
    .option('--json', 'salida en JSON', false)
    .action(async (archivo: string, opts: { lang?: string; json?: boolean }) => {
      const source = archivo === '-' ? await leerEntrada() : await readFile(path.resolve(archivo), 'utf8');
      const result = fixBlock({ source, ...(opts.lang !== undefined ? { lang: opts.lang } : {}) });

      if (opts.json === true) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        if (!result.ok) process.exitCode = 1;
        return;
      }

      for (const c of (result['aplicado'] ?? []) as Array<{ de: string; a: string }>) {
        process.stderr.write(`corregido: "${c.de}" -> "${c.a}"\n`);
      }
      process.stdout.write(`${String(result['source'] ?? source)}\n`);
      if (!result.ok) {
        process.stderr.write(`\n${String(result['detail'] ?? result['error'] ?? 'sigue sin compilar')}\n`);
        for (const p2 of (result['pendientes'] ?? []) as string[]) process.stderr.write(`  ${p2}\n`);
        process.exitCode = 1;
      }
    });

  program
    .command('setup')
    .description('descarga plantuml.jar dentro del paquete (unica operacion de red)')
    .argument('[version]', 'version de PlantUML a descargar')
    .action(async (version: string | undefined) => {
      // Instalado como dependencia, `npm run setup` no existe: los scripts del
      // paquete no son los del proyecto. Sin este comando, los 12 tipos de
      // PlantUML quedan muertos tras un `npm install` y nadie sabe por que.
      const script = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
        'scripts',
        'fetch-plantuml.mjs',
      );
      try {
        const { stdout, stderr } = await ejecutar(
          process.execPath,
          version !== undefined ? [script, version] : [script],
          { timeout: 300_000, maxBuffer: 4 * 1024 * 1024 },
        );
        process.stdout.write(stdout);
        if (stderr !== '') process.stderr.write(stderr);
      } catch (err) {
        const salida = err as { stdout?: string; stderr?: string; message?: string };
        if (salida.stdout) process.stdout.write(salida.stdout);
        process.stderr.write(salida.stderr ?? `${salida.message ?? String(err)}\n`);
        process.exitCode = 1;
      }
    });

  program
    .command('skill')
    .description('instala el contrato de DocViz como skill de tu agente')
    .option('-g, --global', 'instala en tu perfil en lugar de en el proyecto', false)
    .option('-d, --dir <dir>', 'directorio de skills de otro agente')
    .option('--force', 'sobrescribe una instalacion anterior', false)
    .option('-l, --lang <idioma>', 'idioma del contrato: es | en', 'es')
    .action(async (opts: { global?: boolean; dir?: string; force?: boolean; lang?: string }) => {
      const result = await installSkill({
        cwd: process.cwd(),
        global: opts.global === true,
        force: opts.force === true,
        lang: opts.lang === 'en' ? 'en' : 'es',
        ...(opts.dir !== undefined ? { dir: opts.dir } : {}),
      });
      process.stdout.write(formatearSkill(result));
    });

  program
    .command('doctor')
    .description('comprueba el entorno y que tipos se pueden dibujar')
    .option('-c, --config <file>', 'archivo de configuracion')
    .option('--json', 'salida en JSON', false)
    .action(async (opts: { config?: string; json?: boolean }) => {
      const config = await loadConfig(opts.config !== undefined ? { configPath: opts.config } : {});
      const diagnostico = await diagnosticar(config);
      process.stdout.write(
        opts.json === true ? `${JSON.stringify(diagnostico, null, 2)}\n` : formatearDiagnostico(diagnostico),
      );
      // Falta de entorno es un fallo: en un pipeline conviene enterarse antes de
      // compilar, no a mitad del build.
      if (!diagnostico.ok) process.exitCode = 1;
    });

  program
    .command('types')
    .description('lista los tipos del DSL con su proposito y su ejemplo')
    .argument('[type]', 'muestra la ficha completa de un tipo concreto')
    .option('--short', 'solo los nombres, sin metadatos', false)
    .option('--json', 'salida en JSON, para consumirla desde otro programa', false)
    .option('-l, --lang <idioma>', 'idioma de las fichas: es | en', 'es')
    .action((type: string | undefined, opts: { short?: boolean; json?: boolean; lang?: string }) => {
      const idioma: Idioma = opts.lang === 'en' ? 'en' : 'es';
      if (type !== undefined) {
        const spec = findType(type);
        if (spec === undefined) {
          process.stderr.write(
            `el tipo "${type}" no existe\n\ntipos disponibles:\n  ${TYPE_CATALOG.map((s) => s.type).sort().join(', ')}\n`,
          );
          process.exitCode = 1;
          return;
        }
        process.stdout.write(opts.json === true ? `${JSON.stringify(spec, null, 2)}\n` : ficha(spec, idioma));
        return;
      }

      if (opts.json === true) {
        process.stdout.write(`${JSON.stringify({ types: TYPE_CATALOG, themes: themeNames() }, null, 2)}\n`);
        return;
      }

      if (opts.short === true) {
        for (const [lang, types] of Object.entries(dslCatalog())) {
          process.stdout.write(`\n\`\`\`${lang}\`\`\`\n`);
          for (const t of types) process.stdout.write(`  - ${t}\n`);
        }
        process.stdout.write(`\ntemas: ${themeNames().join(', ')}\n`);
        return;
      }

      // Por defecto se muestra el proposito de cada tipo: una lista de nombres
      // obliga a adivinar, que es justo lo que el catalogo existe para evitar.
      for (const lang of ['diagram', 'chart', 'architecture'] as const) {
        const specs = TYPE_CATALOG.filter((s) => s.lang === lang);
        process.stdout.write(`\n\`\`\`${lang}\`\`\`\n`);
        const ancho = Math.max(...specs.map((s) => s.type.length));
        for (const spec of specs) {
          const proposito = idioma === 'en' && spec.en !== undefined ? spec.en.purpose : spec.purpose;
          process.stdout.write(`  ${spec.type.padEnd(ancho)}  ${proposito}\n`);
        }
      }
      process.stdout.write(
        `\ntemas: ${themeNames().join(', ')}\n` +
          `\ndocviz types <tipo>   ficha completa con ejemplo\n` +
          `docviz suggest "..."  recomendacion a partir de una frase\n`,
      );
    });

  program
    .command('schema')
    .description('imprime el esquema JSON de una valla, de un tipo o de la configuracion')
    .argument('[que]', 'diagram | chart | architecture | config | un nombre de tipo', 'diagram')
    .option(
      '--strict',
      'marca tambien los campos que el tipo no declara; util si conoces el catalogo, ruidoso si no',
      false,
    )
    .action((que: string, opts: { strict?: boolean }) => {
      const estricto = opts.strict === true;
      if (que === 'config' || que === 'configuracion') {
        process.stdout.write(`${JSON.stringify(esquemaDeConfiguracion(themeNames()), null, 2)}\n`);
        return;
      }
      if (que === 'diagram' || que === 'chart' || que === 'architecture') {
        process.stdout.write(`${JSON.stringify(esquemaDeValla(que, estricto), null, 2)}\n`);
        return;
      }
      const spec = findType(que);
      if (spec === undefined) {
        process.stderr.write(
          `"${que}" no es una valla ni un tipo\n\n` +
            'vallas: diagram, chart, architecture\n' +
            'configuracion: config\n' +
            `tipos: ${TYPE_CATALOG.map((t) => t.type).sort().join(', ')}\n`,
        );
        process.exitCode = 1;
        return;
      }
      process.stdout.write(
        `${JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', ...esquemaDeTipo(spec, estricto) }, null, 2)}\n`,
      );
    });

  program
    .command('suggest')
    .description('recomienda un tipo a partir de lo que quieres explicar')
    .argument('<necesidad...>', 'que quieres explicar, en una frase')
    .option('-n, --limit <n>', 'numero de sugerencias', '3')
    .option('--json', 'salida en JSON', false)
    .action((palabras: string[], opts: { limit: string; json?: boolean }) => {
      const need = palabras.join(' ');
      const result = suggestType({ need, limit: Number.parseInt(opts.limit, 10) });

      if (opts.json === true) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        if (result.ok !== true) process.exitCode = 1;
        return;
      }
      if (result.ok !== true) {
        process.stderr.write(`${String(result['error'])}\n`);
        process.exitCode = 1;
        return;
      }

      const matches = result['matches'] as Array<Record<string, string>>;
      if (matches.length === 0) {
        process.stdout.write(`${String(result['advice'])}\n`);
        return;
      }
      for (const match of matches) {
        process.stdout.write(
          `\n${match['type']}  (${match['lang']}, ${match['engine']})\n` +
            `  ${match['purpose']}\n` +
            `  cuando: ${match['whenToUse']}\n` +
            `  cuando no: ${match['whenNotToUse']}\n\n` +
            `${match['block']!.split('\n').map((l) => `  ${l}`).join('\n')}\n`,
        );
      }
    });

  return program;
}

/** Ficha legible de un tipo, con su ejemplo listo para copiar. */
/** Idiomas en los que se puede leer el catalogo. */
export type Idioma = 'es' | 'en';

const ETIQUETAS = {
  es: { usar: 'cuando usarlo:', evitar: 'cuando no:     ', alias: 'alias:         ', respaldo: 'respaldo:      ' },
  en: { usar: 'when to use:  ', evitar: 'when not to:  ', alias: 'aliases:      ', respaldo: 'fallbacks:    ' },
} as const;

/** Ficha legible de un tipo, con su ejemplo listo para copiar. */
function ficha(spec: TypeSpec, idioma: Idioma = 'es'): string {
  const texto = idioma === 'en' && spec.en !== undefined ? spec.en : spec;
  const et = ETIQUETAS[idioma];
  const lineas = [
    '',
    `${spec.type}  (${spec.lang}, ${spec.engine})`,
    '',
    `  ${texto.purpose}`,
    '',
    `  ${et.usar}  ${texto.whenToUse}`,
    `  ${et.evitar}  ${texto.whenNotToUse}`,
  ];
  if (spec.aliases !== undefined && spec.aliases.length > 0) {
    lineas.push(`  ${et.alias}  ${spec.aliases.join(', ')}`);
  }
  if (spec.fallbacks !== undefined && spec.fallbacks.length > 0) {
    lineas.push(`  ${et.respaldo}  ${spec.fallbacks.join(', ')}`);
  }
  lineas.push('', `  \`\`\`${spec.lang}`);
  for (const l of spec.example.split('\n')) lineas.push(`  ${l}`);
  lineas.push('  ```', '');
  return `${lineas.join('\n')}\n`;
}

/**
 * Compila una vez e informa en una linea, para el modo observacion.
 *
 * El resumen completo del build es util una vez; repetido en cada guardado se
 * convierte en ruido que tapa lo unico que importa, que es si fallo algo.
 */
async function recompilar(
  config: Awaited<ReturnType<typeof loadConfig>>,
  options: { continueOnError: boolean },
): Promise<void> {
  const inicio = Date.now();
  try {
    const result = await build(config, { continueOnError: options.continueOnError });
    const ms = Date.now() - inicio;
    const fallos = result.errors.length;
    process.stdout.write(
      `${new Date().toTimeString().slice(0, 8)}  ${result.stats.blocks} diagrama(s) en ${ms} ms` +
        `${result.stats.cacheHits > 0 ? ` (${result.stats.cacheHits} del cache)` : ''}` +
        `${fallos > 0 ? `  — ${fallos} con error` : ''}\n`,
    );
    escribirAvisos(result.warnings);
    if (fallos > 0) process.stderr.write(`${result.errors.map((e) => e.format()).join('\n\n')}\n`);
  } catch (err) {
    // Ni un error de build ni uno inesperado pueden terminar la observacion.
    if (err instanceof BuildFailedError || err instanceof DocVizError) {
      process.stderr.write(`\n${err.format()}\n`);
      return;
    }
    process.stderr.write(`\n${err instanceof Error ? err.message : String(err)}\n`);
  }
}

/** Observa el origen hasta que el usuario interrumpa. */
async function observar(origen: string, alCambiar: () => Promise<void>): Promise<void> {
  process.stdout.write(`observando ${path.relative(process.cwd(), origen)}\npulsa Ctrl+C para detener\n`);
  const watcher = watchSource(origen, {
    onLog: (m) => process.stderr.write(`${m}\n`),
    onChange: alCambiar,
  });
  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      watcher.close();
      resolve();
    });
  });
}

/**
 * Los avisos van a stderr y no cambian el codigo de salida.
 *
 * Un campo ignorado no rompe el documento, pero si se mezcla con la salida
 * normal nadie lo lee; y si fallara el build, corregir una errata seria
 * obligatorio antes de publicar cualquier cosa.
 */
function escribirAvisos(warnings: readonly BuildWarning[]): void {
  for (const w of warnings) {
    process.stderr.write(`AVISO ${w.file}:${w.line} [${w.code}] ${w.message}\n`);
  }
}

interface DiffCliOptions {
  config?: string;
  all?: boolean;
  json?: boolean;
  exitCode?: boolean;
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
  watch?: boolean;
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
