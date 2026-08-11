/**
 * Pruebas del emisor SVG de LikeC4.
 *
 * Es una funcion pura sobre una vista ya distribuida, asi que se puede
 * verificar el dibujo sin arrancar el servicio de lenguaje.
 */

import { describe, expect, it } from 'vitest';
import { blend, contrastText, renderLikeC4View, wrap, type LikeC4View } from '../../src/renderers/likec4-svg.js';
import { getTheme } from '../../src/themes/index.js';

const theme = getTheme('corporate');

function node(overrides: Partial<LikeC4View['nodes'][number]> = {}): LikeC4View['nodes'][number] {
  return {
    id: 'n1',
    parent: null,
    level: 0,
    children: [],
    title: 'Nodo',
    shape: 'rectangle',
    color: 'primary',
    x: 0,
    y: 0,
    width: 240,
    height: 135,
    ...overrides,
  };
}

function view(overrides: Partial<LikeC4View> = {}): LikeC4View {
  return {
    id: 'index',
    title: 'Vista',
    bounds: { x: 0, y: 0, width: 240, height: 135 },
    nodes: [node()],
    edges: [],
    ...overrides,
  };
}

describe('renderLikeC4View — estructura', () => {
  it('emite un SVG con dimensiones absolutas y margen', () => {
    const svg = renderLikeC4View(view(), theme);
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="288"'); // 240 + 24*2 de padding
    expect(svg).toContain('height="183"');
    expect(svg).toContain('viewBox="0 0 288 183"');
  });

  it('pinta el fondo del tema como variable con respaldo', () => {
    const svg = renderLikeC4View(view(), theme);
    expect(svg).toContain(`fill="var(--lc2,${theme.likec4.background})"`);
    // El valor claro se declara y el oscuro lo sustituye segun el visor.
    expect(svg).toContain(`--lc2:${theme.likec4.background};`);
    expect(svg).toContain(`--lc2:${theme.dark.likec4.background};`);
  });

  it('declara la variante oscura una sola vez', () => {
    const svg = renderLikeC4View(view(), theme);
    expect(svg.match(/@media \(prefers-color-scheme:dark\)/g)).toHaveLength(1);
  });

  it('desplaza el contenido cuando los limites no empiezan en el origen', () => {
    const svg = renderLikeC4View(view({ bounds: { x: -50, y: -20, width: 100, height: 60 } }), theme);
    expect(svg).toContain('translate(74,44)');
  });

  it('escribe el titulo del nodo', () => {
    expect(renderLikeC4View(view(), theme)).toContain('>Nodo<');
  });

  it('escapa caracteres XML del titulo', () => {
    const svg = renderLikeC4View(view({ nodes: [node({ title: 'A & <B>' })] }), theme);
    expect(svg).toContain('A &amp; &lt;B&gt;');
  });
});

describe('renderLikeC4View — formas', () => {
  const shapes = [
    ['rectangle', '<rect'],
    ['person', '<circle'],
    ['cylinder', '<path'],
    ['storage', '<path'],
    ['queue', '<rect'],
    ['browser', '<circle'],
    ['mobile', '<rect'],
    ['component', '<rect'],
    ['document', '<path'],
    ['bucket', '<path'],
  ] as const;

  for (const [shape, expected] of shapes) {
    it(`dibuja la forma ${shape}`, () => {
      const svg = renderLikeC4View(view({ nodes: [node({ shape })] }), theme);
      expect(svg).toContain(expected);
    });
  }

  it('una forma desconocida cae a rectangulo', () => {
    expect(renderLikeC4View(view({ nodes: [node({ shape: 'dodecaedro' })] }), theme)).toContain('<rect');
  });
});

describe('renderLikeC4View — texto y contraste', () => {
  it('anade descripcion y tecnologia', () => {
    const svg = renderLikeC4View(
      view({ nodes: [node({ description: 'Nucleo de negocio', technology: 'NestJS' })] }),
      theme,
    );
    expect(svg).toContain('Nucleo de negocio');
    expect(svg).toContain('[NestJS]');
  });

  it('acepta la descripcion como objeto con txt', () => {
    const svg = renderLikeC4View(view({ nodes: [node({ description: { txt: 'Desde objeto' } })] }), theme);
    expect(svg).toContain('Desde objeto');
  });

  it('elige texto oscuro sobre relleno claro y claro sobre oscuro', () => {
    expect(contrastText('#FFFFFF', theme.palette)).toBe('#12181F');
    expect(contrastText('#12508F', theme.palette)).toBe('#FFFFFF');
  });

  it('el texto del nodo se invierte entre modo claro y oscuro', () => {
    // El relleno se compone contra fondos distintos en cada modo, asi que el
    // color legible tambien cambia; ambos deben quedar declarados.
    const svg = renderLikeC4View(view({ nodes: [node({ style: { opacity: 15 } })] }), theme);
    expect(svg).toContain('#12181F');
    expect(svg).toContain('#FFFFFF');
  });

  it('cae al color de texto de la paleta si el relleno no es hexadecimal', () => {
    expect(contrastText('rgb(1,2,3)', theme.palette)).toBe(theme.palette.text);
  });

  it('la opacidad de LikeC4 se compone contra el fondo, no se emite como alpha', () => {
    const svg = renderLikeC4View(view({ nodes: [node({ style: { opacity: 15 } })] }), theme);
    // Sin composicion el texto claro quedaria sobre un azul claro ilegible.
    expect(svg).not.toContain('fill-opacity="0.15"');
    expect(svg).toContain('#12181F');
  });
});

describe('renderLikeC4View — contenedores', () => {
  it('dibuja los grupos con borde discontinuo y su titulo arriba', () => {
    const svg = renderLikeC4View(
      view({
        bounds: { x: 0, y: 0, width: 400, height: 300 },
        nodes: [
          node({ id: 'grupo', title: 'Plataforma', children: ['hijo'], width: 400, height: 300 }),
          node({ id: 'hijo', title: 'API', parent: 'grupo', level: 1, x: 40, y: 60 }),
        ],
      }),
      theme,
    );
    expect(svg).toContain('stroke-dasharray="6 4"');
    expect(svg).toContain('Plataforma');
    expect(svg).toContain('API');
  });
});

describe('renderLikeC4View — relaciones', () => {
  const withEdge = (edge: Partial<LikeC4View['edges'][number]>): string =>
    renderLikeC4View(
      view({
        nodes: [node({ id: 'a' }), node({ id: 'b', y: 200 })],
        edges: [{ id: 'e1', source: 'a', target: 'b', points: [[10, 10], [10, 50], [10, 90], [10, 130]], ...edge }],
      }),
      theme,
    );

  it('dibuja una curva Bezier con punta de flecha', () => {
    const svg = withEdge({});
    expect(svg).toContain('M 10 10 C 10 50, 10 90, 10 130');
    expect(svg).toContain('marker-end="url(#lc4-arrow)"');
  });

  it('respeta el estilo de linea', () => {
    expect(withEdge({ line: 'dashed' })).toContain('stroke-dasharray="7 5"');
    expect(withEdge({ line: 'dotted' })).toContain('stroke-dasharray="2 4"');
    expect(withEdge({ line: 'solid' })).not.toContain('stroke-dasharray');
  });

  it('elige el marcador segun la punta declarada', () => {
    expect(withEdge({ head: 'diamond' })).toContain('url(#lc4-diamond)');
    expect(withEdge({ head: 'dot' })).toContain('url(#lc4-dot)');
    expect(withEdge({ head: 'open' })).toContain('url(#lc4-arrow-open)');
  });

  it('anade marcador de origen si la relacion lo declara', () => {
    expect(withEdge({ tail: 'diamond' })).toContain('marker-start=');
    expect(withEdge({ tail: 'none' })).not.toContain('marker-start=');
  });

  it('dibuja la etiqueta con fondo para que no se pierda sobre la linea', () => {
    const svg = withEdge({ label: 'Consulta' });
    expect(svg).toContain('Consulta');
    expect(svg).toContain('fill-opacity="0.92"');
  });

  it('omite la etiqueta vacia', () => {
    expect(withEdge({ label: '   ' })).not.toContain('fill-opacity="0.92"');
  });

  it('ignora relaciones sin puntos suficientes', () => {
    const svg = renderLikeC4View(
      view({ edges: [{ id: 'e', source: 'a', target: 'b', points: [[0, 0]] }] }),
      theme,
    );
    expect(svg).not.toContain('data-edge');
  });

  it('cierra con segmentos rectos los puntos que no completan una tripleta', () => {
    const svg = renderLikeC4View(
      view({ edges: [{ id: 'e', source: 'a', target: 'b', points: [[0, 0], [10, 10], [20, 20]] }] }),
      theme,
    );
    expect(svg).toContain('L 10 10');
  });
});

describe('wrap', () => {
  it('parte por palabras respetando el ancho', () => {
    expect(wrap('uno dos tres cuatro', 40, 12, 3).length).toBeGreaterThan(1);
  });

  it('nunca supera el maximo de lineas', () => {
    expect(wrap('a b c d e f g h i j k', 20, 12, 2)).toHaveLength(2);
  });

  it('marca con elipsis el texto truncado', () => {
    expect(wrap('a b c d e f g h i j k', 20, 12, 2)[1]).toMatch(/\.\.\.$/);
  });

  it('no rompe una palabra mas ancha que el limite', () => {
    expect(wrap('palabramuylargaquenocabe', 10, 12, 2)).toEqual(['palabramuylargaquenocabe']);
  });

  it('devuelve lista vacia para texto vacio', () => {
    expect(wrap('   ', 100, 12, 2)).toEqual([]);
  });
});

describe('blend', () => {
  it('compone un color sobre otro', () => {
    expect(blend('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(blend('#000000', '#FFFFFF', 1)).toBe('#000000');
    expect(blend('#000000', '#FFFFFF', 0)).toBe('#ffffff');
  });

  it('admite notacion corta de tres digitos', () => {
    expect(blend('#000', '#fff', 0)).toBe('#ffffff');
  });

  it('devuelve el color original si no es hexadecimal', () => {
    expect(blend('red', '#fff', 0.5)).toBe('red');
  });
});
