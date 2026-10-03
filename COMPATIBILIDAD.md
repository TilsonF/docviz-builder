# Qué se puede dar por estable

DocViz está en `0.x`, que en la práctica significa "nada está prometido". Este
documento existe para que eso deje de ser cierto por partes: describe qué se
considera **contrato público** —lo que no cambiará sin subir la versión mayor— y
qué es detalle interno que puede cambiar en cualquier momento.

No es una promesa retroactiva. Es la lista de lo que habrá que sostener el día
que salga la 1.0, y la referencia para saber si un cambio de hoy la acerca o la
aleja.

## Contrato público

### El DSL

Los nombres de los 57 tipos, sus campos y la forma de sus valores. Un bloque que
compila hoy tiene que seguir compilando.

Se puede **añadir**: tipos nuevos, campos opcionales nuevos, alias nuevos. No se
puede quitar un tipo, renombrar un campo ni volver obligatorio uno que era
opcional.

Lo que **no** es contrato: el aspecto del dibujo. El motor que atiende cada tipo
puede cambiar —para eso existen los respaldos—, y con él cambian los colores, el
trazado y las posiciones.

### Los códigos de error

`DV001`–`DV007` y `DV100`–`DV106`. Un código no cambia de significado nunca; si
hace falta distinguir un caso nuevo, se añade un código nuevo.

Lo que **no** es contrato: el texto del mensaje ni el del detalle. Están escritos
para que los lea una persona y se reescriben cuando se pueden explicar mejor.
Por eso existe el código.

### Las herramientas MCP

Los nombres (`docviz_types`, `docviz_suggest`, `docviz_validate_document`,
`docviz_render_diagram`, `docviz_build_document`, `docviz_diff`, `docviz_fix`,
`docviz_preview`), sus parámetros obligatorios y las claves de su respuesta.

Se pueden añadir parámetros opcionales y claves nuevas en la respuesta. No se
puede quitar una clave ni cambiar su tipo.

### La CLI

Los nombres de los comandos, sus argumentos posicionales, sus opciones largas y
sus códigos de salida. `0` es éxito; `1` es fallo.

Lo que **no** es contrato: el texto que imprime, ni su disposición. Si tu script
depende de analizar la salida, usa `--json`, que sí lo es.

### El formato de salida

Markdown estándar con las imágenes referenciadas por ruta relativa. Esa es la
tesis del proyecto y no va a cambiar.

Lo que **no** es contrato: los bytes concretos del SVG. Cambian cuando cambia el
tema, cuando se actualiza un motor y cuando se endurece el saneador. Lo que sí
se sostiene es que **el mismo documento, la misma versión y el mismo tema
producen los mismos bytes**.

### La configuración

Las claves de `docviz.config.yaml` y sus valores por defecto. Se pueden añadir
claves; no se puede cambiar lo que hace una existente.

## Detalle interno

Todo lo que no está arriba. En concreto, y porque es fácil confundirlo con
contrato:

- **La estructura de `src/`**, los nombres de módulo y todo lo que exporta el
  paquete que no sea la CLI o el servidor MCP. No hay API programática pública
  todavía; `import { build } from 'docviz-builder'` puede romperse.
- **El motor que atiende cada tipo**, y por tanto el aspecto del resultado.
- **Los nombres de archivo de los recursos generados**, incluida la longitud del
  hash.
- **El contenido del catálogo** más allá de los nombres de tipo: el `purpose`,
  el `whenToUse`, las palabras clave y los ejemplos se reescriben conforme el
  eval enseña dónde falla la elección de tipo.
- **El formato del caché** en `.docviz-cache`. Se puede borrar siempre.

## LikeC4 pasa a ser opcional

En la 0.6.0, `likec4` se mueve de `dependencies` a `optionalDependencies`.
**No es un cambio incompatible**, y por eso está aquí dicho: las dependencias
opcionales se instalan por defecto, así que quien ya lo tenía y actualiza lo
conserva, y los tres tipos C4 siguen dibujándose igual.

Lo que cambia es que ahora se puede excluir con `--omit=optional`, y entonces
salen del árbol sus 45 paquetes —y con ellos GHSA-vfj7-8cjw-p6xm, un aviso
`high` en `braces` sin corrección publicada que llega por la cadena con la que
LikeC4 construye su propio sitio—. Medido, ese código no se carga nunca; pero
aparece en el `npm audit` de quien nos instale, y eso basta para bloquear a un
equipo con compuerta de seguridad.

Sin `likec4`, los tres tipos C4 caen a `plantuml-c4`. `doctor` lo reporta y el
build avisa bloque a bloque con `DV107`.

## La versión mínima de Node

**Node 22.** Subió desde 20.11 en la 0.6.0, y la razón no fue preferencia: la
matriz de CI descubrió que `svgbob` **no funcionaba en Node 20** —importa un
`.wasm` por ESM, y Node 20 no lo carga sin `--experimental-wasm-modules`—, de
modo que el mínimo declarado prometía un soporte que no existía.

Node 20 llegó además a fin de vida el 24 de marzo de 2026; hoy el LTS activo
es 24 y el de mantenimiento, 22.

Subir el mínimo es un cambio incompatible, y por eso está aquí. Volver a
bajarlo no está previsto.

## Qué falta para poder llamarla 1.0

1. **Una medida del acierto con un modelo real.** Hoy solo está medida la parte
   determinista. Sin el número real, "cualquier agente sabe usarlo" es una
   hipótesis, y es el argumento central del proyecto.
2. **Una decisión sobre el idioma por defecto.** El catálogo y la
   documentación ya son bilingües. Los mensajes de error tienen ya el
   mecanismo —`DOCVIZ_LANG=en`— y el camino común traducido: el andamiaje del
   error, los ayudantes de campos y de listas, y los tres «el tipo no existe».
   Medido rompiendo los 62 ejemplos del catálogo de cuatro formas distintas,
   los 193 errores que eso produce salen en inglés.

   Lo que falta son **161 mensajes específicos** de compiladores concretos,
   que ese barrido no alcanza. Y la decisión en sí: hoy el valor por defecto
   sigue siendo `es`, y cambiarlo después de la 1.0 sería incompatible para
   quien analice la salida. El mecanismo convierte esa decisión en una línea
   en lugar de una reescritura.

   **Los códigos (`DV000`–`DV107`) no cambian con el idioma y no lo harán.**
   Es lo que un agente usa para decidir.
3. **Un ciclo de uso real fuera de este repositorio.** Ninguna promesa de
   estabilidad vale nada antes de que alguien haya intentado romperla.
4. **Los tipos sin respaldo, resueltos o documentados como tales.** Hoy son
   cuatro (`wireframe`, `json`, `yaml`, `activity`) y solo se caen sin Java.

Hasta entonces, `0.x`: se puede usar, y conviene fijar la versión.
