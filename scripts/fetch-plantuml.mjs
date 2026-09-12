#!/usr/bin/env node
/**
 * Descarga `vendor/plantuml.jar` desde Maven Central.
 *
 * Es la unica operacion del proyecto que usa la red, y ocurre una sola vez
 * durante la instalacion: despues, el build compila sin conexion. El jar no se
 * versiona en el repositorio porque ocupa unos 26 MB.
 *
 *   node scripts/fetch-plantuml.mjs [version]
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_VERSION = '1.2026.0';

/**
 * Digest esperado de cada version conocida.
 *
 * Sin esto, la unica garantia de que el jar es el que dice ser es el TLS de
 * Maven Central. Es el unico punto de DocViz que trae bytes de fuera y los deja
 * listos para ejecutarse en una JVM, asi que se comprueba contra un valor
 * fijado en el repositorio y verificado a mano contra los checksums publicados
 * (`plantuml-<version>.jar.sha256`).
 *
 * Para una version que no este aqui, pasa el digest con `--sha256 <hex>` o
 * `DOCVIZ_PLANTUML_SHA256`. Descargar sin verificar exige decirlo en voz alta.
 */
const DIGESTS = {
  '1.2026.0': 'b3da2f352a835615ecb63eb754930f8aab57363d5fe1a0660bf2a12827b6b553',
};

const args = process.argv.slice(2);
const flag = (nombre) => {
  const i = args.indexOf(nombre);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : undefined;
};
const sinVerificar = args.includes('--sin-verificar');
const version = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--sha256')
  ?? process.env['DOCVIZ_PLANTUML_VERSION']
  ?? DEFAULT_VERSION;
const esperado = (flag('--sha256') ?? process.env['DOCVIZ_PLANTUML_SHA256'] ?? DIGESTS[version])?.toLowerCase();

if (esperado === undefined && !sinVerificar) {
  process.stderr.write(
    `no hay digest conocido para PlantUML ${version}.\n` +
      'Consulta el checksum publicado:\n' +
      `  curl -s https://repo1.maven.org/maven2/net/sourceforge/plantuml/plantuml/${version}/plantuml-${version}.jar.sha256\n` +
      'y pasalo con --sha256 <hex>, o descarga sin verificar con --sin-verificar.\n',
  );
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'vendor', 'plantuml.jar');
const url = `https://repo1.maven.org/maven2/net/sourceforge/plantuml/plantuml/${version}/plantuml-${version}.jar`;

// Si ya existe un jar utilizable, no se vuelve a descargar.
try {
  const existing = await readFile(target);
  if (existing.byteLength > 1_000_000) {
    process.stdout.write(`plantuml.jar ya presente (${(existing.byteLength / 1e6).toFixed(1)} MB): ${target}\n`);
    process.exit(0);
  }
} catch {
  // no existe: se descarga
}

process.stdout.write(`descargando PlantUML ${version}\n  desde ${url}\n`);

let response;
try {
  response = await fetch(url, { redirect: 'follow' });
} catch (err) {
  process.stderr.write(
    `no se pudo contactar con Maven Central: ${err instanceof Error ? err.message : String(err)}\n` +
      'si tu organizacion distribuye el jar, colocalo en vendor/plantuml.jar o apuntalo\n' +
      'con renderers.plantuml.jar en docviz.config.yaml\n',
  );
  process.exit(1);
}

if (!response.ok) {
  process.stderr.write(`Maven Central respondio ${response.status} ${response.statusText}\n`);
  process.exit(1);
}

const bytes = Buffer.from(await response.arrayBuffer());
// Un jar de PlantUML pesa decenas de MB: cualquier cosa menor es una pagina de error.
if (bytes.byteLength < 1_000_000) {
  process.stderr.write(`la descarga solo trajo ${bytes.byteLength} bytes; no parece un jar\n`);
  process.exit(1);
}
if (bytes.subarray(0, 2).toString('latin1') !== 'PK') {
  process.stderr.write('el archivo descargado no es un jar valido\n');
  process.exit(1);
}

const digest = createHash('sha256').update(bytes).digest('hex');

// La comprobacion va ANTES de escribir: un jar que no es el esperado no debe
// llegar al disco, porque el siguiente build lo daria por bueno.
if (esperado !== undefined && digest !== esperado) {
  process.stderr.write(
    'el jar descargado no coincide con el digest esperado; no se ha escrito nada.\n' +
      `  esperado: ${esperado}\n` +
      `  obtenido: ${digest}\n` +
      'Puede ser una version distinta, una descarga corrupta o un intermediario.\n',
  );
  process.exit(1);
}

await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, bytes);

process.stdout.write(
  `listo: ${target}\n  tamano: ${(bytes.byteLength / 1e6).toFixed(1)} MB\n` +
    `  sha256: ${digest}${esperado !== undefined ? ' (verificado)' : ' (SIN VERIFICAR)'}\n`,
);
