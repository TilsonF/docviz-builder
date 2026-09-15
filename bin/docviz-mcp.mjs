#!/usr/bin/env node
/**
 * Servidor MCP de DocViz sobre stdio.
 *
 * Registrar en un cliente MCP:
 *   { "command": "node", "args": ["<ruta>/bin/docviz-mcp.mjs"], "cwd": "<proyecto>" }
 *
 * El SDK de MCP es una dependencia OPCIONAL, asi que este arranque puede fallar
 * por que no este instalado. Se distingue ese caso de cualquier otro error: uno
 * se arregla con un `npm install` y el otro es un fallo de verdad, y un
 * «Cannot find module» crudo no dice cual de los dos es.
 */
const SDK = '@modelcontextprotocol/sdk';

let main;
try {
  ({ main } = await import('../dist/mcp/server.js'));
} catch (err) {
  const falta =
    err?.code === 'ERR_MODULE_NOT_FOUND' && String(err?.message ?? '').includes(SDK);
  if (!falta) throw err;
  process.stderr.write(
    `\nEl servidor MCP necesita ${SDK}, que no esta instalado.\n\n` +
      `  npm install ${SDK}\n\n` +
      'Es una dependencia opcional a proposito: arrastra un servidor HTTP completo\n' +
      '(Express y su arbol, 88 paquetes) que solo hace falta si vas a exponer DocViz\n' +
      'como servidor MCP. Compilar diagramas no lo necesita.\n',
  );
  process.exit(1);
}

await main();
