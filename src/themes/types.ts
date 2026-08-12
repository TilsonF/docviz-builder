/**
 * Modelo de tema (seccion 14 de la especificacion).
 *
 * Un tema describe la misma identidad visual expresada en el dialecto de cada
 * motor, para que un PlantUML, un D2 y un Vega-Lite del mismo documento se vean
 * como piezas de la misma familia.
 */

export interface ThemePalette {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  accent: string;
  /**
   * Serie categorica para graficos. Es una tupla de seis: fijar el tamano
   * evita comprobaciones de indice inexistente en quien la consume.
   */
  categorical: readonly [string, string, string, string, string, string];
  /** Rampa secuencial de seis pasos para heatmaps y escalas continuas. */
  sequential: readonly [string, string, string, string, string, string];
  positive: string;
  negative: string;
  neutral: string;
}

/** Paleta y ajustes equivalentes para visores en modo oscuro. */
export interface ThemeDarkVariant {
  readonly palette: ThemePalette;
  readonly likec4: Theme['likec4'];
}

export interface Theme {
  readonly name: string;
  readonly description: string;
  readonly fontFamily: string;
  readonly monoFontFamily: string;
  readonly palette: ThemePalette;

  /**
   * Contraparte oscura de la paleta.
   *
   * Los colores del SVG generado se emiten como variables CSS con este valor
   * bajo `@media (prefers-color-scheme: dark)`, de modo que la misma imagen se
   * lea bien en un visor claro y en uno oscuro. En el tema `dark` coincide con
   * la paleta principal: quien lo elige quiere modo oscuro siempre.
   */
  readonly dark: ThemeDarkVariant;

  /** Preambulo `skinparam` que se inyecta tras `@startuml`. */
  readonly plantuml: { readonly skinparams: readonly string[] };

  /** Configuracion pasada a `mermaid.initialize`. */
  readonly mermaid: {
    readonly theme: 'default' | 'base' | 'dark' | 'forest' | 'neutral';
    readonly themeVariables: Readonly<Record<string, string>>;
  };

  /** Opciones de render de D2. */
  readonly d2: {
    readonly themeID: number;
    readonly darkThemeID: number;
    readonly sketch: boolean;
    readonly pad: number;
    /**
     * Sobrescritura de la paleta de D2, en claro y en oscuro.
     *
     * D2 no acepta colores sueltos por elemento desde fuera: solo permite
     * redefinir las ranuras de su tema. Se inyectan en la fuente para que sus
     * diagramas sigan la identidad del proyecto en lugar de la suya.
     */
    readonly overrides: Readonly<Record<string, string>>;
    readonly darkOverrides: Readonly<Record<string, string>>;
  };

  /** Atributos por defecto inyectados en el grafo Graphviz. */
  readonly graphviz: {
    readonly graph: Readonly<Record<string, string>>;
    readonly node: Readonly<Record<string, string>>;
    readonly edge: Readonly<Record<string, string>>;
  };

  /** Bloque `config` de Vega-Lite. */
  readonly vegaLite: {
    readonly width: number;
    readonly height: number;
    readonly config: Readonly<Record<string, unknown>>;
  };

  /** Paleta del emisor SVG propio de LikeC4. */
  readonly likec4: {
    readonly background: string;
    readonly nodeFill: Readonly<Record<string, string>>;
    readonly nodeStroke: Readonly<Record<string, string>>;
    readonly nodeText: string;
    readonly nodeTextMuted: string;
    readonly groupFill: string;
    readonly groupStroke: string;
    readonly edgeStroke: string;
    readonly edgeText: string;
  };
}
