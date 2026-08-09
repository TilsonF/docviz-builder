#!/usr/bin/env node
/**
 * Captura el documento compilado tal y como lo ve un visor real.
 *
 * Levanta el servidor de previsualizacion, abre el documento en Chromium y
 * guarda una captura de pagina completa. Ademas informa de cada imagen que el
 * navegador no haya podido cargar, que es la comprobacion que exige la
 * validacion manual ("no hay imagenes rotas").
 *
 *   node scripts/capture-preview.mjs <dirCompilado> <documento.md> <salida.png>
 */

import path from 'node:path';
import process from 'node:process';
import { writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import { startPreview } from '../dist/build/preview.js';
import { browserNotFoundHelp, findBrowser } from '../dist/renderers/browser.js';

const [, , dir, document_, output] = process.argv;
if (dir === undefined || document_ === undefined || output === undefined) {
  process.stderr.write('uso: node scripts/capture-preview.mjs <dirCompilado> <documento.md> <salida.png>\n');
  process.exit(2);
}

const executablePath = findBrowser();
if (executablePath === undefined) {
  process.stderr.write(`${browserNotFoundHelp()}\n`);
  process.exit(1);
}

const server = await startPreview(path.resolve(dir), 0);
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });

const failed = [];
page.on('requestfailed', (req) => failed.push(req.url()));
page.on('response', (res) => {
  // El favicon no forma parte del documento: su ausencia no es una imagen rota.
  if (res.status() >= 400 && !res.url().endsWith('/favicon.ico')) {
    failed.push(`${res.status()} ${res.url()}`);
  }
});

await page.goto(new URL(document_, server.url).href, { waitUntil: 'networkidle0' });

// El visor marca las imagenes como `loading="lazy"`: hay que recorrer la pagina
// y esperar a que todas terminen, o las de mas abajo se medirian como 0x0.
await page.evaluate(async () => {
  for (const img of document.querySelectorAll('img')) img.loading = 'eager';
  await new Promise((resolve) => {
    let y = 0;
    const step = () => {
      y += 600;
      window.scrollTo(0, y);
      if (y < document.body.scrollHeight) setTimeout(step, 30);
      else {
        window.scrollTo(0, 0);
        resolve(undefined);
      }
    };
    step();
  });
  await Promise.all(
    [...document.querySelectorAll('img')].map(
      (img) =>
        img.complete ||
        new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        }),
    ),
  );
});

// Comprueba en el DOM que cada <img> tiene dimensiones reales.
const images = await page.evaluate(() =>
  [...document.querySelectorAll('img')].map((img) => ({
    src: img.getAttribute('src') ?? '',
    ok: img.complete && img.naturalWidth > 0 && img.naturalHeight > 0,
    width: img.naturalWidth,
    height: img.naturalHeight,
  })),
);

const png = await page.screenshot({ type: 'png', fullPage: true });
await writeFile(output, png);

await browser.close();
await server.close();

const broken = images.filter((i) => !i.ok);
process.stdout.write(`imagenes en el documento: ${images.length}\n`);
for (const image of images) {
  process.stdout.write(`  ${image.ok ? 'OK  ' : 'ROTA'} ${image.width}x${image.height}  ${image.src}\n`);
}
if (failed.length > 0) process.stdout.write(`peticiones fallidas: ${failed.join(', ')}\n`);
process.stdout.write(`captura: ${output}\n`);

process.exit(broken.length === 0 && failed.length === 0 ? 0 : 1);
