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

### 2. La documentación en inglés

El catálogo ya es bilingüe, pero el README, `AGENTS.md`, el skill y los mensajes
de error siguen siendo solo en español. Es lo que queda del trabajo de idioma, y
conviene cerrarlo antes de que haya usuarios citando la documentación actual —o
analizando la salida, que es peor.

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

### 4. Los cuatro tipos sin respaldo

`wireframe`, `json`, `yaml` y `activity` se caen sin Java. Los tres primeros no
admiten un respaldo con sentido; `activity` necesitaría ramas con condición en
D2, que es viable. Decidir cuáles se resuelven y cuáles se documentan como
dependientes de PlantUML.

---

## Medio plazo

### 5. Sin Chromium siguen cayendo nueve

`journey`, `git-graph`, `kanban`, `quadrant`, `sankey`, `treemap`, `radar`,
`block` y `bpmn`. Varios son viables sobre D2 o Vega-Lite —`quadrant` es un
scatter, `kanban` son columnas— y el resto probablemente no.

### 6. Mantenimiento del allowlist de SVG

Cuando un motor cambie lo que emite, la prueba de "sanear el catálogo no quita
nada más que comentarios" lo detecta, y Dependabot agrupa los motores para que
suban juntos. Es la deuda que deja la lista de permitidos, y está cubierta.

---

## Lo que no está previsto hacer

**Más tipos.** Con 57 el catálogo no es el cuello de botella; la adopción y la
tasa de acierto sí.

**HTML interactivo.** Contradice la tesis de salida portable, ya existe
`docviz preview` para revisar antes de publicar, y sería reimplementar un
renderer entero. Si algún día hace falta salida editable, el camino barato es un
puente desde el JSON con layout que ya exporta LikeC4.
