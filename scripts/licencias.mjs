#!/usr/bin/env node
/**
 * licencias.mjs — que hereda quien instala docviz-builder.
 *
 * DocViz es MIT, pero un paquete no se instala solo: arrastra su arbol, y con
 * el las condiciones de cada dependencia. Dos de las nuestras imponen algo mas
 * que la atribucion, y hasta ahora eso no estaba dicho en ninguna parte: habia
 * que auditar 310 paquetes a mano para enterarse.
 *
 * El listado se genera, no se escribe: una dependencia nueva con una licencia
 * que este script no sepa clasificar hace fallar `--check`, y entonces alguien
 * decide. Es la unica forma de que «todas estan cubiertas» siga siendo cierto
 * el mes que viene.
 *
 *   node scripts/licencias.mjs           escribe LICENCIAS.md
 *   node scripts/licencias.mjs --check   falla si esta desfasado
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destino = path.join(raiz, 'LICENCIAS.md');
const comprobar = process.argv.includes('--check');

/**
 * Familias de licencia y que obligan.
 *
 * `permisiva` es la que solo pide conservar el aviso de copyright. Todo lo que
 * no encaje aqui se reporta como sin clasificar y detiene la comprobacion: el
 * criterio es que ninguna licencia pase inadvertida, no que la lista sea corta.
 */
const FAMILIAS = [
  { patron: /^MIT$|^\(MIT OR CC0-1\.0\)$/, familia: 'permisiva', nota: 'conservar el aviso de copyright' },
  { patron: /^ISC$/, familia: 'permisiva', nota: 'conservar el aviso de copyright' },
  { patron: /^BSD-[23]-Clause$|^0BSD$/, familia: 'permisiva', nota: 'conservar el aviso de copyright' },
  { patron: /^Apache-2\.0$/, familia: 'permisiva', nota: 'conservar el aviso y el archivo NOTICE si lo hay' },
  { patron: /^Unlicense$|^CC0-1\.0$/, familia: 'dominio publico', nota: 'sin obligaciones' },
  {
    patron: /^\(MPL-2\.0 OR Apache-2\.0\)$/,
    familia: 'permisiva',
    nota: 'doble licencia: se puede tomar bajo Apache-2.0 y entonces es permisiva',
  },
  {
    patron: /^MPL-2\.0$/,
    familia: 'copyleft debil',
    nota: 'por archivo: usarla como libreria sin modificarla es compatible con distribuir MIT; si se modifica un archivo suyo, ese archivo sigue siendo MPL',
  },
  {
    patron: /^SEE LICENSE IN /,
    familia: 'con clausula propia',
    nota: 'hay que leer su archivo de licencia: no es una licencia estandar',
  },
];

/** Lee la licencia declarada, incluido el campo antiguo `licenses`. */
function licenciaDe(pkg, dir) {
  if (typeof pkg.license === 'string') return { valor: pkg.license, origen: 'campo license' };
  if (pkg.license && typeof pkg.license.type === 'string') return { valor: pkg.license.type, origen: 'campo license' };
  // `licenses: [{type}]` es la forma antigua, anterior a npm 5. La siguen
  // usando paquetes viejos que nadie ha tocado, y omitirla los daba por
  // indeclarados cuando no lo estan.
  if (Array.isArray(pkg.licenses) && pkg.licenses.length > 0) {
    const tipos = pkg.licenses.map((l) => (typeof l === 'string' ? l : l?.type)).filter(Boolean);
    if (tipos.length > 0) return { valor: tipos.join(' OR '), origen: 'campo licenses (forma antigua)' };
  }
  const archivo = readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
  if (archivo !== undefined) {
    const primera = readFileSync(path.join(dir, archivo), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean);
    if (primera !== undefined && /MIT/i.test(primera)) return { valor: 'MIT', origen: `archivo ${archivo}` };
    return { valor: `(solo en ${archivo})`, origen: `archivo ${archivo}` };
  }
  return { valor: '(sin declarar)', origen: 'ninguno' };
}

const rutas = execSync('npm ls --omit=dev --all --parseable 2>/dev/null', { maxBuffer: 1e9 })
  .toString()
  .trim()
  .split('\n');

const propio = JSON.parse(readFileSync(path.join(raiz, 'package.json'), 'utf8')).name;
const paquetes = new Map();
for (const ruta of rutas) {
  const pj = path.join(ruta, 'package.json');
  if (!existsSync(pj)) continue;
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pj, 'utf8'));
  } catch {
    continue;
  }
  if (typeof pkg.name !== 'string' || pkg.name === propio || paquetes.has(pkg.name)) continue;
  const { valor, origen } = licenciaDe(pkg, ruta);
  const familia = FAMILIAS.find((f) => f.patron.test(valor));
  paquetes.set(pkg.name, { version: pkg.version, licencia: valor, origen, familia });
}

const sinClasificar = [...paquetes].filter(([, d]) => d.familia === undefined);
if (sinClasificar.length > 0) {
  process.stderr.write(
    `${sinClasificar.length} paquete(s) con una licencia que este script no sabe clasificar.\n` +
      'Anade su familia en FAMILIAS despues de decidir que obliga:\n',
  );
  for (const [n, d] of sinClasificar) process.stderr.write(`  ${n}@${d.version}  ->  ${d.licencia}\n`);
  process.exit(1);
}

const porFamilia = new Map();
for (const [, d] of paquetes) porFamilia.set(d.familia.familia, (porFamilia.get(d.familia.familia) ?? 0) + 1);

const destacados = [...paquetes]
  .filter(([, d]) => d.familia.familia !== 'permisiva' && d.familia.familia !== 'dominio publico')
  .sort();

const lineas = [
  '# Qué licencias hereda quien instala DocViz',
  '',
  'DocViz es MIT, pero un paquete no se instala solo. Esto es lo que entra en',
  '`node_modules` con él y qué obliga cada cosa.',
  '',
  '> **No se escribe a mano**: lo genera `node scripts/licencias.mjs` recorriendo',
  '> el árbol de producción real. Una dependencia nueva con una licencia que el',
  '> script no sepa clasificar hace fallar la comprobación, para que nadie la',
  '> apruebe por descuido.',
  '',
  `Dependencias de producción: **${paquetes.size}**.`,
  '',
  '| Familia | Paquetes | Qué obliga |',
  '|---|---|---|',
];
const NOTA_FAMILIA = {
  permisiva: 'Conservar el aviso de copyright. Nada más.',
  'dominio publico': 'Nada.',
  'copyleft debil': 'Por archivo. Ver abajo.',
  'con clausula propia': 'No es estándar. Ver abajo.',
};
for (const [fam, n] of [...porFamilia].sort((a, b) => b[1] - a[1])) {
  lineas.push(`| ${fam} | ${n} | ${NOTA_FAMILIA[fam] ?? ''} |`);
}

lineas.push('', '## Las que piden algo más que atribución', '');
if (destacados.length === 0) {
  lineas.push('Ninguna: todo el árbol es permisivo.', '');
} else {
  for (const [nombre, d] of destacados) {
    lineas.push(`### \`${nombre}\` — ${d.licencia}`, '', d.familia.nota, '');
  }
}

lineas.push(
  '## Lo que eso significa en la práctica',
  '',
  '- **`@terrastruct/d2`** es el motor de los diagramas D2, y es MPL-2.0. Mientras',
  '  se use como librería sin modificar sus archivos —que es lo que hace DocViz—,',
  '  distribuir bajo MIT es compatible.',
  '- **`bpmn-js`** es MIT **más una cláusula**: el código que muestra la marca de',
  '  agua de bpmn.io no se puede quitar ni cambiar. DocViz no lo toca: usa su',
  '  propio `saveSVG()`, que no la incluye por diseño de bpmn.io. La obligación',
  '  viaja con el paquete, así que conviene saberlo antes de modificar nada de su',
  '  trazado.',
  '- **`lightningcss`** llega a través de `likec4`. Si prescindes de LikeC4',
  '  —ver el README—, sale del árbol y con él sus dos entradas MPL.',
  '',
);

const salida = `${lineas.join('\n')}`;

if (comprobar) {
  const actual = existsSync(destino) ? readFileSync(destino, 'utf8') : '';
  if (actual !== salida) {
    process.stderr.write('LICENCIAS.md esta desfasado: ejecuta node scripts/licencias.mjs\n');
    process.exit(1);
  }
  process.stdout.write(`licencias al dia · ${paquetes.size} paquetes\n`);
  process.exit(0);
}

writeFileSync(destino, salida, 'utf8');
process.stdout.write(`escrito LICENCIAS.md · ${paquetes.size} paquetes, ${destacados.length} con condiciones propias\n`);
