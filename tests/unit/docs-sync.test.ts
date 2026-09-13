/**
 * La documentacion no puede desfasarse del catalogo.
 *
 * README, AGENTS y la documentacion del proyecto repiten las tablas de tipos
 * para que se puedan leer sin ejecutar nada. Esa copia es util y es el riesgo:
 * si nadie la comprueba, un tipo nuevo se publica con la documentacion vieja.
 * Estas pruebas convierten la promesa en garantia, porque fallan antes de que
 * el desfase llegue al repositorio.
 */

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TYPE_CATALOG } from '../../src/dsl/catalog.js';

const root = path.resolve(import.meta.dirname, '..', '..');
const DOCUMENTOS = ['README.md', 'AGENTS.md', 'docs-src/dsl.md'];

describe('sincronia con el catalogo', () => {
  it('los documentos estan al dia', () => {
    // Si esto falla, ejecuta `npm run docs:sync`.
    expect(() =>
      execFileSync('node', ['scripts/sync-docs.mjs', '--check'], { cwd: root, stdio: 'pipe' }),
    ).not.toThrow();
  });

  it('el catalogo generado incluye todos los tipos', async () => {
    const catalogo = await readFile(path.join(root, 'examples', 'catalogo.md'), 'utf8');
    for (const spec of TYPE_CATALOG) {
      expect(catalogo, `falta ${spec.type} en examples/catalogo.md`).toContain(`### \`${spec.type}\``);
    }
  });

  it('cada tipo del catalogo aparece en la documentacion', async () => {
    const textos = await Promise.all(DOCUMENTOS.map((d) => readFile(path.join(root, d), 'utf8')));
    const juntos = textos.join('\n');
    for (const spec of TYPE_CATALOG) {
      expect(juntos, `${spec.type} no aparece en la documentacion`).toContain(`\`${spec.type}\``);
    }
  });

  it('la documentacion no menciona tipos que ya no existen', async () => {
    const conocidos = new Set(TYPE_CATALOG.flatMap((s) => [s.type, ...(s.aliases ?? [])]));
    const dsl = await readFile(path.join(root, 'docs-src', 'dsl.md'), 'utf8');

    // Solo se revisa la region generada: la prosa puede nombrar cosas que no
    // son tipos, como `data` o `title`.
    const region = /<!-- docviz:tipos-tablas-3 -->([\s\S]*?)<!-- \/docviz:tipos-tablas-3 -->/.exec(dsl);
    expect(region).not.toBeNull();
    const mencionados = region![1]!
      .split('\n')
      // La cabecera tambien lleva `type` entre comillas: no es un tipo.
      .filter((linea) => linea.startsWith('| ') && !linea.startsWith('| Necesidad'))
      .map((linea) => /\| `([\w-]+)` \|/.exec(linea)?.[1])
      .filter((t): t is string => t !== undefined);
    expect(mencionados.length).toBeGreaterThan(40);
    for (const tipo of mencionados) {
      expect(conocidos, `la documentacion menciona "${tipo}", que no existe`).toContain(tipo);
    }
  });

  it('las marcas de region estan bien cerradas', async () => {
    for (const documento of DOCUMENTOS) {
      const texto = await readFile(path.join(root, documento), 'utf8');
      const aperturas = [...texto.matchAll(/<!--\s*docviz:([\w-]+)\s*-->/g)].map((m) => m[1]);
      const cierres = [...texto.matchAll(/<!--\s*\/docviz:([\w-]+)\s*-->/g)].map((m) => m[1]);
      expect(cierres.sort(), `marcas descuadradas en ${documento}`).toEqual(aperturas.sort());
    }
  });
});

describe('la documentacion existe en los dos idiomas', () => {
  const raizProyecto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

  const pares: ReadonlyArray<[string, string]> = [
    ['README.md', 'README.en.md'],
    ['AGENTS.md', 'AGENTS.en.md'],
    [path.join('skills', 'docviz', 'SKILL.md'), path.join('skills', 'docviz-en', 'SKILL.md')],
  ];

  it.each(pares)('%s tiene su version inglesa', async (es, en) => {
    const [textoEs, textoEn] = await Promise.all([
      readFile(path.join(raizProyecto, es), 'utf8'),
      readFile(path.join(raizProyecto, en), 'utf8'),
    ]);
    expect(textoEn.length).toBeGreaterThan(1000);
    expect(textoEn).not.toBe(textoEs);
  });

  it('las dos versiones se enlazan entre si', async () => {
    const [es, en] = await Promise.all([
      readFile(path.join(raizProyecto, 'README.md'), 'utf8'),
      readFile(path.join(raizProyecto, 'README.en.md'), 'utf8'),
    ]);
    expect(es).toContain('README.en.md');
    expect(en).toContain('README.md');
  });

  it('las tablas inglesas salen del catalogo, no de una copia', async () => {
    const en = await readFile(path.join(raizProyecto, 'AGENTS.en.md'), 'utf8');
    // Si estuvieran escritas a mano, no llevarian la marca y `docs:sync` no
    // podria mantenerlas al dia.
    expect(en).toContain('<!-- docviz:tipos-tablas-4-en -->');
    expect(en).toContain('| What you need | `type` | Engine |');
    expect(en).toContain('Who talks to whom, and in what order');
  });
});
