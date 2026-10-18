#!/usr/bin/env node
/**
 * comprobar-cjs.mjs — vigila que la puerta a CommonJS siga abierta.
 *
 * El paquete es de un solo formato: `"type": "module"` y un solo fichero
 * compilado, al que apuntan las condiciones `import` y `require` del mapa de
 * exportaciones. Eso es lo que evita el *dual-package hazard*: no existe una
 * segunda construccion que el resolutor pueda cargar aparte, asi que nunca
 * hay dos instancias del modulo ni dos copias de su estado.
 *
 * Desde Node 22.12 —el suelo que declaramos— `require()` carga un modulo ESM
 * sin bandera, PERO lanza ERR_REQUIRE_ASYNC_MODULE si el grafo tiene un
 * `await` de nivel superior. Un solo `await` suelto en cualquier modulo que
 * cuelgue del punto de entrada cierra la puerta a todo consumidor CommonJS,
 * y lo hace en silencio: el typecheck no lo ve, las pruebas tampoco, y el
 * fallo aparece en la maquina de quien instala.
 *
 * Por eso la comprobacion no es una busqueda de texto —las expresiones
 * regulares dan falsos positivos con `= await` repartido en varias lineas—
 * sino la prueba autoritativa: pedirle a Node que lo requiera.
 *
 *   npm run check:cjs
 */

import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(raiz, 'dist');
const require = createRequire(import.meta.url);

const fallos = [];

/** Lista recursiva de los modulos compilados. */
function modulos(dir) {
  const salida = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const completa = path.join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...modulos(completa));
    else if (entrada.name.endsWith('.js')) salida.push(completa);
  }
  return salida.sort();
}

// 1. El mapa de exportaciones declara las dos condiciones, al MISMO fichero.
const manifiesto = JSON.parse(readFileSync(path.join(raiz, 'package.json'), 'utf8'));
const entrada = manifiesto.exports?.['.'] ?? {};
if (entrada.require === undefined) {
  fallos.push('el mapa de exportaciones no declara la condicion "require": un consumidor CommonJS no puede cargar el paquete');
} else if (entrada.require !== entrada.import) {
  fallos.push(
    `"import" (${entrada.import}) y "require" (${entrada.require}) apuntan a ficheros distintos: ` +
      'eso es exactamente el dual-package hazard, dos instancias del mismo modulo',
  );
}
if (manifiesto.main !== undefined && manifiesto.main !== entrada.import) {
  fallos.push(`"main" (${manifiesto.main}) no coincide con la entrada del mapa de exportaciones (${entrada.import})`);
}

// 2. No hay una segunda construccion escondida.
const ajenos = [];
for (const entradaDist of readdirSync(dist, { recursive: true, withFileTypes: true })) {
  if (entradaDist.isDirectory()) continue;
  if (entradaDist.name.endsWith('.cjs')) ajenos.push(entradaDist.name);
}
if (ajenos.length > 0) {
  fallos.push(`dist contiene una segunda construccion CommonJS: ${ajenos.join(', ')}`);
}

// 3. Ningun modulo tiene await de nivel superior.
const lista = modulos(dist);
const conTla = [];
for (const fichero of lista) {
  try {
    require(fichero);
  } catch (err) {
    if (err?.code === 'ERR_REQUIRE_ASYNC_MODULE') conTla.push(path.relative(raiz, fichero));
    else fallos.push(`${path.relative(raiz, fichero)} no se puede requerir: ${err?.code ?? err?.message?.split('\n')[0]}`);
  }
}
if (conTla.length > 0) {
  fallos.push(
    `estos modulos tienen un await de nivel superior, y cierran la puerta a CommonJS: ${conTla.join(', ')}`,
  );
}

// 4. Requerir e importar la entrada publica da LA MISMA instancia.
const porRequire = require(path.join(dist, 'index.js'));
const porImport = await import(path.join(dist, 'index.js'));
if (porRequire !== porImport) {
  fallos.push('require() e import() de la entrada publica devuelven objetos distintos: hay dos instancias del modulo');
}

if (fallos.length > 0) {
  console.error('La puerta a CommonJS esta cerrada o rota:\n');
  for (const fallo of fallos) console.error(`  - ${fallo}`);
  process.exit(1);
}

console.log(
  `Puerta a CommonJS abierta: ${lista.length} modulos requeribles, 0 con await de nivel superior, ` +
    `una sola instancia (${Object.keys(porRequire).length} exportaciones publicas).`,
);
