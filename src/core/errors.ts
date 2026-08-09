/**
 * Errores de DocViz.
 *
 * Regla de la especificacion (seccion 11): un fallo de render nunca puede
 * producir silenciosamente un documento incorrecto. Todo error lleva la
 * informacion necesaria para localizarlo: archivo, linea, renderer y motivo.
 */

export interface DocVizErrorLocation {
  /** Ruta relativa al cwd del archivo Markdown fuente. */
  file?: string;
  /** Linea 1-based dentro del archivo fuente. */
  line?: number;
  /** Tipo de renderer implicado. */
  renderer?: string;
}

export class DocVizError extends Error {
  readonly location: DocVizErrorLocation;
  readonly detail?: string;

  constructor(message: string, location: DocVizErrorLocation = {}, detail?: string) {
    super(message);
    this.name = 'DocVizError';
    this.location = location;
    this.detail = detail;
  }

  /** Vuelve a etiquetar un error con la posicion del bloque que lo produjo. */
  withLocation(location: DocVizErrorLocation): DocVizError {
    const merged = { ...this.location, ...location };
    const err = new DocVizError(this.message, merged, this.detail);
    err.stack = this.stack;
    return err;
  }

  /** Formato de reporte exigido por la seccion 11 de la especificacion. */
  format(): string {
    const lines = ['ERROR'];
    if (this.location.file) lines.push(`archivo: ${this.location.file}`);
    if (this.location.line !== undefined) lines.push(`linea: ${this.location.line}`);
    if (this.location.renderer) lines.push(`renderer: ${this.location.renderer}`);
    lines.push(`motivo: ${this.message}`);
    if (this.detail) {
      lines.push('detalle:');
      for (const l of this.detail.trimEnd().split('\n')) lines.push(`  ${l}`);
    }
    return lines.join('\n');
  }
}

/** El lenguaje de la valla no tiene renderer registrado. */
export class UnknownRendererError extends DocVizError {
  constructor(type: string, known: readonly string[]) {
    super(
      `no existe un renderer registrado para "${type}"`,
      { renderer: type },
      `renderers disponibles: ${known.join(', ')}`,
    );
    this.name = 'UnknownRendererError';
  }
}

/** El motor devolvio un error de sintaxis o fallo al dibujar. */
export class RenderError extends DocVizError {
  constructor(renderer: string, message: string, detail?: string) {
    super(message, { renderer }, detail);
    this.name = 'RenderError';
  }
}

/** Una ruta intento salirse del directorio de salida configurado. */
export class PathSecurityError extends DocVizError {
  constructor(message: string, detail?: string) {
    super(message, {}, detail);
    this.name = 'PathSecurityError';
  }
}

/** El DSL declarativo no cumple su esquema. */
export class DslValidationError extends DocVizError {
  constructor(message: string, detail?: string) {
    super(message, {}, detail);
    this.name = 'DslValidationError';
  }
}

/** Error de configuracion (docviz.config.yaml o flags de CLI). */
export class ConfigError extends DocVizError {
  constructor(message: string, detail?: string) {
    super(message, {}, detail);
    this.name = 'ConfigError';
  }
}

/** Agrupa todos los fallos de un build para reportarlos juntos. */
export class BuildFailedError extends Error {
  readonly errors: readonly DocVizError[];

  constructor(errors: readonly DocVizError[]) {
    super(`el build fallo con ${errors.length} error(es)`);
    this.name = 'BuildFailedError';
    this.errors = errors;
  }

  format(): string {
    return this.errors.map((e) => e.format()).join('\n\n');
  }
}
