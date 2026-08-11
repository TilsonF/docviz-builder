/**
 * Esquema de color dual: la misma imagen legible en un visor claro y en uno
 * oscuro.
 *
 * Un SVG referenciado desde `<img>` se renderiza como su propio documento, y el
 * navegador le aplica la preferencia de color del usuario. Eso permite declarar
 * los colores como variables CSS y redefinirlas bajo
 * `@media (prefers-color-scheme: dark)`.
 *
 * La sustitucion es textual sobre los hexadecimales que el propio DocViz inyecto
 * al aplicar el tema, y funciona tanto en atributos de presentacion
 * (`fill="var(--dv1,#12508F)"`) como en estilos en linea y hojas de estilo
 * incrustadas: los tres son declaraciones CSS y admiten `var()`.
 */

import { ConfigError } from '../core/errors.js';
import type { Theme, ThemePalette } from '../themes/types.js';

/** Correspondencia entre un color del tema claro y su equivalente oscuro. */
export interface ColorPair {
  light: string;
  dark: string;
}

/** Roles de la paleta, en el orden en que se emiten las variables. */
const SCALAR_ROLES = [
  'background',
  'surface',
  'surfaceAlt',
  'border',
  'text',
  'textMuted',
  'primary',
  'primaryText',
  'accent',
  'positive',
  'negative',
  'neutral',
] as const satisfies ReadonlyArray<keyof ThemePalette>;

/**
 * Empareja cada color de la paleta clara con su equivalente oscuro.
 *
 * Un mismo hexadecimal puede cumplir varios roles —en el tema corporativo, el
 * fondo y el texto sobre el color primario son ambos blanco— y eso es correcto
 * siempre que todos los roles lleven al mismo color oscuro. Si no coincidieran,
 * la sustitucion seria ambigua y el tema esta mal definido, asi que se rechaza
 * en el arranque en lugar de producir una imagen ilegible.
 */
export function colorPairs(theme: Theme): ColorPair[] {
  const light = theme.palette;
  const dark = theme.dark.palette;

  const mapping = new Map<string, string>();
  const add = (from: string, to: string, role: string): void => {
    const key = normalize(from);
    const value = normalize(to);
    const existing = mapping.get(key);
    if (existing !== undefined && existing !== value) {
      throw new ConfigError(
        `el tema "${theme.name}" asigna dos colores oscuros distintos al mismo color claro`,
        `${from} -> ${existing} y ${value} (rol "${role}")`,
      );
    }
    mapping.set(key, value);
  };

  for (const role of SCALAR_ROLES) add(light[role], dark[role], role);
  light.categorical.forEach((color, i) => add(color, dark.categorical[i]!, `categorical[${i}]`));
  light.sequential.forEach((color, i) => add(color, dark.sequential[i]!, `sequential[${i}]`));

  return [...mapping.entries()]
    .filter(([from, to]) => from !== to)
    .map(([light_, dark_]) => ({ light: light_, dark: dark_ }));
}

/**
 * Reescribe los colores del tema como variables CSS y anade el bloque que las
 * redefine en modo oscuro.
 *
 * Devuelve el SVG sin tocar si el tema no declara contraparte oscura, o si
 * ninguno de sus colores aparece en la imagen (por ejemplo un diagrama de D2,
 * que trae su propio tema y su propio bloque de modo oscuro).
 */
export function applyColorScheme(svg: string, theme: Theme): string {
  // D2 y el emisor propio de LikeC4 ya declaran su variante oscura. Volver a
  // sustituir sus colores anidaria variables sin efecto y solo anadiria ruido.
  if (/prefers-color-scheme/i.test(svg)) return svg;

  const pairs = colorPairs(theme);
  if (pairs.length === 0) return svg;

  const declarations: string[] = [];
  let out = svg;

  pairs.forEach((pair, index) => {
    const variable = `--dv${index + 1}`;
    const patterns = hexPatterns(pair.light);
    let used = false;
    for (const pattern of patterns) {
      const before = out;
      out = out.replace(pattern, `var(${variable},${pair.light})`);
      if (out !== before) used = true;
    }
    if (used) declarations.push(`${variable}:${pair.light};|${variable}:${pair.dark};`);
  });

  if (declarations.length === 0) return svg;

  const lightBlock = declarations.map((d) => d.split('|')[0]!).join('');
  const darkBlock = declarations.map((d) => d.split('|')[1]!).join('');
  const style =
    `<style>:root{${lightBlock}}` +
    `@media (prefers-color-scheme:dark){:root{${darkBlock}}}</style>`;

  const openTag = /<svg\b[^>]*>/i.exec(out);
  if (openTag === null) return svg;
  const at = openTag.index + openTag[0].length;
  return `${out.slice(0, at)}${style}${out.slice(at)}`;
}

/**
 * Formas en que un motor puede escribir el mismo color.
 *
 * El limite posterior evita que `#12508F` coincida dentro de `#12508FF0`, y la
 * ausencia de limite anterior no hace falta porque `#` ya delimita por delante.
 */
function hexPatterns(hex: string): RegExp[] {
  const body = hex.slice(1);
  const patterns = [new RegExp(`#${body}(?![0-9a-fA-F])`, 'gi')];
  // Notacion corta: `#FFFFFF` puede aparecer como `#fff`.
  if (body[0] === body[1] && body[2] === body[3] && body[4] === body[5]) {
    patterns.push(new RegExp(`#${body[0]}${body[2]}${body[4]}(?![0-9a-fA-F])`, 'gi'));
  }
  return patterns;
}

function normalize(hex: string): string {
  return hex.trim().toUpperCase();
}
