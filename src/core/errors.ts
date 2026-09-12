/**
 * Errores de DocViz.
 *
 * Regla de la especificacion (seccion 11): un fallo de render nunca puede
 * producir silenciosamente un documento incorrecto. Todo error lleva la
 * informacion necesaria para localizarlo: archivo, linea, renderer y motivo.
 *
 * Ademas del texto, todo error lleva un **codigo estable**. El destinatario
 * habitual del reporte es un agente reintentando: un codigo permite decidir la
 * correccion sin analizar el mensaje, que esta escrito para humanos y puede
 * cambiar de redaccion sin previo aviso.
 */

/**
 * Codigos de regla.
 *
 * Son parte del contrato publico: renombrar uno rompe a quien lo consuma, asi
 * que se anaden codigos nuevos en lugar de reutilizar los existentes.
 *
 *   DV0xx  entorno, configuracion y motores
 *   DV1xx  DSL declarativo (lo que escribe el autor del documento)
 */
export const ERROR_CODES = {
  /** Error sin clasificar. */
  GENERIC: 'DV000',
  /** El lenguaje de la valla no tiene renderer registrado. */
  UNKNOWN_RENDERER: 'DV001',
  /** El motor devolvio un error de sintaxis o fallo al dibujar. */
  RENDER_FAILED: 'DV002',
  /** Una ruta intento salirse del directorio de salida. */
  PATH_SECURITY: 'DV003',
  /** Configuracion invalida. */
  CONFIG: 'DV004',
  /** El renderer existe pero no esta habilitado en esta maquina. */
  RENDERER_UNAVAILABLE: 'DV005',
  /** El renderer no puede producir el formato pedido. */
  FORMAT_UNSUPPORTED: 'DV006',
  /** Colision de hash truncado. */
  HASH_COLLISION: 'DV007',

  /** DSL invalido sin clasificar. */
  DSL: 'DV100',
  /** Falta un campo obligatorio. */
  DSL_FIELD_MISSING: 'DV101',
  /** El campo existe pero su valor no tiene la forma esperada. */
  DSL_FIELD_TYPE: 'DV102',
  /** El valor no pertenece al conjunto admitido. */
  DSL_VALUE_NOT_ALLOWED: 'DV103',
  /** Campo que el tipo no usa: casi siempre una errata. */
  DSL_FIELD_UNKNOWN: 'DV104',
  /** El bloque no es YAML valido. */
  DSL_YAML: 'DV105',
  /** El `type` no existe o no pertenece a esta valla. */
  DSL_TYPE: 'DV106',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

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
  /** Codigo estable de la regla incumplida. */
  readonly code: ErrorCode;

  constructor(
    message: string,
    location: DocVizErrorLocation = {},
    detail?: string,
    code: ErrorCode = ERROR_CODES.GENERIC,
  ) {
    super(message);
    this.name = 'DocVizError';
    this.location = location;
    this.detail = detail;
    this.code = code;
  }

  /** Vuelve a etiquetar un error con la posicion del bloque que lo produjo. */
  withLocation(location: DocVizErrorLocation): DocVizError {
    return this.copyWith({ location: { ...this.location, ...location } });
  }

  /**
   * Devuelve una copia con detalle adicional al final.
   *
   * Se usa para adjuntar diagnosticos que solo se conocen despues de fallar,
   * como las erratas detectadas en los campos del bloque.
   */
  withExtraDetail(extra: string): DocVizError {
    if (extra.trim() === '') return this;
    return this.copyWith({ detail: this.detail === undefined ? extra : `${this.detail}\n${extra}` });
  }

  /**
   * Copia conservando la subclase.
   *
   * Reconstruir con `new DocVizError(...)` convertiria un `DslValidationError`
   * en un error generico a mitad del camino, y quien lo reciba dejaria de poder
   * distinguir de que capa vino.
   */
  private copyWith(changes: { location?: DocVizErrorLocation; detail?: string }): DocVizError {
    const clone = Object.create(Object.getPrototypeOf(this) as object) as Record<string, unknown>;
    clone['name'] = this.name;
    clone['message'] = this.message;
    clone['stack'] = this.stack;
    clone['code'] = this.code;
    clone['location'] = changes.location ?? this.location;
    clone['detail'] = changes.detail ?? this.detail;
    return clone as unknown as DocVizError;
  }

  /** Formato de reporte exigido por la seccion 11 de la especificacion. */
  format(): string {
    const lines = ['ERROR'];
    lines.push(`codigo: ${this.code}`);
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
      ERROR_CODES.UNKNOWN_RENDERER,
    );
    this.name = 'UnknownRendererError';
  }
}

/** El motor devolvio un error de sintaxis o fallo al dibujar. */
export class RenderError extends DocVizError {
  constructor(renderer: string, message: string, detail?: string, code: ErrorCode = ERROR_CODES.RENDER_FAILED) {
    super(message, { renderer }, detail, code);
    this.name = 'RenderError';
  }
}

/** Una ruta intento salirse del directorio de salida configurado. */
export class PathSecurityError extends DocVizError {
  constructor(message: string, detail?: string) {
    super(message, {}, detail, ERROR_CODES.PATH_SECURITY);
    this.name = 'PathSecurityError';
  }
}

/** El DSL declarativo no cumple su esquema. */
export class DslValidationError extends DocVizError {
  constructor(message: string, detail?: string, code: ErrorCode = ERROR_CODES.DSL) {
    super(message, {}, detail, code);
    this.name = 'DslValidationError';
  }
}

/** Error de configuracion (docviz.config.yaml o flags de CLI). */
export class ConfigError extends DocVizError {
  constructor(message: string, detail?: string) {
    super(message, {}, detail, ERROR_CODES.CONFIG);
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
