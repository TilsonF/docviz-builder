/**
 * La revision del artefacto.
 *
 * Cada caso es un defecto que de verdad salio de un motor y que nadie veia:
 * los cuatro que esta compuerta encontro la primera vez que se ejecuto sobre
 * las 74 figuras del catalogo estan aqui como prueba de regresion.
 */

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { errores, lint, lintSvg, reglas } from '../../src/build/lint.js';

const sano = (cuerpo = '<rect width="10" height="10"/>'): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" role="img" id="dva" aria-labelledby="dva-t" ` +
  `viewBox="0 0 100 50" width="100" height="50"><title id="dva-t">Figura</title>${cuerpo}</svg>`;

const codigos = (svg: string): string[] => lintSvg(svg, 'x.svg').hallazgos.map((h) => h.regla);

describe('lintSvg', () => {
  it('un SVG que cumple el contrato no produce hallazgos', () => {
    expect(lintSvg(sano(), 'x.svg').hallazgos).toEqual([]);
  });

  it('exige nombre accesible', () => {
    expect(codigos('<svg viewBox="0 0 10 10" width="10" height="10"/>')).toContain('nombre-accesible');
    // Un `<title>` vacio es peor que no tenerlo: parece que cumple.
    const vacio = sano().replace('<title id="dva-t">Figura</title>', '<title id="dva-t"></title>');
    expect(codigos(vacio)).toContain('nombre-accesible');
  });

  it('no acepta `role` distinto de img', () => {
    // Mermaid emite `role="graphics-document document"`: valido, mal soportado
    // y distinto segun el motor que dibuje.
    expect(codigos(sano().replace('role="img"', 'role="graphics-document document"'))).toContain(
      'nombre-accesible',
    );
  });

  it('delata las variables declaradas sobre :root', () => {
    const fuga = sano('<style>:root{--mermaid-font-family:sans-serif}</style>');
    expect(codigos(fuga)).toContain('variables-globales');
  });

  it('delata una referencia a un id que no existe', () => {
    const colgante = sano('<g clip-path="url(#noexiste)"/>');
    expect(codigos(colgante)).toContain('referencia-colgante');
  });

  it('no cuenta las referencias que viven dentro de un <style>', () => {
    // Dependen de que su selector aplique, y eso no se sabe sin maquetar:
    // Mermaid y D2 llevan reglas para modos que no estan activos.
    const enCss = sano('<style>[data-look="neo"] .n{stroke:url(#gradiente-de-otro-modo)}</style>');
    expect(codigos(enCss)).not.toContain('referencia-colgante');
  });

  it('delata ids repetidos, pero no confunde data-id con id', () => {
    const repetido = sano('<g id="dva1"/><path id="dva1"/>');
    expect(codigos(repetido)).toContain('id-repetido');
    const conDataId = sano('<g data-id="e1"/><text data-id="e1">x</text>');
    expect(codigos(conDataId)).not.toContain('id-repetido');
  });

  it('avisa de lo que necesita la red y falla con lo que ejecuta', () => {
    expect(codigos(sano('<image href="https://ejemplo.test/a.png"/>'))).toContain('referencia-remota');
    const remoto = lintSvg(sano('<image href="https://ejemplo.test/a.png"/>'), 'x.svg');
    expect(remoto.hallazgos[0]!.severidad).toBe('aviso');
    expect(errores(remoto)).toEqual([]);

    const guion = sano('<g onclick="alert(1)"/>');
    expect(codigos(guion)).toContain('guion-ejecutable');
    expect(errores(lintSvg(guion, 'x.svg')).length).toBeGreaterThan(0);
  });

  it('exige un lienzo con el que un visor pueda trabajar', () => {
    expect(codigos('<svg role="img" width="100%"><title>T</title></svg>')).toContain('lienzo');
  });

  it('mide la letra contra el destino declarado', () => {
    const chico = sano('<text font-size="6">x</text>');
    const con = lintSvg(chico, 'x.svg', { size: 'slide-16x9' });
    expect(con.hallazgos.map((h) => h.regla)).toContain('letra-minima');
    // Sin destino declarado no hay nada contra lo que medir.
    expect(codigos(chico)).not.toContain('letra-minima');
  });

  it('delata un texto anclado fuera del lienzo', () => {
    expect(codigos(sano('<text x="500" y="10">se sale</text>'))).toContain('texto-fuera-del-lienzo');
    expect(codigos(sano('<text x="50" y="10">dentro</text>'))).not.toContain('texto-fuera-del-lienzo');
  });

  it('no juzga lo que no puede situar, y lo cuenta', () => {
    // Resolver una cadena de transformaciones es maquetar. El recuento existe
    // para que cero hallazgos no se lea como visto bueno.
    const transformado = lintSvg(sano('<g transform="translate(9,9)"><text x="500" y="9">x</text></g>'), 'x.svg');
    expect(transformado.hallazgos.map((h) => h.regla)).not.toContain('texto-fuera-del-lienzo');
    expect(transformado.sinMedir).toBe(1);
  });

  it('se puede omitir una regla por nombre', () => {
    const fuga = sano('<style>:root{--a:1}</style>');
    expect(lintSvg(fuga, 'x.svg', { omitir: ['variables-globales'] }).hallazgos).toEqual([]);
  });

  it('toda regla declarada se puede omitir', () => {
    // Si una regla nueva no entra en la lista, `--omitir` no la alcanza y nadie
    // se entera hasta que le hace falta.
    const fuente = reglas();
    expect(new Set(fuente).size).toBe(fuente.length);
  });
});

describe('lint sobre un directorio', () => {
  it('recorre los subdirectorios, ignora lo que no es SVG y ordena', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'docviz-lint-'));
    await mkdir(path.join(dir, 'assets'), { recursive: true });
    await mkdir(path.join(dir, '.oculto'), { recursive: true });
    await writeFile(path.join(dir, 'assets', 'b.svg'), sano(), 'utf8');
    await writeFile(path.join(dir, 'assets', 'a.svg'), '<svg viewBox="0 0 1 1" width="1" height="1"/>', 'utf8');
    await writeFile(path.join(dir, 'assets', 'c.png'), 'no es un svg', 'utf8');
    // Un directorio oculto es del cache o de la herramienta, no de la salida.
    await writeFile(path.join(dir, '.oculto', 'd.svg'), '<svg/>', 'utf8');

    const result = await lint(dir);
    expect(result.archivos).toBe(2);
    // `a.svg` es el unico con defecto, y se revisa antes que `b.svg`.
    expect(result.hallazgos.map((h) => h.file)).toEqual(['assets/a.svg']);
    expect(result.hallazgos[0]!.regla).toBe('nombre-accesible');
    expect(errores(result).length).toBe(1);
  });

  it('un directorio que no existe no es un error: no hay nada que revisar', async () => {
    const result = await lint(path.join(tmpdir(), 'docviz-no-existe-jamas'));
    expect(result).toEqual({ archivos: 0, hallazgos: [], sinMedir: 0 });
  });

  it('delata una hoja de estilo traida de fuera', () => {
    const importa = sano('<style>@import url(https://ejemplo.test/a.css);</style>');
    expect(lintSvg(importa, 'x.svg').hallazgos.map((h) => h.regla)).toContain('referencia-remota');
  });

  it('acepta un SVG sin texto: no hay letra que medir', () => {
    const result = lintSvg(sano('<rect width="4" height="4"/>'), 'x.svg', { size: 'slide-16x9' });
    expect(result.hallazgos).toEqual([]);
  });

  it('con `fit` no mide la letra contra nada', () => {
    const chico = sano('<text font-size="3">x</text>');
    expect(lintSvg(chico, 'x.svg', { size: 'fit' }).hallazgos.map((h) => h.regla)).not.toContain('letra-minima');
  });

  it('sin viewBox no intenta situar los textos', () => {
    const result = lintSvg('<svg role="img" width="10"><title>T</title><text x="9" y="9">x</text></svg>', 'x.svg');
    expect(result.sinMedir).toBe(0);
    expect(result.hallazgos.map((h) => h.regla)).toContain('lienzo');
  });

  it('un texto sin coordenadas tampoco se puede situar', () => {
    expect(lintSvg(sano('<text>x</text>'), 'x.svg').sinMedir).toBe(1);
  });
});
