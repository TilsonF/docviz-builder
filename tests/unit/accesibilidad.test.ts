/**
 * El contrato de accesibilidad del SVG.
 *
 * Un diagrama sin nombre accesible se anuncia como «imagen» y no dice nada, y
 * dos diagramas en la misma pagina con los mismos ids se pisan el nombre y la
 * paleta. Las dos cosas se comprobaban a ojo y ninguna fallaba el build.
 */

import { describe, expect, it } from 'vitest';
import { dedupeSvgIds, finalizeSvg, injectAccessibility, svgRootId } from '../../src/renderers/svg-utils.js';
import { applyColorScheme } from '../../src/renderers/color-scheme.js';
import { resolveTheme } from '../../src/themes/index.js';
import { defaultConfig } from '../../src/config/load.js';

const base = '<svg viewBox="0 0 100 50" width="100" height="50"><rect fill="#12508F" width="10" height="10"/></svg>';

describe('injectAccessibility', () => {
  it('pone role, title, desc y un aria-labelledby que resuelve', () => {
    const out = injectAccessibility(base, { title: 'Flujo', description: 'Tres pasos', prefix: 'dvabc' });
    expect(out).toContain('role="img"');
    expect(out).toContain('<title id="dvabc-t">Flujo</title>');
    expect(out).toContain('<desc id="dvabc-d">Tres pasos</desc>');
    expect(out).toContain('aria-labelledby="dvabc-t dvabc-d"');
  });

  it('el titulo es el primer hijo', () => {
    const out = injectAccessibility(base, { title: 'Flujo', prefix: 'dvabc' });
    expect(/<svg\b[^>]*><title\b/.test(out)).toBe(true);
  });

  it('sin titulo ni descripcion no inventa un nombre vacio', () => {
    const out = injectAccessibility(base, { prefix: 'dvabc' });
    expect(out).not.toContain('aria-labelledby');
    expect(out).toContain('role="img"');
  });

  it('respeta el id que trae el motor', () => {
    // Mermaid acota su hoja de estilos con el id de la raiz: renombrarlo deja
    // el diagrama sin estilos.
    const conId = '<svg id="mermaid-7" viewBox="0 0 10 10"><style>#mermaid-7 .n{fill:red}</style></svg>';
    const out = injectAccessibility(conId, { title: 'T', prefix: 'dvabc' });
    expect(svgRootId(out)).toBe('mermaid-7');
    expect(out).toContain('#mermaid-7 .n');
  });

  it('aprovecha el title que ya traiga el motor en lugar de anadir otro', () => {
    const conTitulo = '<svg viewBox="0 0 10 10"><title>del motor</title></svg>';
    const out = injectAccessibility(conTitulo, { title: 'mio', prefix: 'dvabc' });
    expect(out.match(/<title/g)).toHaveLength(1);
    expect(out).toContain('<title id="dvabc-t">del motor</title>');
    expect(out).toContain('aria-labelledby="dvabc-t"');
  });
});

describe('ids por diagrama', () => {
  it('dos diagramas no comparten ningun id', () => {
    const svg = '<svg viewBox="0 0 10 10"><clipPath id="clip1"/><g clip-path="url(#clip1)"/></svg>';
    const a = finalizeSvg(svg, { title: 'A', idPrefix: 'dvaaa' });
    const b = finalizeSvg(svg, { title: 'B', idPrefix: 'dvbbb' });
    const ids = (texto: string): string[] => [...texto.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]!);
    expect(ids(a).some((id) => ids(b).includes(id))).toBe(false);
    // Y la referencia interna sigue apuntando a su propio recorte.
    expect(a).toContain('url(#dvaaa1)');
    expect(b).toContain('url(#dvbbb1)');
  });
});

describe('variables CSS acotadas', () => {
  it('se declaran sobre la raiz del SVG, no sobre :root', () => {
    const theme = resolveTheme(defaultConfig('/tmp'));
    const svg = applyColorScheme(finalizeSvg(base, { title: 'A', idPrefix: 'dvaaa' }), theme);
    if (!svg.includes('<style>')) return; // el tema no declara contraparte oscura
    expect(svg).not.toContain('<style>:root{');
    expect(svg).toContain('<style>#dvaaa{');
    expect(svg).toContain('@media (prefers-color-scheme:dark){#dvaaa{');
  });
});

describe('casos de borde del post-proceso', () => {
  it('lo que no es un SVG se devuelve tal cual', () => {
    expect(injectAccessibility('no es un svg', { title: 'T' })).toBe('no es un svg');
    expect(svgRootId('no es un svg')).toBeUndefined();
  });

  it('respeta un aria-labelledby que ya venga puesto', () => {
    const conAria = '<svg aria-labelledby="otro" viewBox="0 0 1 1"><rect/></svg>';
    const out = injectAccessibility(conAria, { title: 'T', prefix: 'dva' });
    expect(out).toContain('aria-labelledby="otro"');
  });

  it('no anade un segundo <desc> si el motor ya trae uno', () => {
    const conDesc = '<svg viewBox="0 0 1 1"><desc>del motor</desc></svg>';
    const out = injectAccessibility(conDesc, { description: 'mia', prefix: 'dva' });
    expect(out.match(/<desc/g)).toHaveLength(1);
  });

  it('aprovecha el id que el motor ya le puso a su <title>', () => {
    const conId = '<svg viewBox="0 0 1 1"><title id="suyo">T</title></svg>';
    const out = injectAccessibility(conId, { title: 'mio', prefix: 'dva' });
    expect(out).toContain('aria-labelledby="suyo"');
  });

  it('acota tambien el `:root` que escriben los motores', () => {
    const fuga = '<svg id="raiz" viewBox="0 0 1 1"><style>:root{--mermaid-font-family:x}</style></svg>';
    const out = injectAccessibility(fuga, { title: 'T', prefix: 'dva' });
    expect(out).toContain('#raiz{--mermaid-font-family:x}');
    expect(out).not.toContain(':root{');
  });

  it('un SVG sin `:root` no se reescribe', () => {
    const limpio = '<svg id="raiz" viewBox="0 0 1 1"><style>.a{fill:red}</style></svg>';
    expect(injectAccessibility(limpio, { prefix: 'dva' })).toContain('.a{fill:red}');
  });

  it('desduplica un id repetido sin tocar las referencias', () => {
    // Es el mapa de Mermaid: el grupo y su path llevan el mismo id. Un
    // navegador ya resolvia `#n` contra el primero, asi que el dibujo no cambia.
    const svg = '<svg viewBox="0 0 10 10"><g id="n"/><path id="n"/><use href="#n"/></svg>';
    const out = dedupeSvgIds(svg, 'dva');
    expect(out).toContain('<g id="n"/>');
    expect(out).toContain('id="dvadup1"');
    expect(out).toContain('href="#n"');
  });

  it('no confunde data-id con id al desduplicar', () => {
    const svg = '<svg><g data-id="e1"/><text data-id="e1">x</text></svg>';
    expect(dedupeSvgIds(svg, 'dva')).toBe(svg);
  });
});
