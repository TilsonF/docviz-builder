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

## Qué falta para poder llamarla 1.0

1. **Una medida del acierto con un modelo real.** Hoy solo está medida la parte
   determinista. Sin el número real, "cualquier agente sabe usarlo" es una
   hipótesis, y es el argumento central del proyecto.
2. **Una decisión sobre el idioma por defecto.** El catálogo ya es bilingüe,
   pero la documentación y los mensajes de error son solo en español. Cambiar el
   idioma por defecto después de la 1.0 sería un cambio incompatible para quien
   analice la salida.
3. **Un ciclo de uso real fuera de este repositorio.** Ninguna promesa de
   estabilidad vale nada antes de que alguien haya intentado romperla.
4. **Los tipos sin respaldo, resueltos o documentados como tales.** Hoy son
   cuatro (`wireframe`, `json`, `yaml`, `activity`) y solo se caen sin Java.

Hasta entonces, `0.x`: se puede usar, y conviene fijar la versión.
