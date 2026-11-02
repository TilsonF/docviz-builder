/**
 * Pruebas de los iconos: resolucion, huella y sustitucion del hueco.
 *
 * Lo que mas falla aqui no se ve leyendo el SVG, se ve mirandolo: un icono de
 * trazo al que se le pierde el `fill="none"` de la raiz sale como una mancha
 * negra, y pasa cualquier comprobacion de texto. Por eso varias de estas
 * pruebas fijan exactamente eso.
 */

import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  SENTINELA,
  cargarIconos,
  conjuntoVacio,
  nombreDeIconoValido,
  partirSvg,
} from '../../src/core/iconos.js';
import { inyectarIconos } from '../../src/renderers/iconos-svg.js';
import { ERROR_CODES, DocVizError } from '../../src/core/errors.js';
import { tree } from '../../src/dsl/diagram.js';

const temps: string[] = [];
async function dirConIconos(iconos: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'docviz-iconos-'));
  temps.push(dir);
  await mkdir(dir, { recursive: true });
  for (const [nombre, svg] of Object.entries(iconos)) {
    await writeFile(path.join(dir, `${nombre}.svg`), svg, 'utf8');
  }
  return dir;
}
afterAll(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});

const MARCA = '<svg viewBox="0 0 10 10"><circle id="c" r="5" fill="#FF0000"/></svg>';
const TRAZO =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1"/></svg>';

/** `<image>` tal y como lo emite D2 para un `icon:`. */
const hueco = (nombre: string): string =>
  `<svg viewBox="0 0 100 100"><image href="${SENTINELA}${nombre}" x="5" y="7" width="46" height="46" /></svg>`;

describe('partirSvg', () => {
  it('separa viewBox y contenido', () => {
    const r = partirSvg(MARCA, 'marca');
    expect(r.viewBox).toBe('0 0 10 10');
    expect(r.contenido).toContain('<circle');
    expect(r.contenido).not.toContain('<svg');
  });

  it('conserva la pintura de la raiz, que es lo que hereda el dibujo', () => {
    // Sin esto un icono de trazo sale relleno de negro: el `fill="none"` vive
    // en la etiqueta raiz, no en los hijos.
    const r = partirSvg(TRAZO, 'trazo');
    expect(r.pintura).toContain('fill="none"');
    expect(r.pintura).toContain('stroke="currentColor"');
    expect(r.pintura).toContain('stroke-width="2"');
  });

  it('no copia el tamano de la raiz: lo fija el hueco del motor', () => {
    const r = partirSvg('<svg width="24" height="24" viewBox="0 0 24 24"><path d="M1 1"/></svg>', 'x');
    expect(r.pintura).not.toContain('width');
    expect(r.pintura).not.toContain('height');
  });

  it('construye el viewBox desde width/height cuando falta', () => {
    expect(partirSvg('<svg width="32" height="16"><path d="M1 1"/></svg>', 'x').viewBox).toBe('0 0 32 16');
  });

  it('rechaza un dibujo sin forma de reescalarse', () => {
    expect(() => partirSvg('<svg><path d="M1 1"/></svg>', 'x')).toThrow(/viewBox/);
  });

  it('rechaza lo que no es un SVG', () => {
    expect(() => partirSvg('no soy un svg', 'x')).toThrow(/<svg>/);
  });
});

describe('nombreDeIconoValido', () => {
  it('admite lo que vale como nombre de archivo', () => {
    expect(nombreDeIconoValido('react')).toBe(true);
    expect(nombreDeIconoValido('better-auth')).toBe(true);
    expect(nombreDeIconoValido('aws_s3')).toBe(true);
  });

  it('rechaza lo que podria salirse del directorio', () => {
    expect(nombreDeIconoValido('../../etc/passwd')).toBe(false);
    expect(nombreDeIconoValido('a/b')).toBe(false);
    expect(nombreDeIconoValido('React')).toBe(false);
    expect(nombreDeIconoValido('')).toBe(false);
  });
});

describe('cargarIconos', () => {
  it('lee los SVG del directorio', async () => {
    const dir = await dirConIconos({ marca: MARCA });
    const conjunto = await cargarIconos([dir]);
    expect(conjunto.nombres()).toEqual(['marca']);
    expect(conjunto.resolver('marca')?.viewBox).toBe('0 0 10 10');
  });

  it('un directorio que no existe no es un error: es que no hay iconos', async () => {
    const conjunto = await cargarIconos([path.join(tmpdir(), 'docviz-no-existe-jamas')]);
    expect(conjunto.nombres()).toEqual([]);
  });

  it('el ultimo directorio gana, para que un proyecto pueda sustituir una marca', async () => {
    const paquete = await dirConIconos({ marca: MARCA });
    const proyecto = await dirConIconos({ marca: '<svg viewBox="0 0 2 2"><rect/></svg>' });
    const conjunto = await cargarIconos([paquete, proyecto]);
    expect(conjunto.resolver('marca')?.viewBox).toBe('0 0 2 2');
  });

  it('ignora nombres que no servirian de nombre de archivo', async () => {
    const dir = await dirConIconos({ 'MAL Nombre': MARCA, bien: MARCA });
    expect((await cargarIconos([dir])).nombres()).toEqual(['bien']);
  });
});

describe('huella de los iconos', () => {
  it('una fuente sin iconos no aporta nada al hash', async () => {
    const conjunto = await cargarIconos([await dirConIconos({ marca: MARCA })]);
    expect(conjunto.huellaDeFuente('a -> b')).toBeUndefined();
  });

  it('cambia cuando cambia el archivo del logo', async () => {
    const antes = await cargarIconos([await dirConIconos({ marca: MARCA })]);
    const despues = await cargarIconos([
      await dirConIconos({ marca: MARCA.replace('#FF0000', '#00FF00') }),
    ]);
    const fuente = `x { icon: ${SENTINELA}marca }`;
    expect(antes.huellaDeFuente(fuente)).toBeDefined();
    expect(antes.huellaDeFuente(fuente)).not.toBe(despues.huellaDeFuente(fuente));
  });

  it('no cambia por instalar un icono que la fuente no nombra', async () => {
    const fuente = `x { icon: ${SENTINELA}marca }`;
    const solo = await cargarIconos([await dirConIconos({ marca: MARCA })]);
    const conOtro = await cargarIconos([await dirConIconos({ marca: MARCA, otro: MARCA })]);
    expect(solo.huellaDeFuente(fuente)).toBe(conOtro.huellaDeFuente(fuente));
  });
});

describe('inyectarIconos', () => {
  it('cambia el hueco por un <svg> anidado y no deja ninguna referencia a la red', async () => {
    const conjunto = await cargarIconos([await dirConIconos({ marca: MARCA })]);
    const { svg, usados } = inyectarIconos(hueco('marca'), conjunto);
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain(SENTINELA);
    expect(svg).toContain('<circle');
    expect(usados).toEqual(['marca']);
  });

  it('respeta la geometria que calculo el motor', async () => {
    const conjunto = await cargarIconos([await dirConIconos({ marca: MARCA })]);
    const { svg } = inyectarIconos(hueco('marca'), conjunto);
    expect(svg).toContain('x="5"');
    expect(svg).toContain('y="7"');
    expect(svg).toContain('width="46"');
    expect(svg).toContain('viewBox="0 0 10 10"');
  });

  it('nunca deforma el dibujo', async () => {
    // Azure lo prohibe por escrito, y ademas se nota a simple vista.
    const conjunto = await cargarIconos([await dirConIconos({ marca: MARCA })]);
    const { svg } = inyectarIconos(hueco('marca'), conjunto);
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(svg).not.toContain('preserveAspectRatio="none"');
  });

  it('prefija los ids del dibujo y sus referencias', async () => {
    const conRef =
      '<svg viewBox="0 0 10 10"><clipPath id="a"><rect/></clipPath><g clip-path="url(#a)"/></svg>';
    const conjunto = await cargarIconos([await dirConIconos({ marca: conRef })]);
    const { svg } = inyectarIconos(hueco('marca'), conjunto, 'fig');
    expect(svg).toContain('id="figi1a"');
    expect(svg).toContain('url(#figi1a)');
    expect(svg).not.toContain('url(#a)');
  });

  it('lleva la pintura de la raiz al <svg> anidado', async () => {
    const conjunto = await cargarIconos([await dirConIconos({ trazo: TRAZO })]);
    const { svg } = inyectarIconos(hueco('trazo'), conjunto);
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="currentColor"');
  });

  it('tine solo lo que usa currentColor, y declara su contraparte oscura', async () => {
    const dir = await dirConIconos({ trazo: TRAZO, marca: MARCA });
    const conjunto = await cargarIconos([dir]);
    const tinte = { claro: '#111111', oscuro: '#EEEEEE' };

    const conTinta = inyectarIconos(hueco('trazo'), conjunto, 'fig', tinte).svg;
    expect(conTinta).toContain('color="var(--fig-ico,#111111)"');
    expect(conTinta).toContain('prefers-color-scheme:dark');
    expect(conTinta).toContain('--fig-ico:#EEEEEE');

    // Una marca no se tine jamas: es lo unico que los usuarios ven mal al
    // instante, y varios terminos de uso lo prohiben.
    const sinTinta = inyectarIconos(hueco('marca'), conjunto, 'fig', tinte).svg;
    expect(sinTinta).not.toContain('color="var(');
    expect(sinTinta).toContain('#FF0000');
  });

  it('un icono que no esta falla, en lugar de dejar el hueco', async () => {
    const conjunto = await cargarIconos([await dirConIconos({ marca: MARCA })]);
    try {
      inyectarIconos(hueco('kubernetes'), conjunto);
      expect.unreachable('tenia que fallar');
    } catch (err) {
      expect(err).toBeInstanceOf(DocVizError);
      expect((err as DocVizError).code).toBe(ERROR_CODES.ICONO_DESCONOCIDO);
      expect((err as DocVizError).detail).toContain('docviz icons kubernetes');
    }
  });

  it('un SVG sin huecos se devuelve tal cual', () => {
    const svg = '<svg viewBox="0 0 1 1"><rect/></svg>';
    expect(inyectarIconos(svg, conjuntoVacio()).svg).toBe(svg);
  });

  it('no toca un <image> que no sea un hueco nuestro', () => {
    const ajeno = `<svg><image href="https://ajeno.test/a.png"/><image href="${SENTINELA}x"/></svg>`;
    expect(() => inyectarIconos(ajeno, conjuntoVacio())).toThrow(/icono desconocido/);
  });
});

describe('el icono en el DSL', () => {
  it('llega a D2 como hueco, no como dibujo', () => {
    const d2 = tree({
      root: 'R',
      icon: 'react',
      branches: [{ name: 'Hijo', icon: 'docker' }],
    });
    expect(d2).toContain(`icon: ${SENTINELA}react`);
    expect(d2).toContain(`icon: ${SENTINELA}docker`);
  });

  it('convive con el enlace en el mismo nodo', () => {
    const d2 = tree({
      root: 'R',
      branches: [{ name: 'Hijo', icon: 'docker', href: 'https://ejemplo.test/a' }],
    });
    expect(d2).toMatch(/link: .*ejemplo\.test.*; icon: /);
  });

  it('rechaza al compilar un nombre que no vale como archivo', () => {
    // Que el dibujo exista no se puede saber aqui —eso es DV109 al dibujar—,
    // pero que el nombre no toque el disco si, y se para antes.
    try {
      tree({ root: 'R', branches: [{ name: 'X', icon: '../../etc/passwd' }] });
      expect.unreachable('tenia que fallar');
    } catch (err) {
      expect((err as DocVizError).code).toBe(ERROR_CODES.DSL_VALUE_NOT_ALLOWED);
    }
  });

  it('un icono vacio es como no declararlo', () => {
    expect(tree({ root: 'R', branches: [{ name: 'X', icon: '  ' }] })).not.toContain('icon:');
  });
});
