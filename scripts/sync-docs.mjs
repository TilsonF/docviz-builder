#!/usr/bin/env node
/**
 * Sincroniza con el catalogo todo lo que la documentacion afirma sobre los
 * tipos disponibles.
 *
 * El catalogo es la fuente de verdad, pero README, AGENTS y la documentacion
 * del proyecto repiten sus tablas para que se puedan leer sin ejecutar nada.
 * Copiar a mano garantiza que un dia diverjan, asi que las regiones marcadas se
 * generan desde el codigo.
 *
 *   node scripts/sync-docs.mjs           regenera
 *   node scripts/sync-docs.mjs --check   falla si algo quedo desfasado
 *
 * El modo `--check` es lo que convierte la promesa en garantia: forma parte de
 * `docs:check` y de las pruebas, asi que un tipo nuevo no puede publicarse con
 * la documentacion vieja.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { TYPE_CATALOG } from '../dist/dsl/catalog.js';
import { themeNames } from '../dist/themes/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

// --------------------------------------------------------------------------
// Fragmentos generados
// --------------------------------------------------------------------------

const LANGS = {
  es: [
    ['diagram', 'Diagramas — bloque `diagram`'],
    ['chart', 'Gráficos — bloque `chart`'],
    ['architecture', 'Arquitectura — bloque `architecture`'],
  ],
  en: [
    ['diagram', 'Diagrams — `diagram` block'],
    ['chart', 'Charts — `chart` block'],
    ['architecture', 'Architecture — `architecture` block'],
  ],
};

const CABECERAS = {
  es: ['| Necesidad | `type` | Motor |', '|---|---|---|'],
  en: ['| What you need | `type` | Engine |', '|---|---|---|'],
};

/** Tabla "necesidad -> tipo -> motor" de una valla, en el idioma pedido. */
function tablaPorValla(lang, idioma) {
  const filas = TYPE_CATALOG.filter((s) => s.lang === lang).map((s) => {
    const respaldo =
      s.fallbacks !== undefined && s.fallbacks.length > 0
        ? ` (${idioma === 'en' ? 'or' : 'o'} ${s.fallbacks.join(' / ')})`
        : '';
    // El proposito en ingles sale del catalogo, no de una traduccion aparte:
    // asi la tabla no puede desfasarse de lo que responde `docviz types`.
    const proposito = idioma === 'en' && s.en !== undefined ? s.en.purpose : s.purpose;
    return `| ${proposito.replace(/\.$/, '')} | \`${s.type}\` | ${s.engine}${respaldo} |`;
  });
  return [...CABECERAS[idioma], ...filas].join('\n');
}

/** Las tres tablas, con su encabezado. */
function tablasCompletas(nivel, idioma = 'es') {
  const h = '#'.repeat(nivel);
  return LANGS[idioma]
    .map(([lang, titulo]) => `${h} ${titulo}\n\n${tablaPorValla(lang, idioma)}`)
    .join('\n\n');
}

/** Recuento por motor, para el resumen del README. */
function resumenPorMotor() {
  const porMotor = new Map();
  for (const spec of TYPE_CATALOG) {
    porMotor.set(spec.engine, (porMotor.get(spec.engine) ?? 0) + 1);
  }
  const filas = [...porMotor.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([motor, n]) => `| ${motor} | ${n} |`);
  return ['| Motor | Tipos |', '|---|---|', ...filas].join('\n');
}

/** Diagrama que explica el reparto de intenciones entre motores. */
function diagramaDeReparto() {
  const porMotor = new Map();
  for (const spec of TYPE_CATALOG) {
    const lista = porMotor.get(spec.engine) ?? [];
    lista.push(spec.type);
    porMotor.set(spec.engine, lista);
  }
  const lineas = ['type: flow', 'title: Del tipo declarado al motor', 'direction: lr', '', 'flow:'];
  for (const [motor, tipos] of [...porMotor.entries()].sort((a, b) => b[1].length - a[1].length)) {
    // Tres ejemplos bastan para que se entienda el reparto; la lista completa
    // esta en la tabla, y un diagrama con 57 nodos no explicaria nada.
    const muestra = tipos.slice(0, 3).join(', ');
    const resto = tipos.length > 3 ? ` y ${tipos.length - 3} mas` : '';
    lineas.push(`  - DSL -> ${motor}: ${muestra}${resto}`);
  }
  return ['```diagram', ...lineas, '```'].join('\n');
}

const FRAGMENTOS = {
  'tipos-tablas-3': () => tablasCompletas(3),
  'tipos-tablas-4': () => tablasCompletas(4),
  'tipos-tablas-4-en': () => tablasCompletas(4, 'en'),
  'tipos-tablas-3-en': () => tablasCompletas(3, 'en'),
  'tipos-resumen': () => resumenPorMotor(),
  'tipos-reparto': () => diagramaDeReparto(),
  'tipos-total': () => String(TYPE_CATALOG.length),
  'temas': () => themeNames().map((t) => `\`${t}\``).join(', '),
};

// --------------------------------------------------------------------------
// Sustitucion entre marcas
// --------------------------------------------------------------------------

/**
 * Reemplaza el contenido entre `<!-- docviz:<nombre> -->` y
 * `<!-- /docviz:<nombre> -->`.
 *
 * Se usan comentarios HTML porque son invisibles al leer el Markdown y
 * sobreviven a la compilacion, de modo que la region se puede regenerar tantas
 * veces como haga falta sin tocar la prosa que la rodea.
 */
function aplicar(texto, archivo) {
  let salida = texto;
  const marcas = [...texto.matchAll(/<!--\s*docviz:([\w-]+)\s*-->/g)].map((m) => m[1]);

  for (const nombre of marcas) {
    const generar = FRAGMENTOS[nombre];
    if (generar === undefined) {
      throw new Error(`${archivo}: la marca "docviz:${nombre}" no corresponde a ningun fragmento conocido`);
    }
    const patron = new RegExp(
      `(<!--\\s*docviz:${nombre}\\s*-->)[\\s\\S]*?(<!--\\s*/docviz:${nombre}\\s*-->)`,
      'g',
    );
    if (!patron.test(salida)) {
      throw new Error(`${archivo}: falta la marca de cierre <!-- /docviz:${nombre} -->`);
    }
    patron.lastIndex = 0;
    const contenido = generar();
    // Un fragmento de una sola linea se queda en linea: si no, partiria la
    // frase que lo rodea y el Markdown fuente quedaria ilegible.
    const cuerpo = contenido.includes('\n') ? `\n${contenido}\n` : contenido;
    salida = salida.replace(patron, `$1${cuerpo}$2`);
  }
  return salida;
}

const ARCHIVOS = ['README.md', 'README.en.md', 'AGENTS.md', 'AGENTS.en.md', 'docs-src/dsl.md'];

let desfasados = [];
for (const relativo of ARCHIVOS) {
  const archivo = path.join(root, relativo);
  const original = await readFile(archivo, 'utf8');
  const actualizado = aplicar(original, relativo);
  if (original === actualizado) continue;
  if (check) desfasados.push(relativo);
  else await writeFile(archivo, actualizado, 'utf8');
}

if (check) {
  if (desfasados.length > 0) {
    process.stderr.write(
      `Documentacion desfasada respecto al catalogo:\n` +
        desfasados.map((f) => `  - ${f}`).join('\n') +
        `\n\nEjecuta \`npm run docs:sync\` y vuelve a confirmar.\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`documentacion al dia con el catalogo (${TYPE_CATALOG.length} tipos)\n`);
} else {
  process.stdout.write(
    `sincronizados ${ARCHIVOS.length} documentos con el catalogo (${TYPE_CATALOG.length} tipos)\n`,
  );
}
