#!/usr/bin/env node
/**
 * Punto de entrada de la CLI.
 *
 * Se fuerza la salida explicita del proceso: el modulo WASM de D2 y el servicio
 * de lenguaje de LikeC4 dejan handles vivos que impedirian terminar.
 */
import { run } from '../dist/cli.js';

const code = await run(process.argv);
process.exit(code);
