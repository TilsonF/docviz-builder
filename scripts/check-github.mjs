#!/usr/bin/env node
/**
 * Comprueba como se veria la documentacion compilada en GitHub.
 *
 * GitHub expone la misma API que usa para renderizar Markdown en su web
 * (`POST /markdown`), asi que se le puede pedir el HTML resultante y verificar
 * sobre el que las imagenes sobreviven, conservan su texto alternativo y siguen
 * apuntando a rutas relativas. No hace falta publicar el repositorio ni abrir
 * un navegador.
 *
 *   node scripts/check-github.mjs [dirCompilado] [--repo owner/name]
 *
 * Requiere el CLI `gh` autenticado.
 *
 * Lo que esta comprobacion **no** puede demostrar: que el servidor de imagenes
 * de GitHub conserve el `<style>` interno del SVG, del que depende la variante
 * oscura. Eso solo se ve abriendo el archivo con una sesion iniciada; aqui se
 * verifica lo verificable y se dice cual es el limite.
 */

import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { visit } from 'unist-util-visit';
import { collectMarkdown } from '../dist/build/builder.js';
import { parseMarkdown } from '../dist/markdown/scan.js';

const run = promisify(execFile);

const args = process.argv.slice(2);
const repoIndex = args.indexOf('--repo');
const repo = repoIndex >= 0 ? args[repoIndex + 1] : 'TilsonF/docviz-builder';
const dir = path.resolve(args.find((a) => !a.startsWith('--') && a !== repo) ?? 'docs');

/** Pide a GitHub que renderice el Markdown igual que en su web. */
async function renderizarEnGitHub(markdown) {
  const payload = path.join(tmpdir(), `docviz-gh-${process.pid}.json`);
  await writeFile(payload, JSON.stringify({ text: markdown, mode: 'gfm', context: repo }), 'utf8');
  const { stdout } = await run('gh', ['api', '/markdown', '--method', 'POST', '--input', payload], {
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout;
}

const documentos = await collectMarkdown(dir);
if (documentos.length === 0) {
  process.stderr.write(`no hay documentos Markdown en ${dir}\n`);
  process.exit(1);
}

let problemas = 0;
let imagenesTotales = 0;

for (const archivo of documentos) {
  const relativo = path.relative(dir, archivo);
  const markdown = await readFile(archivo, 'utf8');

  // Se recorre el AST, no el texto: un ejemplo de sintaxis dentro de un bloque
  // de codigo se parece a una imagen, pero no lo es, y contarlo daria un fallo
  // donde no lo hay.
  const arbol = parseMarkdown(markdown);
  const esperadas = [];
  let bloquesDeCodigo = 0;
  visit(arbol, 'image', (nodo) => {
    esperadas.push({ alt: nodo.alt ?? '', src: nodo.url });
  });
  visit(arbol, 'code', () => {
    bloquesDeCodigo += 1;
  });

  const html = await renderizarEnGitHub(markdown);
  const renderizadas = [...html.matchAll(/<img\s[^>]*>/g)].map((m) => m[0]);

  process.stdout.write(`\n${relativo}\n`);
  process.stdout.write(`  imagenes en el fuente: ${esperadas.length}\n`);
  process.stdout.write(`  imagenes renderizadas: ${renderizadas.length}\n`);
  imagenesTotales += esperadas.length;

  if (renderizadas.length !== esperadas.length) {
    process.stdout.write('  ERROR: GitHub no renderizo todas las imagenes\n');
    problemas += 1;
  }

  for (const { alt, src } of esperadas) {
    const etiqueta = renderizadas.find((t) => t.includes(`src="${src}"`));
    if (etiqueta === undefined) {
      process.stdout.write(`  ERROR: no se renderizo ${src}\n`);
      problemas += 1;
      continue;
    }
    if (!etiqueta.includes(`alt="${alt}"`)) {
      process.stdout.write(`  ERROR: ${src} perdio su texto alternativo\n`);
      problemas += 1;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(src)) {
      process.stdout.write(`  ERROR: ${src} no es una ruta relativa\n`);
      problemas += 1;
    }
  }

  // Los bloques de codigo que no son diagramas deben seguir siendo codigo.
  const pre = (html.match(/<pre[\s>]/g) ?? []).length;
  if (bloquesDeCodigo > 0 && pre === 0) {
    process.stdout.write('  ERROR: los bloques de codigo no sobrevivieron\n');
    problemas += 1;
  }

  if (/<script/i.test(html)) {
    process.stdout.write('  ERROR: el HTML renderizado contiene un script\n');
    problemas += 1;
  }
}

process.stdout.write(
  `\n${documentos.length} documento(s), ${imagenesTotales} imagen(es), ${problemas} problema(s)\n`,
);
process.stdout.write(
  '\nComprobado: GitHub renderiza cada imagen, conserva su texto alternativo y\n' +
    'su ruta relativa, y mantiene los bloques de codigo ajenos.\n' +
    'No comprobado: si su servidor de imagenes conserva el `<style>` interno del\n' +
    'SVG, del que depende la variante oscura. Eso exige abrir el archivo en\n' +
    'github.com con la sesion iniciada.\n',
);

process.exit(problemas === 0 ? 0 : 1);
