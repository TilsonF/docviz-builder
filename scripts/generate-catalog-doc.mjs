#!/usr/bin/env node
/**
 * Genera `examples/catalogo.md` a partir del catalogo de tipos.
 *
 * El documento sirve para dos cosas a la vez: es la referencia visual de todo
 * lo que DocViz sabe dibujar, y es la prueba manual mas completa que existe,
 * porque compilarlo obliga a que cada tipo del catalogo se renderice de verdad.
 *
 * Se genera en lugar de escribirse a mano para que no pueda quedar desfasado:
 * anadir un tipo al catalogo lo anade aqui.
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TYPE_CATALOG } from '../dist/dsl/catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'examples', 'catalogo.md');

const TITULOS = {
  diagram: 'Diagramas',
  chart: 'Graficos',
  architecture: 'Arquitectura',
};

const INTROS = {
  diagram:
    'Se declaran en un bloque `diagram`. El campo `type` expresa la intencion; ' +
    'el motor lo elige DocViz.',
  chart:
    'Se declaran en un bloque `chart`. Todos se dibujan con Vega-Lite y el ' +
    'resultado es un SVG estatico, sin JavaScript.',
  architecture:
    'Se declaran en un bloque `architecture`. Se dibujan con LikeC4, y si no ' +
    'estuviera disponible, con C4-PlantUML.',
};

const lines = [
  '---',
  'title: Catalogo de visualizaciones',
  '---',
  '',
  '# Catalogo de visualizaciones',
  '',
  'Todos los tipos que DocViz sabe dibujar, cada uno con el bloque que lo',
  'produce y el resultado ya compilado.',
  '',
  'Este documento **no se escribe a mano**: lo genera `npm run catalog` a partir',
  'del catalogo de tipos, de modo que no puede quedar desfasado respecto a lo que',
  'el compilador admite de verdad.',
  '',
];

const resumen = ['| Tipo | Para que sirve | Motor |', '|---|---|---|'];
for (const spec of TYPE_CATALOG) {
  resumen.push(`| \`${spec.type}\` | ${spec.purpose} | ${spec.engine} |`);
}
lines.push(...resumen, '');

for (const lang of ['diagram', 'chart', 'architecture']) {
  const specs = TYPE_CATALOG.filter((s) => s.lang === lang);
  if (specs.length === 0) continue;

  lines.push('---', '', `## ${TITULOS[lang]}`, '', INTROS[lang], '');

  for (const spec of specs) {
    lines.push(`### \`${spec.type}\``, '');
    lines.push(spec.purpose, '');
    lines.push(`**Cuando usarlo.** ${spec.whenToUse}`, '');
    lines.push(`**Cuando no.** ${spec.whenNotToUse}`, '');

    const detalles = [];
    if (spec.aliases !== undefined && spec.aliases.length > 0) {
      detalles.push(`Alias: ${spec.aliases.map((a) => `\`${a}\``).join(', ')}.`);
    }
    if (spec.fallbacks !== undefined && spec.fallbacks.length > 0) {
      detalles.push(`Si falta ${spec.engine}, se dibuja con ${spec.fallbacks.join(' o ')}.`);
    }
    if (detalles.length > 0) lines.push(detalles.join(' '), '');

    // El bloque fuente se muestra dentro de una valla de cuatro tildes para que
    // el propio compilador no lo tome por una visualizacion que debe dibujar.
    lines.push('````md', `\`\`\`${spec.lang}`, spec.example, '```', '````', '');

    // Y este es el bloque real, el que si se compila.
    lines.push(`\`\`\`${spec.lang} title="${spec.type}"`, spec.example, '```', '');
  }
}

lines.push(
  '---',
  '',
  '## Como se elige',
  '',
  'Si dudas entre varios tipos, describe en una frase que quieres explicar y',
  'consulta la herramienta MCP `docviz_suggest`, o ejecuta `docviz types` para',
  'ver el catalogo con su proposito y su ejemplo.',
  '',
  'Y antes de dibujar, comprueba que el diagrama aporta algo: para informacion',
  'sencilla, una tabla o un parrafo comunican mejor.',
  '',
);

await writeFile(target, lines.join('\n'), 'utf8');
process.stdout.write(`escrito ${path.relative(root, target)} con ${TYPE_CATALOG.length} tipos\n`);
