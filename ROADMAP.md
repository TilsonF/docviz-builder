# Roadmap

Estado y siguientes pasos de DocViz. Lo que ya está hecho vive en el
[README](./README.md); aquí solo está lo que falta y por qué importa.

## Dónde está hoy

57 tipos sobre seis motores, dibujados de verdad en cada commit. DSL de tres
vallas, salida Markdown portable, todo local. Servidor MCP, skill instalable y
`AGENTS.md` que no puede desfasarse del catálogo. Códigos de error estables,
`diff` entre versiones, banco de casos que mide el acierto, saneador de SVG con
lista de permitidos, catálogo bilingüe, respaldos hacia D2 y reparación
automática de bloques. Cerca de mil pruebas, cero vulnerabilidades.

Lo que falta ya no es construir la herramienta: es **saber si se usa bien** y
**llegar a quien la use**.

### Cerrado desde la primera versión de este documento

- **Catálogo bilingüe.** Las 57 fichas existen en inglés y `suggest` puntúa
  contra ambos idiomas. Medido sobre casos reservados, el acierto en inglés pasó
  de 75,0 % a 87,5 %.
- **Validación de campos anidados.** Una errata dentro de `flow:` o de
  `entities:` ya no es silenciosa.
- **Respaldos hacia D2.** Sin Java caían 11 tipos; ahora caen 4. Una prueba
  comprueba que cada respaldo declarado dibuje de verdad.
- **`docviz fix`.** Devuelve corregido un bloque que no compila, sin adivinar y
  conservando el texto original.
- **Matriz de CI** en Windows y macOS.
- **Rendimiento**: 26,4 s → 12,4 s con el caché vacío, repartiendo entre motores.
- **Determinismo**: `git-graph` producía bytes distintos en cada render. Estaba
  roto desde el principio y no tenía prueba; ahora la tiene, para los 57 tipos.
- **Sitio** con el catálogo completo, y **COMPATIBILIDAD.md** con el contrato.
- **Documentación bilingüe**: `README.en.md`, `AGENTS.en.md`, el skill en inglés
  y `docviz types --lang en`, con las tablas generadas desde el catálogo.
- **Más respaldos**: en una máquina con solo Node —sin Java y sin Chromium—
  funcionan 46 de los 57 tipos. Antes eran 34.
- **`--watch`** en `preview` y en `build`, con recarga del navegador.
- **Temas de marca**: se parte de un tema incluido y se sobrescriben los colores.
- **Datos desde archivo** en los gráficos: `.csv`, `.tsv` y `.json`, relativos al
  documento y sin salir del árbol de origen.

---

## Corto plazo

### 1. Medir el eval con un modelo real

`npm run eval:modelo` está escrito y **nunca se ha ejecutado**: hace falta
`ANTHROPIC_API_KEY`. Es la métrica del producto —¿compila a la primera?,
¿cuántos reintentos?, ¿sirven de algo los códigos de error?— y hasta que se
ejecute, todo lo que hemos hecho por la usabilidad para agentes es una hipótesis
sin medir.

La parte determinista (`npm run eval`) sí corre en CI y hoy da **80,0 %** de
acierto en la primera propuesta y **88,9 %** entre las tres primeras.

### 2. Los mensajes de error en inglés

La documentación ya existe en los dos idiomas —`README.en.md`, `AGENTS.en.md`,
el skill y `docviz types --lang en`—, con las tablas generadas desde el catálogo
para que no puedan desfasarse. Lo que sigue en español son **los mensajes de
error y la salida de la CLI**, que es lo que un agente lee cuando algo falla.

Va junto con la decisión sobre el idioma por defecto, que
[COMPATIBILIDAD.md](./COMPATIBILIDAD.md) marca como condición para la 1.0:
cambiarlo después sería incompatible para quien analice la salida.

### 3. Seguir subiendo el acierto de `suggest`

Medida actual sobre casos reservados: **88,0 %** en la primera propuesta,
**92,0 %** entre las tres primeras.

El banco ya está partido en entrenamiento y reservado, y esa partición dejó una
lección que conviene no olvidar: ponderar las palabras por lo específicas que
son subió el entrenamiento diez puntos y **no movió el reservado ni uno**. Era
sobreajuste entero. Lo único que generalizó fue traducir el catálogo.

Así que el siguiente intento no debería ser otro ajuste de la puntuación, sino
más vocabulario real —o más casos, que también revelan huecos—. Y medido donde
toca.

### 4. Los ocho tipos que aún dependen de su motor

Sin Java caen `wireframe`, `json` y `yaml`: los tres son árboles o bocetos que
PlantUML dibuja de una forma que no tiene equivalente razonable. Sin Chromium
caen `git-graph`, `sankey`, `treemap`, `radar` y `bpmn`.

De esos, dos parecen viables: `git-graph` sobre D2 —ramas como contenedores— y
`treemap`, que Vega (no Vega-Lite) sabe dibujar. El resto probablemente haya que
documentarlos como dependientes de su motor y dejarlo dicho.

---

## Medio plazo

### 5. Caracterizar el bloqueo en macOS

La matriz de CI se ejecutó por primera vez y encontró dos cosas. La de Windows
—un `java` de mentira escrito como guion de shell, que allí no tiene shebang—
está arreglada. La de macOS no: una prueba de la CLI que aquí tarda menos de un
segundo agota los 180 s en el runner, y no se reproduce en local pese a que esta
máquina también es macOS.

Mientras tanto el job es informativo: reporta sin bloquear. Bloquear cada PR con
un fallo que no se entiende cuesta más de lo que avisa.

### 6. Mantenimiento del allowlist de SVG

Cuando un motor cambie lo que emite, la prueba de "sanear el catálogo no quita
nada más que comentarios" lo detecta, y Dependabot agrupa los motores para que
suban juntos. Es la deuda que deja la lista de permitidos, y está cubierta.

---

## Lo que falta como herramienta de uso diario

Distinto de lo anterior: no es ingeniería pendiente, es lo que se echa en falta
al usarla para escribir documentación de verdad.

1. **PNG para todos los motores.** Solo PlantUML lo emite; los otros ocho, solo
   SVG. La pieza ya existe (`scripts/rasterize.mjs`) pero está fuera del build.
4. **Un modelo, varias vistas** en `architecture`. Hoy cada bloque repite sus
   elementos, y a los tres meses las tres vistas del mismo sistema ya no
   coinciden. LikeC4 —que ya es el motor— lo resuelve de forma nativa.
5. **`check --json`** y un esquema por tipo, para que el editor avise antes de
   llegar a la terminal.
6. **Publicar.** Llevar la salida a Outline o Confluence sigue siendo manual.
   Es la última milla, y mete a DocViz en el negocio de hablar con servicios
   externos, que hasta ahora ha evitado a propósito: decisión, no tarea.

---

## Lo que no está previsto hacer

**Más tipos.** Con 57 el catálogo no es el cuello de botella; la adopción y la
tasa de acierto sí.

**HTML interactivo.** Contradice la tesis de salida portable, ya existe
`docviz preview` para revisar antes de publicar, y sería reimplementar un
renderer entero. Si algún día hace falta salida editable, el camino barato es un
puente desde el JSON con layout que ya exporta LikeC4.
