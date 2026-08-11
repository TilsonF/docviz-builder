/**
 * Temas incluidos: default, corporate, executive y dark.
 *
 * Todos comparten estructura; solo cambian los valores. Anadir un tema nuevo es
 * anadir una entrada a `THEMES`, sin tocar ningun renderer.
 */

import { fingerprint } from '../core/hash.js';
import { ConfigError } from '../core/errors.js';
import type { Theme, ThemePalette } from './types.js';

export type { Theme, ThemePalette } from './types.js';

const SANS = "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";
const ENGINE_FONT = 'Helvetica';

function buildTheme(args: {
  name: string;
  description: string;
  palette: ThemePalette;
  /** Contraparte oscura. Si se omite, el tema no cambia con el modo del visor. */
  darkPalette?: ThemePalette;
  d2ThemeID: number;
  d2DarkThemeID: number;
  mermaidBase: 'base' | 'dark';
  fontFamily?: string;
}): Theme {
  const p = args.palette;
  const dark = args.darkPalette ?? args.palette;
  const font = args.fontFamily ?? SANS;
  // PlantUML (AWT) y Graphviz calculan las metricas del texto a partir de una
  // fuente concreta instalada, no de una lista de alternativas. Si el nombre no
  // existe caen a una serif y el diagrama desentona con el resto. Helvetica esta
  // presente (o se resuelve a Arial) en macOS, Windows y Linux.
  const engineFont = ENGINE_FONT;

  return {
    name: args.name,
    description: args.description,
    fontFamily: font,
    monoFontFamily: MONO,
    palette: p,
    plantuml: {
      skinparams: [
        'skinparam backgroundColor ' + p.background,
        'skinparam shadowing false',
        'skinparam defaultFontName "' + engineFont + '"',
        'skinparam defaultFontSize 13',
        'skinparam defaultFontColor ' + p.text,
        'skinparam roundCorner 8',
        'skinparam ArrowColor ' + p.textMuted,
        'skinparam ArrowFontColor ' + p.text,
        'skinparam ArrowFontSize 12',
        'skinparam ActorBorderColor ' + p.primary,
        'skinparam ActorBackgroundColor ' + p.surface,
        'skinparam ActorFontColor ' + p.text,
        'skinparam ParticipantBorderColor ' + p.primary,
        'skinparam ParticipantBackgroundColor ' + p.surface,
        'skinparam ParticipantFontColor ' + p.text,
        'skinparam SequenceLifeLineBorderColor ' + p.border,
        'skinparam SequenceGroupBorderColor ' + p.border,
        'skinparam SequenceGroupBackgroundColor ' + p.surfaceAlt,
        'skinparam SequenceBoxBackgroundColor ' + p.surfaceAlt,
        'skinparam NoteBackgroundColor ' + p.surfaceAlt,
        'skinparam NoteBorderColor ' + p.border,
        'skinparam NoteFontColor ' + p.text,
        'skinparam ClassBorderColor ' + p.primary,
        'skinparam ClassBackgroundColor ' + p.surface,
        'skinparam ClassFontColor ' + p.text,
        'skinparam ClassAttributeFontColor ' + p.textMuted,
        'skinparam StateBorderColor ' + p.primary,
        'skinparam StateBackgroundColor ' + p.surface,
        'skinparam StateFontColor ' + p.text,
        'skinparam ActivityBorderColor ' + p.primary,
        'skinparam ActivityBackgroundColor ' + p.surface,
        'skinparam ActivityFontColor ' + p.text,
        'skinparam ActivityDiamondBorderColor ' + p.accent,
        'skinparam ActivityDiamondBackgroundColor ' + p.surfaceAlt,
      ],
    },
    mermaid: {
      theme: args.mermaidBase,
      themeVariables: {
        background: p.background,
        primaryColor: p.surface,
        primaryTextColor: p.text,
        primaryBorderColor: p.primary,
        secondaryColor: p.surfaceAlt,
        tertiaryColor: p.background,
        lineColor: p.textMuted,
        textColor: p.text,
        fontFamily: font,
        fontSize: '14px',
        mainBkg: p.surface,
        nodeBorder: p.primary,
        clusterBkg: p.surfaceAlt,
        clusterBorder: p.border,
        edgeLabelBackground: p.background,
        titleColor: p.text,
        // Gantt
        sectionBkgColor: p.surfaceAlt,
        altSectionBkgColor: p.background,
        sectionBkgColor2: p.surfaceAlt,
        taskBkgColor: p.primary,
        taskTextColor: p.primaryText,
        taskTextLightColor: p.text,
        taskTextOutsideColor: p.text,
        taskTextDarkColor: p.text,
        activeTaskBkgColor: p.accent,
        activeTaskBorderColor: p.accent,
        doneTaskBkgColor: p.neutral,
        doneTaskBorderColor: p.border,
        critBkgColor: p.negative,
        critBorderColor: p.negative,
        gridColor: p.border,
        todayLineColor: p.negative,
      },
    },
    d2: {
      themeID: args.d2ThemeID,
      darkThemeID: args.d2DarkThemeID,
      sketch: false,
      pad: 40,
    },
    graphviz: {
      graph: {
        bgcolor: p.background,
        fontname: engineFont,
        fontsize: '13',
        fontcolor: p.text,
        rankdir: 'TB',
        nodesep: '0.45',
        ranksep: '0.55',
        pad: '0.3',
        splines: 'spline',
      },
      node: {
        shape: 'box',
        style: 'filled,rounded',
        fillcolor: p.surface,
        color: p.primary,
        fontname: engineFont,
        fontsize: '12',
        fontcolor: p.text,
        penwidth: '1.4',
        margin: '0.18,0.10',
      },
      edge: {
        color: p.textMuted,
        fontname: engineFont,
        fontsize: '11',
        fontcolor: p.textMuted,
        penwidth: '1.2',
        arrowsize: '0.8',
      },
    },
    vegaLite: {
      width: 520,
      height: 300,
      config: {
        background: p.background,
        font: font,
        padding: 12,
        title: { color: p.text, fontSize: 15, fontWeight: 600, anchor: 'start', offset: 14 },
        axis: {
          labelColor: p.textMuted,
          labelFontSize: 11,
          titleColor: p.text,
          titleFontSize: 12,
          titleFontWeight: 500,
          domainColor: p.border,
          tickColor: p.border,
          gridColor: p.border,
          gridOpacity: 0.5,
          labelPadding: 4,
        },
        axisX: { labelAngle: 0 },
        legend: {
          labelColor: p.textMuted,
          titleColor: p.text,
          labelFontSize: 11,
          titleFontSize: 12,
          symbolType: 'square',
        },
        view: { stroke: 'transparent' },
        range: { category: [...p.categorical], heatmap: [...p.sequential], ramp: [...p.sequential] },
        bar: { color: p.primary, cornerRadiusEnd: 2 },
        line: { color: p.primary, strokeWidth: 2 },
        point: { color: p.primary, filled: true, size: 60 },
        area: { color: p.primary, opacity: 0.75 },
        rect: { color: p.primary },
        text: { color: p.text, fontSize: 11 },
      },
    },
    likec4: likec4Palette(p),
    dark: {
      palette: dark,
      likec4: likec4Palette(dark),
    },
  };
}

/** Correspondencia entre los colores de LikeC4 y la paleta del tema. */
function likec4Palette(p: ThemePalette): Theme['likec4'] {
  return {
    background: p.background,
    nodeFill: {
      primary: p.primary,
      blue: p.categorical[0],
      green: p.positive,
      amber: p.categorical[3],
      red: p.negative,
      gray: p.surfaceAlt,
      slate: p.surfaceAlt,
      secondary: p.accent,
      muted: p.surfaceAlt,
      indigo: p.categorical[1],
      sky: p.categorical[2],
    },
    nodeStroke: {
      primary: p.primary,
      blue: p.categorical[0],
      green: p.positive,
      amber: p.accent,
      red: p.negative,
      gray: p.border,
      slate: p.border,
      secondary: p.accent,
      muted: p.border,
      indigo: p.categorical[1],
      sky: p.categorical[2],
    },
    nodeText: p.primaryText,
    nodeTextMuted: p.primaryText,
    groupFill: p.surfaceAlt,
    groupStroke: p.border,
    edgeStroke: p.textMuted,
    edgeText: p.text,
  };
}

const defaultTheme = buildTheme({
  name: 'default',
  description: 'Paleta neutra de alto contraste, apta para cualquier documento.',
  d2ThemeID: 0,
  d2DarkThemeID: 200,
  mermaidBase: 'base',
  palette: {
    background: '#FFFFFF',
    surface: '#F4F6F8',
    surfaceAlt: '#E9EDF1',
    border: '#C9D1D9',
    text: '#1B2733',
    textMuted: '#5A6B7C',
    primary: '#2F6FEB',
    primaryText: '#FFFFFF',
    accent: '#8250DF',
    categorical: ['#2F6FEB', '#8250DF', '#1A7F64', '#C4820E', '#C2410C', '#0E7490'],
    sequential: ['#EAF1FE', '#C3D8FB', '#8FB4F5', '#5A8FEE', '#2F6FEB', '#1A4CB0'],
    positive: '#1A7F64',
    negative: '#C2410C',
    neutral: '#94A3B8',
  },
  darkPalette: {
    background: '#0D1117',
    surface: '#161B22',
    surfaceAlt: '#21262D',
    border: '#30363D',
    text: '#E6EDF3',
    textMuted: '#9BA7B4',
    primary: '#4C8DFF',
    primaryText: '#0D1117',
    accent: '#A371F7',
    categorical: ['#4C8DFF', '#A371F7', '#3FB950', '#D29922', '#F0883E', '#39C5CF'],
    sequential: ['#10233D', '#16345C', '#1C4A85', '#2E68B8', '#4C8DFF', '#8CB6F5'],
    positive: '#3FB950',
    negative: '#F0883E',
    neutral: '#6E7681',
  },
});

const corporateTheme = buildTheme({
  name: 'corporate',
  description: 'Azul institucional sobrio para documentacion tecnica de empresa.',
  d2ThemeID: 1,
  d2DarkThemeID: 200,
  mermaidBase: 'base',
  palette: {
    background: '#FFFFFF',
    surface: '#EEF3FA',
    surfaceAlt: '#DDE7F4',
    border: '#B4C6DD',
    text: '#102A43',
    textMuted: '#486581',
    primary: '#12508F',
    primaryText: '#FFFFFF',
    accent: '#0F7A8A',
    categorical: ['#12508F', '#0F7A8A', '#7A5C12', '#8A2F4F', '#3B5BA5', '#146B4A'],
    sequential: ['#E7EFF9', '#C2D6EE', '#93B6DF', '#5D8FCB', '#2F6BAE', '#12508F'],
    positive: '#146B4A',
    negative: '#A8341F',
    neutral: '#8CA3BC',
  },
  darkPalette: {
    background: '#0D1117',
    surface: '#15202B',
    surfaceAlt: '#1D2C3A',
    border: '#2C3E52',
    text: '#DCE7F2',
    textMuted: '#93AECB',
    primary: '#5AA0E8',
    primaryText: '#0D1117',
    accent: '#3FB6C6',
    categorical: ['#5AA0E8', '#3FB6C6', '#D9B44A', '#E07A9B', '#8FAEE8', '#4CC08C'],
    sequential: ['#101E2C', '#16324B', '#1D4A70', '#2E6DA0', '#4189CE', '#5AA0E8'],
    positive: '#4CC08C',
    negative: '#F0836A',
    neutral: '#6B819A',
  },
});

const executiveTheme = buildTheme({
  name: 'executive',
  description: 'Alto contraste y aire generoso, pensado para laminas de direccion.',
  d2ThemeID: 4,
  d2DarkThemeID: 200,
  mermaidBase: 'base',
  palette: {
    background: '#FFFFFF',
    surface: '#F7F5F0',
    surfaceAlt: '#EDE9E0',
    border: '#CFC7B8',
    text: '#1C1917',
    textMuted: '#57534E',
    primary: '#1F3A5F',
    primaryText: '#FFFFFF',
    accent: '#B4611A',
    categorical: ['#1F3A5F', '#B4611A', '#2C6E56', '#7A2E4A', '#4A5568', '#8A6D1F'],
    sequential: ['#F0EEE9', '#D6D1C6', '#B0A895', '#7E7563', '#4F4A3E', '#1F3A5F'],
    positive: '#2C6E56',
    negative: '#9B2C1F',
    neutral: '#A8A29E',
  },
  darkPalette: {
    background: '#14120F',
    surface: '#1E1B17',
    surfaceAlt: '#2A2620',
    border: '#423C33',
    text: '#EDE8DF',
    textMuted: '#A8A093',
    primary: '#8FB3DA',
    primaryText: '#14120F',
    accent: '#E39A5C',
    categorical: ['#8FB3DA', '#E39A5C', '#6FC49E', '#D98CA8', '#9FAAB8', '#D8BE72'],
    sequential: ['#1B1814', '#2B2620', '#453E33', '#6B6152', '#8A8070', '#8FB3DA'],
    positive: '#6FC49E',
    negative: '#E8836F',
    neutral: '#8A857D',
  },
});

const darkTheme = buildTheme({
  name: 'dark',
  description: 'Fondo oscuro para portales de documentacion en modo noche.',
  d2ThemeID: 200,
  d2DarkThemeID: 200,
  mermaidBase: 'dark',
  palette: {
    background: '#0D1117',
    surface: '#161B22',
    surfaceAlt: '#21262D',
    border: '#30363D',
    text: '#E6EDF3',
    textMuted: '#9BA7B4',
    primary: '#4C8DFF',
    primaryText: '#0D1117',
    accent: '#A371F7',
    categorical: ['#4C8DFF', '#A371F7', '#3FB950', '#D29922', '#F0883E', '#39C5CF'],
    sequential: ['#0D2440', '#123A66', '#17518C', '#1E69B3', '#3A85D6', '#6FA8F0'],
    positive: '#3FB950',
    negative: '#F0883E',
    neutral: '#6E7681',
  },
});

export const THEMES: Readonly<Record<string, Theme>> = Object.freeze({
  default: defaultTheme,
  corporate: corporateTheme,
  executive: executiveTheme,
  dark: darkTheme,
});

export function themeNames(): string[] {
  return Object.keys(THEMES);
}

export function getTheme(name: string): Theme {
  const theme = THEMES[name];
  if (theme === undefined) {
    throw new ConfigError(
      `el tema "${name}" no existe`,
      `temas disponibles: ${themeNames().join(', ')}`,
    );
  }
  return theme;
}

/**
 * Huella del contenido del tema. Entra en el hash del recurso, de modo que
 * ajustar un color invalida automaticamente las imagenes afectadas.
 */
export function themeFingerprint(theme: Theme): string {
  return fingerprint(theme);
}
