/**
 * Banco de vectores del saneador de SVG.
 *
 * Lo que sale de DocViz acaba en un wiki, en un PDF o incrustado dentro de un
 * HTML. Via `![](...)` el navegador lo carga como imagen y no ejecuta nada,
 * pero en cuanto alguien lo inlinea —que es lo natural para conservar el tema
 * claro/oscuro— el SVG pasa a ser markup vivo. Estas pruebas son la unica
 * garantia de que ahi no viaja nada ejecutable.
 *
 * La version anterior del saneador era una lista de prohibidos y dejaba pasar
 * nueve de estos trece vectores. Cada uno de los que se anadan aqui a partir de
 * ahora se queda para siempre.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from '../../src/renderers/svg-utils.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Un SVG es inerte si no queda nada que un navegador pueda ejecutar.
 *
 * Se comprueba sobre el texto **normalizado**: media docena de estos vectores
 * existen precisamente porque `java&#115;cript:` y `jav\tascript:` se leen
 * igual que `javascript:` en un navegador, y un detector que mirase la cadena
 * literal los daria por buenos.
 */
function inerte(svg: string): boolean {
  const normalizado = svg
    .replace(/&#x([0-9a-f]+);?/gi, (_m, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_m, d: string) => String.fromCodePoint(Number.parseInt(d, 10)))
    .replace(/[\s\u0000-\u001f]/g, '');

  if (/<\s*(script|iframe|object|embed|handler|animate|set)\b/i.test(svg)) return false;
  if (/\son[a-z]+\s*=/i.test(svg)) return false;
  if (/(?:javascript|vbscript|data|file|blob):/i.test(normalizado)) return false;
  if (/@import/i.test(normalizado)) return false;
  return true;
}

const VECTORES: ReadonlyArray<[string, string]> = [
  ['script directo', '<svg><script>alert(1)</script></svg>'],
  ['script anidado', '<svg><scr<script>ipt>alert(1)</script></svg>'],
  ['script autocerrado', '<svg><script src="//x.test/a.js"/></svg>'],
  ['onload', '<svg onload="alert(1)"></svg>'],
  ['onwheel (fuera de la lista vieja)', '<svg onwheel="alert(1)"></svg>'],
  ['ontoggle', '<svg><details ontoggle="alert(1)"></details></svg>'],
  ['onanimationstart', '<svg onanimationstart="alert(1)"></svg>'],
  ['oncopy', '<svg oncopy="alert(1)"></svg>'],
  ['handler tras un salto de linea', '<svg\n\tonload="alert(1)"></svg>'],
  ['handler sin comillas', '<svg onload=alert(1)></svg>'],
  ['animate hacia href', '<svg><a><animate attributeName="href" to="javascript:alert(1)"/></a></svg>'],
  ['set hacia href', '<svg><a><set attributeName="href" to="javascript:alert(1)"/></a></svg>'],
  ['href javascript sin comillas', '<svg><a href=javascript:alert(1)>x</a></svg>'],
  ['href con entidad numerica', '<svg><a href="java&#115;cript:alert(1)">x</a></svg>'],
  ['href con tabulador dentro', '<svg><a href="jav\tascript:alert(1)">x</a></svg>'],
  ['xlink:href javascript', '<svg><a xlink:href="javascript:alert(1)">x</a></svg>'],
  ['foreignObject con iframe', '<svg><foreignObject><iframe src="javascript:alert(1)"></iframe></foreignObject></svg>'],
  ['use hacia data:', '<svg><use href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="/></svg>'],
  ['style con url ejecutable', '<svg><rect style="background:url(javascript:alert(1))"/></svg>'],
  ['style con @import', '<svg><style>@import url("//x.test/a.css");</style></svg>'],
  ['cierre falso dentro de un atributo', '<svg><rect data-x="><script>alert(1)</script>"/></svg>'],
  ['objeto embebido', '<svg><object data="//x.test/a.swf"></object></svg>'],
  ['meta refresh', '<svg><meta http-equiv="refresh" content="0;url=javascript:alert(1)"></svg>'],
];

describe('el SVG que sale de DocViz es inerte', () => {
  for (const [nombre, payload] of VECTORES) {
    it(`neutraliza: ${nombre}`, () => {
      const limpio = sanitizeSvg(payload);
      expect(inerte(limpio), `quedo ejecutable: ${limpio}`).toBe(true);
    });
  }

  it('el propio detector reconoce un SVG peligroso sin sanear', () => {
    // Si `inerte` diera siempre true, las pruebas de arriba no probarian nada.
    expect(VECTORES.every(([, p]) => !inerte(p))).toBe(true);
  });
});

describe('lo que si tiene que sobrevivir', () => {
  it('conserva la geometria, el texto y los gradientes', () => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" preserveAspectRatio="xMidYMid meet">',
      '<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs>',
      '<clipPath id="c"><rect x="0" y="0" width="4" height="4"/></clipPath>',
      '<g transform="translate(1,2)"><path d="M0 0 L1 1" stroke="#000" stroke-width="2"/></g>',
      '<text x="1" y="2" font-size="13" lengthAdjust="spacing" textLength="9">Hola</text>',
      '<foreignObject width="5" height="5"><div class="label">Etiqueta</div></foreignObject>',
      '</svg>',
    ].join('');
    expect(sanitizeSvg(svg)).toBe(svg);
  });

  it('respeta las mayusculas, que en XML significan algo', () => {
    // `viewbox` no es `viewBox`: en minusculas el navegador deja de escalar.
    const svg = '<svg viewBox="0 0 4 4"><feDropShadow stdDeviation="2"/></svg>';
    const limpio = sanitizeSvg(svg);
    expect(limpio).toContain('viewBox=');
    expect(limpio).toContain('feDropShadow');
    expect(limpio).toContain('stdDeviation=');
  });

  it('deja pasar los enlaces legitimos y los fragmentos internos', () => {
    const svg = '<svg><a href="https://ejemplo.test/doc"><use xlink:href="#icono"/></a></svg>';
    expect(sanitizeSvg(svg)).toBe(svg);
  });

  it('no reescribe una etiqueta a la que no hay nada que quitar', () => {
    // Reescribirlas cambiaria los bytes de todos los diagramas —espacios,
    // comillas, orden— e invalidaria el cache sin que el dibujo cambie.
    const svg = "<svg  class='a'   data-x=\"1\" ><rect />|texto|</svg>";
    expect(sanitizeSvg(svg)).toBe(svg);
  });
});

describe('sobre los diagramas de verdad', () => {
  const dir = path.join(raiz, 'artifacts', 'showcase', 'assets', 'generated');

  it.skipIf(!existsSync(dir))('sanear el catalogo no quita nada salvo comentarios', async () => {
    const ficheros = (await readdir(dir)).filter((f) => f.endsWith('.svg'));
    expect(ficheros.length).toBeGreaterThan(30);

    for (const f of ficheros) {
      const original = await readFile(path.join(dir, f), 'utf8');
      const sinComentarios = original.replace(/<!--[\s\S]*?-->/g, '');
      expect(sanitizeSvg(original), `${f} perdio algo mas que comentarios`).toBe(sinComentarios);
    }
  });
});

describe('sandbox de Chromium', () => {
  it('el sandbox esta puesto salvo que se pida lo contrario', async () => {
    const { chromiumLaunchArgs } = await import('../../src/renderers/browser.js');
    expect(chromiumLaunchArgs(false)).not.toContain('--no-sandbox');
    expect(chromiumLaunchArgs(true)).toContain('--no-sandbox');
    // El resto del endurecimiento no depende del sandbox.
    for (const args of [chromiumLaunchArgs(false), chromiumLaunchArgs(true)]) {
      expect(args).toContain('--disable-background-networking');
      expect(args).toContain('--disable-gpu');
    }
  });

  it('la configuracion manda sobre el entorno y sobre la deteccion', async () => {
    const { shouldDisableSandbox } = await import('../../src/renderers/browser.js');
    const previo = process.env['DOCVIZ_NO_SANDBOX'];
    try {
      process.env['DOCVIZ_NO_SANDBOX'] = '1';
      expect(shouldDisableSandbox(false)).toBe(false);
      expect(shouldDisableSandbox(true)).toBe(true);
      expect(shouldDisableSandbox()).toBe(true);

      delete process.env['DOCVIZ_NO_SANDBOX'];
      // Sin nada dicho, depende de si somos root: como root Chromium no
      // arranca de otra forma, y fuera de ahi el sandbox se queda.
      expect(shouldDisableSandbox()).toBe(process.getuid?.() === 0);
    } finally {
      if (previo === undefined) delete process.env['DOCVIZ_NO_SANDBOX'];
      else process.env['DOCVIZ_NO_SANDBOX'] = previo;
    }
  });
});
