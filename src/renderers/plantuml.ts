/**
 * Renderer PlantUML — JVM local con `plantuml.jar` vendorizado.
 *
 * No se usa ningun servicio publico: el codigo fuente nunca sale del proceso.
 * La comunicacion es por `-pipe` (stdin/stdout), asi que PlantUML nunca recibe
 * una ruta de archivo procedente del documento.
 */

import { spawn } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RenderError } from '../core/errors.js';
import type { DiagramRenderer, OutputFormat, RenderOptions, RenderResult } from '../core/types.js';
import { assertFormat, pngResult, svgResult } from './base.js';

const TYPE = 'plantuml';
const SUPPORTED: readonly OutputFormat[] = ['svg', 'png'];

/**
 * Inclusiones permitidas: solo la biblioteca estandar que viaja dentro del jar.
 *
 * `!include <C4/C4_Context>` no toca el sistema de archivos ni la red: PlantUML
 * resuelve la forma `<...>` contra los recursos empaquetados. Es lo que permite
 * dibujar C4, y bloquearla obligaria a depender de un servicio externo para algo
 * que ya esta en la maquina.
 */
const STDLIB_INCLUDE = /^\s*!include(?:sub)?\s+<[^>\n]+>\s*$/i;

/** Directivas de PlantUML que permiten leer o escribir en disco / en la red. */
const FORBIDDEN_DIRECTIVES: ReadonlyArray<{ re: RegExp; what: string }> = [
  { re: /^\s*!includeurl\b/im, what: '!includeurl' },
  { re: /^\s*!include(?:sub)?\b/im, what: '!include' },
  { re: /^\s*!import\b/im, what: '!import' },
  { re: /^\s*!theme\s+.*\bfrom\b/im, what: '!theme ... from' },
];

export interface PlantUmlOptions {
  /** Ruta al jar. Por defecto `vendor/plantuml.jar` del propio paquete. */
  jarPath?: string;
  /** Ejecutable de Java. */
  javaPath?: string;
  /** Memoria maxima de la JVM. */
  maxHeap?: string;
}

function defaultJarPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/renderers/plantuml.js -> raiz del paquete
  return path.resolve(here, '..', '..', 'vendor', 'plantuml.jar');
}

export class PlantUmlRenderer implements DiagramRenderer {
  readonly type = TYPE;
  readonly defaultFormat: OutputFormat = 'svg';
  readonly supportedFormats = SUPPORTED;

  private readonly jarPath: string;
  private readonly javaPath: string;
  private readonly maxHeap: string;
  private cachedVersion?: string;

  constructor(options: PlantUmlOptions = {}) {
    this.jarPath = path.resolve(
      options.jarPath ?? process.env['DOCVIZ_PLANTUML_JAR'] ?? defaultJarPath(),
    );
    this.javaPath = options.javaPath ?? process.env['DOCVIZ_JAVA'] ?? 'java';
    this.maxHeap = options.maxHeap ?? '1024m';
  }

  async version(): Promise<string> {
    if (this.cachedVersion !== undefined) return this.cachedVersion;
    await this.assertJarAvailable();
    const { stdout } = await this.runJava(['-version'], undefined, 60_000);
    const match = /PlantUML version ([\w.]+)/i.exec(stdout.toString('utf8'));
    this.cachedVersion = `plantuml-${match?.[1] ?? 'desconocida'}`;
    return this.cachedVersion;
  }

  async render(source: string, options: RenderOptions): Promise<RenderResult> {
    assertFormat(TYPE, options.format, SUPPORTED);
    await this.assertJarAvailable();
    this.assertNoFileAccess(source);

    const prepared = this.applyTheme(source, options);
    const args = [options.format === 'png' ? '-tpng' : '-tsvg'];
    const { stdout, stderr, code } = await this.runJava(
      ['-pipe', '-failfast2', '-charset', 'UTF-8', ...args],
      Buffer.from(prepared, 'utf8'),
      options.timeoutMs,
    );

    if (code !== 0) {
      throw new RenderError(TYPE, describePlantUmlError(stderr.toString('utf8')), stderr.toString('utf8').trim());
    }
    if (stdout.byteLength === 0) {
      throw new RenderError(TYPE, 'PlantUML no produjo salida', stderr.toString('utf8').trim());
    }

    if (options.format === 'png') return pngResult(TYPE, stdout, options);
    return svgResult(TYPE, stdout.toString('utf8'), options);
  }

  /**
   * Inserta el preambulo del tema justo despues de la directiva de apertura.
   * Si el usuario ya definio un `skinparam`, el suyo gana porque va despues.
   */
  private applyTheme(source: string, options: RenderOptions): string {
    const skin = options.theme.plantuml.skinparams.join('\n');
    const trimmed = source.trim();
    const openTag = /^@start[a-z]+\b.*$/im.exec(trimmed);
    if (openTag === null) {
      // Sin @startuml explicito PlantUML asume uno; lo hacemos explicito para
      // poder inyectar el tema de forma fiable.
      return `@startuml\n${skin}\n${trimmed}\n@enduml\n`;
    }
    const insertAt = openTag.index + openTag[0].length;
    return `${trimmed.slice(0, insertAt)}\n${skin}\n${trimmed.slice(insertAt)}\n`;
  }

  /**
   * Bloquea las directivas que harian que PlantUML lea disco o red.
   *
   * Se evalua linea a linea: una inclusion de la biblioteca estandar del jar es
   * legitima, y comprobar el documento entero de una vez no permitiria
   * distinguirla de un `!include /etc/passwd` en la linea siguiente.
   */
  private assertNoFileAccess(source: string): void {
    for (const line of source.split('\n')) {
      if (STDLIB_INCLUDE.test(line)) continue;
      for (const { re, what } of FORBIDDEN_DIRECTIVES) {
        if (re.test(line)) {
          throw new RenderError(
            TYPE,
            `la directiva ${what} esta deshabilitada por seguridad`,
            'DocViz solo admite la biblioteca estandar empaquetada, con la forma !include <biblioteca/archivo>',
          );
        }
      }
    }
  }

  private async assertJarAvailable(): Promise<void> {
    try {
      await access(this.jarPath, constants.R_OK);
    } catch {
      throw new RenderError(
        TYPE,
        `no se encuentra plantuml.jar en ${this.jarPath}`,
        'ejecuta `npm run setup` para descargarlo, o define renderers.plantuml.jar en docviz.config.yaml',
      );
    }
  }

  private runJava(
    jarArgs: string[],
    stdin: Buffer | undefined,
    timeoutMs: number,
  ): Promise<{ stdout: Buffer; stderr: Buffer; code: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        this.javaPath,
        [
          '-Djava.awt.headless=true',
          '-Dfile.encoding=UTF-8',
          `-Xmx${this.maxHeap}`,
          '-jar',
          this.jarPath,
          ...jarArgs,
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );

      const out: Buffer[] = [];
      const err: Buffer[] = [];
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        reject(new RenderError(TYPE, `el render supero el limite de ${timeoutMs} ms`));
      }, timeoutMs);
      timer.unref?.();

      child.stdout.on('data', (c: Buffer) => out.push(c));
      child.stderr.on('data', (c: Buffer) => err.push(c));

      child.on('error', (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(
          new RenderError(
            TYPE,
            `no se pudo ejecutar Java (${this.javaPath})`,
            `${e.message}\ninstala un JRE 8+ o define renderers.plantuml.java en docviz.config.yaml`,
          ),
        );
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ stdout: Buffer.concat(out), stderr: Buffer.concat(err), code: code ?? -1 });
      });

      if (stdin !== undefined) child.stdin.end(stdin);
      else child.stdin.end();
    });
  }
}

/**
 * PlantUML escribe en stderr un bloque `ERROR / <linea> / <mensaje>`.
 * Se extrae el mensaje util para que el reporte no sea "exit code 200".
 */
function describePlantUmlError(stderr: string): string {
  const lines = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  const errIdx = lines.findIndex((l) => l.toUpperCase() === 'ERROR');
  if (errIdx >= 0) {
    const lineNo = lines[errIdx + 1];
    const message = lines.slice(errIdx + 2).find((l) => l !== '') ?? 'error de sintaxis';
    const where = /^\d+$/.test(lineNo ?? '') ? ` (linea ${lineNo} del diagrama)` : '';
    return `${message}${where}`;
  }
  return lines[0] ?? 'PlantUML fallo sin describir el motivo';
}

export function createPlantUmlRenderer(options?: PlantUmlOptions): DiagramRenderer {
  return new PlantUmlRenderer(options);
}
