/**
 * Temas de marca definidos en la configuracion.
 *
 * Los cuatro temas incluidos sirven para documentacion interna, pero lo que se
 * entrega a un cliente quiere su paleta. Hasta ahora la unica salida era
 * bifurcar el paquete.
 *
 * Un tema a medida no obliga a escribir los seis dialectos de motor: se parte
 * de uno incluido y se sobrescriben los colores que interesen. `buildTheme` ya
 * deriva de la paleta los `skinparam` de PlantUML, las variables de Mermaid,
 * las ranuras de D2, los atributos de Graphviz, la configuracion de Vega-Lite y
 * la paleta de LikeC4.
 */

import { ConfigError } from '../core/errors.js';
import type { Theme, ThemePalette } from './types.js';

/** Lo que se puede declarar en `docviz.config.yaml`. */
export interface CustomThemeSpec {
  /** Nombre del tema resultante. */
  name: string;
  /** Tema incluido del que se parte. */
  base?: string;
  /** Colores que se sobrescriben, por nombre de ranura. */
  palette?: Record<string, unknown>;
  /** Los mismos, para el modo oscuro del visor. */
  darkPalette?: Record<string, unknown>;
  fontFamily?: string;
}

/**
 * Un color solo puede ser hexadecimal.
 *
 * Estos valores acaban dentro de un `skinparam`, de un atributo de Graphviz y
 * de una variable CSS del SVG. Aceptar una cadena libre convertiria el tema en
 * una via de inyeccion —`red; } svg { ... }` es CSS valido— y la comodidad de
 * escribir `rebeccapurple` no compensa tener que razonar sobre eso.
 */
const COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Ranuras de color de una paleta, para validar y para el mensaje de error. */
const RANURAS: readonly (keyof ThemePalette)[] = [
  'background', 'surface', 'surfaceAlt', 'border', 'text', 'textMuted',
  'primary', 'primaryText', 'accent', 'positive', 'negative', 'neutral',
];

/** Ranuras que son una tupla de seis colores. */
const SERIES: readonly (keyof ThemePalette)[] = ['categorical', 'sequential'];

function exigirColor(valor: unknown, donde: string): string {
  if (typeof valor !== 'string' || !COLOR.test(valor.trim())) {
    throw new ConfigError(
      `${donde} debe ser un color hexadecimal`,
      `valor recibido: ${JSON.stringify(valor)}. Formatos validos: #abc, #aabbcc, #aabbccdd`,
    );
  }
  return valor.trim();
}

/**
 * Mezcla los colores declarados sobre la paleta de partida.
 *
 * Solo hay que escribir lo que cambia: una marca suele definir dos o tres
 * colores, no diecisiete.
 */
function mezclarPaleta(base: ThemePalette, cambios: Record<string, unknown>, donde: string): ThemePalette {
  const resultado: Record<string, unknown> = { ...base };

  for (const [clave, valor] of Object.entries(cambios)) {
    if ((SERIES as readonly string[]).includes(clave)) {
      if (!Array.isArray(valor) || valor.length !== 6) {
        throw new ConfigError(
          `${donde}.${clave} debe ser una lista de exactamente seis colores`,
          `se recibieron ${Array.isArray(valor) ? valor.length : 0}`,
        );
      }
      resultado[clave] = valor.map((c, i) => exigirColor(c, `${donde}.${clave}[${i}]`));
      continue;
    }
    if (!(RANURAS as readonly string[]).includes(clave)) {
      throw new ConfigError(
        `${donde}.${clave} no es una ranura de color conocida`,
        `ranuras validas: ${[...RANURAS, ...SERIES].join(', ')}`,
      );
    }
    resultado[clave] = exigirColor(valor, `${donde}.${clave}`);
  }

  return resultado as unknown as ThemePalette;
}

/**
 * Tipografia sin caracteres que puedan cerrar la declaracion que la contiene.
 *
 * Va dentro de un `skinparam defaultFontName "..."` y de una regla CSS, asi que
 * una comilla o un punto y coma no son un nombre de fuente raro: son una fuga.
 */
function exigirFuente(valor: unknown): string {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new ConfigError('theme.fontFamily debe ser una cadena no vacia');
  }
  const limpio = valor.trim();
  if (/["'`;{}<>\\]/.test(limpio)) {
    throw new ConfigError(
      'theme.fontFamily contiene caracteres que no puede llevar',
      'sin comillas, punto y coma, llaves ni angulos: acaba dentro de una regla CSS y de un skinparam',
    );
  }
  return limpio;
}

/**
 * Construye el tema de marca a partir del incluido que se indique.
 *
 * `construir` es `buildTheme`, que se pasa desde el modulo de temas para no
 * duplicar la derivacion por motor ni crear una dependencia circular.
 */
export function buildCustomTheme(
  spec: CustomThemeSpec,
  base: Theme,
  construir: (args: {
    name: string;
    description: string;
    palette: ThemePalette;
    darkPalette?: ThemePalette;
    d2ThemeID: number;
    d2DarkThemeID: number;
    mermaidBase: 'base' | 'dark';
    fontFamily?: string;
  }) => Theme,
): Theme {
  const palette = mezclarPaleta(base.palette, spec.palette ?? {}, 'theme.palette');

  // Sin `darkPalette` propia, los cambios de la clara se aplican tambien sobre
  // la oscura: quien define el azul de su marca lo quiere en los dos modos, y
  // exigir que lo repita seria pedirle que mantenga dos copias.
  const darkPalette = mezclarPaleta(
    mezclarPaleta(base.dark.palette, spec.palette ?? {}, 'theme.palette'),
    spec.darkPalette ?? {},
    'theme.darkPalette',
  );

  return construir({
    name: spec.name,
    description: `Tema de marca derivado de ${base.name}`,
    palette,
    darkPalette,
    d2ThemeID: base.d2.themeID,
    d2DarkThemeID: base.d2.darkThemeID,
    mermaidBase: base.mermaid.theme === 'dark' ? 'dark' : 'base',
    ...(spec.fontFamily !== undefined ? { fontFamily: exigirFuente(spec.fontFamily) } : {}),
  });
}
