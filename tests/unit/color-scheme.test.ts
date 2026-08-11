/**
 * Esquema de color dual.
 *
 * La imagen generada debe leerse bien en un visor claro y en uno oscuro sin
 * generar dos archivos.
 */

import { describe, expect, it } from 'vitest';
import { applyColorScheme, colorPairs } from '../../src/renderers/color-scheme.js';
import { getTheme, themeNames } from '../../src/themes/index.js';

const corporate = getTheme('corporate');

describe('colorPairs', () => {
  it('empareja los colores de la paleta clara con los de la oscura', () => {
    const pairs = colorPairs(corporate);
    expect(pairs.length).toBeGreaterThan(8);
    const background = pairs.find((p) => p.light === corporate.palette.background.toUpperCase());
    expect(background?.dark).toBe(corporate.dark.palette.background.toUpperCase());
  });

  it('omite los colores que no cambian', () => {
    for (const pair of colorPairs(corporate)) expect(pair.light).not.toBe(pair.dark);
  });

  it('el tema oscuro no declara pares: ya es oscuro', () => {
    expect(colorPairs(getTheme('dark'))).toEqual([]);
  });

  it('ningun tema asigna dos colores oscuros al mismo color claro', () => {
    // Un mismo hexadecimal puede cumplir varios roles; lo que no puede es
    // resolverse a dos colores distintos en modo oscuro.
    for (const name of themeNames()) {
      expect(() => colorPairs(getTheme(name))).not.toThrow();
    }
  });

  it('todos los pares estan normalizados en mayusculas', () => {
    for (const pair of colorPairs(corporate)) {
      expect(pair.light).toBe(pair.light.toUpperCase());
      expect(pair.dark).toBe(pair.dark.toUpperCase());
    }
  });
});

describe('applyColorScheme', () => {
  const svgWith = (body: string): string => `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

  it('convierte los colores del tema en variables con respaldo', () => {
    const out = applyColorScheme(svgWith(`<rect fill="${corporate.palette.primary}"/>`), corporate);
    expect(out).toMatch(/fill="var\(--dv\d+,#12508F\)"/i);
  });

  it('declara el valor claro y su sustituto oscuro', () => {
    const out = applyColorScheme(svgWith(`<rect fill="${corporate.palette.background}"/>`), corporate);
    expect(out).toContain('@media (prefers-color-scheme:dark)');
    expect(out).toContain(corporate.palette.background);
    expect(out).toContain(corporate.dark.palette.background);
  });

  it('alcanza tambien los estilos en linea y las hojas de estilo incrustadas', () => {
    const out = applyColorScheme(
      svgWith(
        `<style>.a{fill:${corporate.palette.text};}</style><rect style="fill:${corporate.palette.primary}"/>`,
      ),
      corporate,
    );
    expect(out).toMatch(/\.a\{fill:var\(--dv\d+,#102A43\);\}/i);
    expect(out).toMatch(/style="fill:var\(--dv\d+,#12508F\)"/i);
  });

  it('reconoce la notacion corta de tres digitos', () => {
    const out = applyColorScheme(svgWith('<rect fill="#fff"/>'), corporate);
    expect(out).toMatch(/fill="var\(--dv\d+,#FFFFFF\)"/i);
  });

  it('no confunde un color con el prefijo de otro mas largo', () => {
    const out = applyColorScheme(svgWith('<rect fill="#12508FF0"/>'), corporate);
    expect(out).toContain('#12508FF0');
    expect(out).not.toContain('var(');
  });

  it('no toca un SVG que ya declara su propia variante oscura', () => {
    // D2 y el emisor de LikeC4 traen la suya: volver a sustituir solo anadiria
    // variables anidadas sin efecto.
    const svg = svgWith(
      `<style>@media (prefers-color-scheme: dark){.a{fill:#000;}}</style><rect fill="${corporate.palette.primary}"/>`,
    );
    expect(applyColorScheme(svg, corporate)).toBe(svg);
  });

  it('no toca un SVG sin colores del tema', () => {
    const svg = svgWith('<rect fill="#123456"/>');
    expect(applyColorScheme(svg, corporate)).toBe(svg);
  });

  it('el tema oscuro no anade nada', () => {
    const dark = getTheme('dark');
    const svg = svgWith(`<rect fill="${dark.palette.primary}"/>`);
    expect(applyColorScheme(svg, dark)).toBe(svg);
  });

  it('es determinista', () => {
    const svg = svgWith(`<rect fill="${corporate.palette.primary}"/><rect fill="${corporate.palette.text}"/>`);
    expect(applyColorScheme(svg, corporate)).toBe(applyColorScheme(svg, corporate));
  });

  it('solo declara las variables que aparecen en la imagen', () => {
    const out = applyColorScheme(svgWith(`<rect fill="${corporate.palette.primary}"/>`), corporate);
    const declared = out.match(/--dv\d+:/g) ?? [];
    // Una declaracion en el bloque claro y otra en el oscuro.
    expect(declared).toHaveLength(2);
  });
});

describe('paletas oscuras de los temas', () => {
  it('los temas claros declaran una contraparte oscura distinta', () => {
    for (const name of ['default', 'corporate', 'executive']) {
      const theme = getTheme(name);
      expect(theme.dark.palette.background).not.toBe(theme.palette.background);
      expect(theme.dark.likec4.background).toBe(theme.dark.palette.background);
    }
  });

  it('el fondo oscuro es realmente oscuro y el texto claro', () => {
    for (const name of themeNames()) {
      const { dark } = getTheme(name);
      expect(luminance(dark.palette.background)).toBeLessThan(0.2);
      expect(luminance(dark.palette.text)).toBeGreaterThan(0.5);
    }
  });

  it('el texto oscuro contrasta con su fondo', () => {
    for (const name of themeNames()) {
      const theme = getTheme(name);
      expect(contrastRatio(theme.dark.palette.text, theme.dark.palette.background)).toBeGreaterThan(7);
      expect(contrastRatio(theme.palette.text, theme.palette.background)).toBeGreaterThan(7);
    }
  });

  it('el texto sobre el color primario contrasta en ambos modos', () => {
    for (const name of themeNames()) {
      const theme = getTheme(name);
      expect(contrastRatio(theme.palette.primaryText, theme.palette.primary)).toBeGreaterThan(4.5);
      expect(contrastRatio(theme.dark.palette.primaryText, theme.dark.palette.primary)).toBeGreaterThan(4.5);
    }
  });
});

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (m === null) return 0;
  const body = m[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => channel(Number.parseInt(body.slice(i, i + 2), 16))) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
