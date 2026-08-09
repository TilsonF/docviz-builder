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
const version = process.argv[2] ?? process.env['DOCVIZ_PLANTUML_VERSION'] ?? DEFAULT_VERSION;

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

await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, bytes);

const digest = createHash('sha256').update(bytes).digest('hex');
process.stdout.write(
  `listo: ${target}\n  tamano: ${(bytes.byteLength / 1e6).toFixed(1)} MB\n  sha256: ${digest}\n`,
);
