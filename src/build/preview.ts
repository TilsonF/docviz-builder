/**
 * Servidor estatico de previsualizacion.
 *
 * Sirve el Markdown ya compilado con un visor minimo para la revision visual
 * exigida por la seccion 22. Escucha solo en la interfaz local.
 */

import { createReadStream } from 'node:fs';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { collectMarkdown } from './builder.js';
import { toPosix } from '../core/paths.js';

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

export interface PreviewServer {
  url: string;
  port: number;
  close(): Promise<void>;
}

export async function startPreview(rootDir: string, port = 4321): Promise<PreviewServer> {
  const root = path.resolve(rootDir);

  const server = http.createServer((req, res) => {
    void handle(root, req, res).catch(() => {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('error interno del servidor de previsualizacion');
    });
  });

  const actualPort = await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      resolve(typeof address === 'object' && address !== null ? address.port : port);
    });
  });

  return {
    url: `http://127.0.0.1:${actualPort}/`,
    port: actualPort,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** `true` si la ruta no esta contenida en la raiz. */
function fuera(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel.startsWith('..') || path.isAbsolute(rel);
}

async function handle(root: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const decoded = decodeURIComponent(url.pathname);

  if (decoded === '/') {
    const html = await indexPage(root);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // Contencion: nada fuera de `root` puede servirse.
  const target = path.resolve(root, `.${decoded}`);
  if (fuera(root, target)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('acceso denegado');
    return;
  }

  // Y otra vez sobre la ruta real: comparar cadenas no sigue los enlaces
  // simbolicos, asi que un enlace dentro de la salida apuntando a /etc pasaria
  // la comprobacion de arriba y se serviria igual.
  let real: string;
  try {
    real = await realpath(target);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('no encontrado');
    return;
  }
  if (fuera(await realpath(root), real)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('acceso denegado');
    return;
  }

  let info;
  try {
    info = await stat(target);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('no encontrado');
    return;
  }
  if (info.isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('no encontrado');
    return;
  }

  const ext = path.extname(target).toLowerCase();
  if (ext === '.md' && url.searchParams.get('raw') !== '1') {
    const text = await readFile(target, 'utf8');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(documentPage(path.relative(root, target), text));
    return;
  }

  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'content-length': info.size,
  });
  createReadStream(target).pipe(res);
}

async function indexPage(root: string): Promise<string> {
  const files = await collectMarkdown(root);
  const items = files
    .map((f) => toPosix(path.relative(root, f)))
    .map((f) => `<li><a href="/${f}">${escapeHtml(f)}</a></li>`)
    .join('\n');
  const assets = await countAssets(root);
  return page(
    'DocViz — previsualizacion',
    `<h1>Documentos compilados</h1>
     <p class="meta">${files.length} documento(s) &middot; ${assets} recurso(s) generado(s) &middot; raiz <code>${escapeHtml(root)}</code></p>
     <ul class="docs">${items}</ul>`,
  );
}

async function countAssets(root: string): Promise<number> {
  const dir = path.join(root, 'assets', 'generated');
  try {
    return (await readdir(dir)).length;
  } catch {
    return 0;
  }
}

/**
 * Render minimo de Markdown suficiente para revisar imagenes, titulos y
 * tablas. No pretende ser un visor completo: su unico objetivo es que la
 * validacion visual se pueda hacer sin instalar nada mas.
 */
function documentPage(relative: string, markdown: string): string {
  const body = renderMarkdown(markdown);
  return page(
    relative,
    `<p class="meta"><a href="/">&larr; indice</a> &middot; <code>${escapeHtml(relative)}</code> &middot; <a href="?raw=1">ver fuente</a></p>
     <article>${body}</article>`,
  );
}

function renderMarkdown(markdown: string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let inCode = false;
  let inTable = false;
  let listType: 'ul' | 'ol' | undefined;

  const closeList = (): void => {
    if (listType !== undefined) {
      out.push(`</${listType}>`);
      listType = undefined;
    }
  };
  const closeTable = (): void => {
    if (inTable) {
      out.push('</tbody></table>');
      inTable = false;
    }
  };

  for (const line of lines) {
    if (/^```/.test(line)) {
      closeList();
      closeTable();
      out.push(inCode ? '</code></pre>' : '<pre><code>');
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(escapeHtml(line));
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading !== null) {
      closeList();
      closeTable();
      const level = heading[1]!.length;
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.trim().slice(1, -1).split('|').map((c) => c.trim());
      if (/^[\s|:-]+$/.test(line)) continue;
      if (!inTable) {
        closeList();
        out.push('<table><thead><tr>');
        out.push(cells.map((c) => `<th>${inline(c)}</th>`).join(''));
        out.push('</tr></thead><tbody>');
        inTable = true;
      } else {
        out.push(`<tr>${cells.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`);
      }
      continue;
    }
    closeTable();

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet !== null || numbered !== null) {
      const wanted = bullet !== null ? 'ul' : 'ol';
      if (listType !== wanted) {
        closeList();
        out.push(`<${wanted}>`);
        listType = wanted;
      }
      out.push(`<li>${inline((bullet ?? numbered)![1]!)}</li>`);
      continue;
    }
    closeList();

    if (line.trim() === '') continue;
    if (/^---+$/.test(line.trim())) {
      out.push('<hr>');
      continue;
    }
    out.push(`<p>${inline(line)}</p>`);
  }

  closeList();
  closeTable();
  if (inCode) out.push('</code></pre>');
  return out.join('\n');
}

function inline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, src: string) => {
    const clean = src.replace(/^&lt;|&gt;$/g, '');
    return `<figure><img src="${clean}" alt="${alt}" loading="lazy"><figcaption>${alt}</figcaption></figure>`;
  });
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return out;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0 auto; max-width: 60rem; padding: 2rem 1.5rem 6rem;
         font: 16px/1.65 system-ui, -apple-system, 'Segoe UI', sans-serif; }
  h1, h2, h3, h4 { line-height: 1.25; margin: 2rem 0 .75rem; }
  h1 { font-size: 1.9rem; } h2 { font-size: 1.45rem; } h3 { font-size: 1.2rem; }
  .meta { color: #6b7280; font-size: .9rem; }
  figure { margin: 1.5rem 0; }
  img { max-width: 100%; height: auto; display: block; }
  figcaption { color: #6b7280; font-size: .85rem; margin-top: .4rem; }
  pre { background: #f6f8fa; padding: .9rem 1rem; overflow-x: auto; border-radius: 6px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
  table { border-collapse: collapse; margin: 1.2rem 0; width: 100%; }
  th, td { border: 1px solid #d0d7de; padding: .45rem .7rem; text-align: left; }
  th { background: #f6f8fa; }
  ul.docs { padding-left: 1.1rem; }
  a { color: #0969da; }
  @media (prefers-color-scheme: dark) {
    body { background: #0d1117; color: #e6edf3; }
    pre, th { background: #161b22; }
    th, td { border-color: #30363d; }
    a { color: #58a6ff; }
    .meta, figcaption { color: #9ba7b4; }
  }
</style>
</head>
<body>${body}</body>
</html>`;
}
