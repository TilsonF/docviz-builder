/**
 * Pruebas del post-proceso de SVG: dimensiones, sanitizacion y titulo.
 *
 * Estas tres cosas son las que separan "el motor devolvio algo" de "la imagen
 * se ve bien en un visor Markdown y no ejecuta nada".
 */

import { describe, expect, it } from 'vitest';
import {
  ensureNamespace,
  finalizeSvg,
  injectTitle,
  normalizeSvgDimensions,
  sanitizeSvg,
  stabilizeSvgIds,
} from '../../src/renderers/svg-utils.js';

describe('normalizeSvgDimensions', () => {
  it('deriva width y height del viewBox cuando el ancho es porcentual', () => {
    // Es exactamente lo que emite Mermaid: sin esto la imagen sale de altura 0.
    const out = normalizeSvgDimensions('<svg width="100%" viewBox="0 0 400 200"></svg>');
    expect(out).toContain('width="400"');
    expect(out).toContain('height="200"');
  });

  it('respeta dimensiones ya numericas', () => {
    const out = normalizeSvgDimensions('<svg width="300" height="150" viewBox="0 0 300 150"></svg>');
    expect(out).toContain('width="300"');
    expect(out).toContain('height="150"');
  });

  it('anade viewBox si falta', () => {
    const out = normalizeSvgDimensions('<svg width="120" height="60"></svg>');
    expect(out).toContain('viewBox="0 0 120 60"');
  });

  it('elimina preserveAspectRatio="none" que deforma el dibujo al escalar', () => {
    const out = normalizeSvgDimensions('<svg preserveAspectRatio="none" width="10" height="5"></svg>');
    expect(out).not.toContain('preserveAspectRatio');
  });

  it('no rompe un documento sin elemento svg', () => {
    expect(normalizeSvgDimensions('<html></html>')).toBe('<html></html>');
  });
});

describe('sanitizeSvg', () => {
  it('elimina bloques script', () => {
    const out = sanitizeSvg('<svg><script>alert(1)</script><rect/></svg>');
    expect(out).not.toContain('script');
    expect(out).toContain('<rect/>');
  });

  it('elimina scripts autocerrados', () => {
    expect(sanitizeSvg('<svg><script src="x.js"/></svg>')).not.toContain('script');
  });

  it('elimina manejadores de eventos inline', () => {
    const out = sanitizeSvg('<svg><rect onclick="robar()" onmouseover=\'x\'/></svg>');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('onmouseover');
  });

  it('neutraliza enlaces javascript:', () => {
    const out = sanitizeSvg('<svg><a href="javascript:alert(1)"><text>x</text></a></svg>');
    expect(out).not.toContain('javascript:');
  });

  it('conserva el contenido grafico legitimo', () => {
    const svg = '<svg><path d="M0 0 L10 10" fill="#fff"/><text>Hola</text></svg>';
    expect(sanitizeSvg(svg)).toBe(svg);
  });
});

describe('stabilizeSvgIds', () => {
  it('renumera los ids en orden de aparicion', () => {
    const out = stabilizeSvgIds('<svg><clipPath id="clip7"/><rect id="otro"/></svg>');
    expect(out).toContain('id="dv1"');
    expect(out).toContain('id="dv2"');
    expect(out).not.toContain('clip7');
  });

  it('reescribe las referencias url(#...)', () => {
    const out = stabilizeSvgIds('<svg><clipPath id="clip3"/><g clip-path="url(#clip3)"/></svg>');
    expect(out).toContain('url(#dv1)');
    expect(out).not.toContain('clip3');
  });

  it('reescribe los selectores CSS acotados por el id raiz', () => {
    // Mermaid acota su hoja de estilos con el id del svg: si el selector no se
    // reescribe, el diagrama pierde todos los estilos y sale en negro.
    const svg = '<svg id="mi-diagrama"><style>#mi-diagrama .task{fill:#12508F;}</style><rect class="task"/></svg>';
    const out = stabilizeSvgIds(svg);
    expect(out).toContain('id="dv1"');
    expect(out).toContain('#dv1 .task{fill:#12508F;}');
    expect(out).not.toContain('mi-diagrama');
  });

  it('reescribe href a anclas locales', () => {
    const out = stabilizeSvgIds('<svg><path id="p1"/><use xlink:href="#p1"/></svg>');
    expect(out).toContain('xlink:href="#dv1"');
  });

  it('no confunde un id que es prefijo de otro', () => {
    const svg = '<svg id="d"><style>#d .a{fill:red}#d-grad .b{fill:blue}</style><linearGradient id="d-grad"/></svg>';
    const out = stabilizeSvgIds(svg);
    expect(out).toContain('#dv1 .a{fill:red}');
    expect(out).toContain('#dv2 .b{fill:blue}');
  });

  it('no toca un SVG sin ids', () => {
    const svg = '<svg><rect/></svg>';
    expect(stabilizeSvgIds(svg)).toBe(svg);
  });

  it('produce el mismo resultado para la misma entrada', () => {
    const svg = '<svg><clipPath id="clip9"/></svg>';
    expect(stabilizeSvgIds(svg)).toBe(stabilizeSvgIds(svg));
  });
});

describe('injectTitle y ensureNamespace', () => {
  it('inserta un title accesible', () => {
    expect(injectTitle('<svg><rect/></svg>', 'Mi diagrama')).toContain('<title>Mi diagrama</title>');
  });

  it('escapa el titulo', () => {
    expect(injectTitle('<svg></svg>', 'a & <b>')).toContain('<title>a &amp; &lt;b&gt;</title>');
  });

  it('no duplica un title existente', () => {
    const svg = '<svg><title>Original</title></svg>';
    expect(injectTitle(svg, 'Nuevo')).toBe(svg);
  });

  it('anade el namespace si falta', () => {
    expect(ensureNamespace('<svg></svg>')).toContain('xmlns="http://www.w3.org/2000/svg"');
  });
});

describe('finalizeSvg', () => {
  it('aplica todo el pipeline', () => {
    const out = finalizeSvg('<svg width="100%" viewBox="0 0 200 100"><script>x</script></svg>', 'Titulo');
    expect(out).toMatch(/^<\?xml version="1\.0"/);
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('width="200"');
    expect(out).toContain('<title>Titulo</title>');
    expect(out).not.toContain('script');
    expect(out.endsWith('\n')).toBe(true);
  });

  it('quita la instruccion de proceso propia de PlantUML', () => {
    const out = finalizeSvg('<?plantuml 1.2026.0?><svg width="10" height="10"></svg>');
    expect(out).not.toContain('plantuml');
  });

  it('es determinista', () => {
    const svg = '<svg width="100%" viewBox="0 0 50 25"></svg>';
    expect(finalizeSvg(svg, 'T')).toBe(finalizeSvg(svg, 'T'));
  });
});
