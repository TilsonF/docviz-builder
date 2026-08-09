#!/usr/bin/env node
/**
 * Servidor MCP de DocViz sobre stdio.
 *
 * Registrar en un cliente MCP:
 *   { "command": "node", "args": ["<ruta>/bin/docviz-mcp.mjs"], "cwd": "<proyecto>" }
 */
import { main } from '../dist/mcp/server.js';

await main();
