#!/usr/bin/env node
/**
 * Rasteriza los SVG generados a PNG para revisarlos visualmente.
 *
 * Se usa en la validacion manual y para producir las evidencias de
 * `artifacts/test-results/screenshots/`. No forma parte del pipeline de build.
 *
 *   node scripts/rasterize.mjs <dirConSvg> <dirDestino> [--scale 2]
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer-core';
import { findBrowser, browserNotFoundHelp } from '../dist/renderers/browser.js';

const [, , sourceDir, targetDir, ...rest] = process.argv;
if (sourceDir === undefined || targetDir === undefined) {
  process.stderr.write('uso: node scripts/rasterize.mjs <dirConSvg> <dirDestino> [--scale N]\n');
  process.exit(2);
}
const scaleIndex = rest.indexOf('--scale');
const scale = scaleIndex >= 0 ? Number(rest[scaleIndex + 1]) : 2;
// `--scheme dark` emula un visor en modo oscuro para comprobar la variante dual.
const schemeIndex = rest.indexOf('--scheme');
const scheme = schemeIndex >= 0 ? rest[schemeIndex + 1] : 'light';

const executablePath = findBrowser();
if (executablePath === undefined) {
  process.stderr.write(`${browserNotFoundHelp()}\n`);
  process.exit(1);
}

const files = (await readdir(sourceDir)).filter((f) => f.endsWith('.svg')).sort();
if (files.length === 0) {
  process.stderr.write(`no hay SVG en ${sourceDir}\n`);
  process.exit(1);
}

await mkdir(targetDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });

for (const file of files) {
  const svg = await readFile(path.join(sourceDir, file), 'utf8');
  const page = await browser.newPage();
  // El orden de los atributos varia entre motores: se leen por nombre.
  const openTag = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
  const width = Number(/\bwidth="(\d+(?:\.\d+)?)"/.exec(openTag)?.[1] ?? 900);
  const height = Number(/\bheight="(\d+(?:\.\d+)?)"/.exec(openTag)?.[1] ?? 700);

  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  await page.setViewport({ width: Math.min(width, 2400), height: Math.min(height, 2400), deviceScaleFactor: scale });
  // El SVG se carga como imagen, igual que en un visor Markdown: es la unica
  // forma de comprobar que su variante oscura se activa de verdad.
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:${scheme === 'dark' ? '#0b0d10' : '#ffffff'}">` +
      `<img src="${dataUri}" width="${width}" height="${height}"></body></html>`,
    { waitUntil: 'load' },
  );
  const png = await page.screenshot({ type: 'png', fullPage: true });
  const target = path.join(targetDir, file.replace(/\.svg$/, '.png'));
  await writeFile(target, png);
  await page.close();
  process.stdout.write(`${file} -> ${path.relative(process.cwd(), target)} (${width}x${height})\n`);
}

await browser.close();
