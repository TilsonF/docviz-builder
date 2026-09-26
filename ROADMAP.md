# Roadmap

Estado y siguientes pasos de DocViz. Lo que ya está hecho vive en el
[README](./README.md); aquí solo está lo que falta y por qué importa.

## Dónde está hoy

62 tipos sobre seis motores, dibujados de verdad en cada commit. DSL de tres
vallas, salida Markdown portable, todo local. Servidor MCP, skill instalable y
`AGENTS.md` que no puede desfasarse del catálogo. Códigos de error estables,
`diff` entre versiones, banco de casos que mide el acierto, saneador de SVG con
lista de permitidos, catálogo bilingüe, respaldos hacia D2 y reparación
automática de bloques. Más de mil cien pruebas, cero vulnerabilidades.

Lo que falta ya no es construir la herramienta: es **saber si se usa bien** y
**llegar a quien la use**.

### Cerrado desde la primera versión de este documento

- **Catálogo bilingüe.** Las fichas existen en inglés y `suggest` puntúa
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
  roto desde el principio y no tenía prueba; ahora la tiene, para todos los tipos.
- **Sitio** con el catálogo completo, y **COMPATIBILIDAD.md** con el contrato.
- **Documentación bilingüe**: `README.en.md`, `AGENTS.en.md`, el skill en inglés
  y `docviz types --lang en`, con las tablas generadas desde el catálogo.
- **Más respaldos**: en una máquina con solo Node —sin Java y sin Chromium—
  funcionan 53 de los 62 tipos. Antes eran 34 de 57.
- **`--watch`** en `preview` y en `build`, con recarga del navegador.
- **Temas de marca**: se parte de un tema incluido y se sobrescriben los colores.
- **Datos desde archivo** en los gráficos: `.csv`, `.tsv` y `.json`, relativos al
  documento y sin salir del árbol de origen.
- **PNG desde los nueve motores**, no solo PlantUML.
- **Un modelo, varias vistas** en `architecture`: el sistema se declara una vez
  y cada bloque elige qué enseña con `include` / `exclude`.
- **`check --json` y `docviz schema`**: salida estructurada y esquemas JSON
  derivados del catálogo, para el editor y para un pipeline.
- **`docviz bundle`**: la salida lista para subir a un wiki, sin subirla.
- **Cinco gráficos más** con plantillas propias basadas en las de Flint
  (Microsoft Research): `lollipop`, `sparkline`, `kpi-card`,
  `calendar-heatmap` y `bump`. La librería no entra —42 MB, y su valor es el
  layout automático y los cinco backends, que no usamos—; sí su elección de
  canales y su geometría.
- **`gantt` y `radar` sin navegador**: respaldo Vega-Lite que consume la misma
  forma de documento que la versión Mermaid.
- **El respaldo se dispara cuando toca.** Un motor compilado dentro de DocViz
  se daba por presente aunque su paquete npm no estuviese, así que el bloque
  moría en el render con un «Cannot find package» en vez de caer al respaldo.
- **El SDK de MCP es dependencia opcional**: fuera Express y 88 paquetes de un
  compilador que promete no tocar la red.
- **`docviz fix` ya no corrompe el YAML**: renombrar una clave dentro de una
  lista se comía el guion. Y ninguna errata anidada recibía sugerencia.
- **Los campos de hoja se entienden en español**, con una tabla central en vez
  de alias sueltos donde cada autor se acordó.

---

## Corto plazo

### 1. Medir el eval con un modelo real

`npm run eval:modelo` está escrito y **nunca se ha ejecutado**: hace falta
`ANTHROPIC_API_KEY`. Es la métrica del producto —¿compila a la primera?,
¿cuántos reintentos?, ¿sirven de algo los códigos de error?— y hasta que se
ejecute, todo lo que hemos hecho por la usabilidad para agentes es una
hipótesis sin medir.

La parte determinista sí corre en CI: **89,6 %** de acierto en la primera
propuesta, **90,0 %** sobre los casos reservados.

### 2. Nada mide `docviz fix`

`suggest` tiene 77 casos y una partición reservada. `fix` no tiene ninguno, y
esa asimetría ya costó cara: dos defectos serios —devolvía YAML corrupto al
renombrar dentro de una lista, y ninguna errata anidada recibía sugerencia—
sobrevivieron hasta que alguien los probó **a mano**. Las pruebas unitarias que
tiene son las de los casos que se me ocurrieron, no una medida.

Un banco de bloques rotos con su reparación esperada convertiría «fix funciona»
en un número, y diría cuánto vale de verdad: cuántos reintentos del modelo
ahorra.

### 3. Los mensajes de error en inglés

La documentación ya existe en los dos idiomas, con las tablas generadas desde
el catálogo. Lo que sigue en español son **los mensajes de error y la salida de
la CLI**, que es justo lo que un agente lee cuando algo falla.

Va junto con la decisión sobre el idioma por defecto, que
[COMPATIBILIDAD.md](./COMPATIBILIDAD.md) marca como condición para la 1.0:
cambiarlo después sería incompatible para quien analice la salida.

### 4. El build degrada en silencio

Si falta un motor, el bloque cae a su respaldo y **se dibuja con otro aspecto
sin decir nada**. Solo `doctor` lo cuenta, y hay que ir a preguntárselo. Quien
compila en una máquina distinta —o con un `node_modules` incompleto— obtiene
otros dibujos y no se entera.

El canal de avisos del build es por bloque (`archivo:línea`) y un motor ausente
no encaja ahí, así que hace falta decidir dónde va: una línea en el resumen, un
aviso por bloque afectado, o un código de salida distinto con `--strict`.

### 5. Los siete tipos que aún dependen de su motor

Sin Java caen `wireframe`, `json` y `yaml`: los tres son árboles o bocetos que
PlantUML dibuja de una forma sin equivalente razonable. Sin Chromium caen
`git-graph`, `sankey`, `treemap` y `bpmn`.

De esos, dos parecen viables: `git-graph` sobre D2 —ramas como contenedores— y
`treemap`, que Vega (no Vega-Lite) sabe dibujar. El resto probablemente haya
que documentarlos como dependientes de su motor y dejarlo dicho.

---

## Medio plazo

### 6. Aislar `likec4`

Está medido, no estimado: instalar `docviz-builder` en un proyecto limpio deja
**401 MB y 315 paquetes**. Sacando `likec4` quedan **289 MB y 270**, y con ello
desaparecen el **único script de instalación** que queda (el `postinstall` de
esbuild, que descarga un binario de la red), los **dos binarios nativos**, la
licencia MPL de lightningcss y `playwright-core` —12 MB de un segundo motor de
navegador, además de puppeteer—.

Para una herramienta cuyo compromiso es que el build no toca la red, que
instalarla no ejecute nada ni compile nada es un cambio de categoría.

El respaldo ya está listo para soportarlo: los tres tipos C4 se dibujan con
`plantuml-c4` cuando el paquete no está. El precio es que, en una instalación
limpia, esos tres cambian de aspecto hasta que el usuario haga
`npm install likec4`.

### 7. Qué licencias hereda quien nos use

Dos dependencias imponen condiciones que se transmiten río abajo y que hoy no
están dichas en ninguna parte:

- **`bpmn-js`** es MIT *más una cláusula*: el código que muestra la marca de
  agua de bpmn.io no se puede quitar ni cambiar. Nosotros cumplimos —usamos su
  `saveSVG()`, que no la incluye por diseño propio—, pero la obligación viaja
  con el paquete.
- **`@terrastruct/d2`**, el motor de D2, es **MPL-2.0**. Copyleft débil, por
  archivo; compatible con distribuir MIT, pero no es permisiva.

Un `docviz licenses`, o un `LICENSES.md` generado, que diga qué hereda quien
instala. Es información que hoy solo se obtiene auditando el árbol a mano.

### 8. Caracterizar el bloqueo en macOS

Una prueba de la CLI que aquí tarda menos de un segundo agota los 180 s en el
runner, y no se reproduce en local pese a que esta máquina también es macOS.
El job es informativo: reporta sin bloquear. Bloquear cada PR con un fallo que
no se entiende cuesta más de lo que avisa.

### 9. Determinismo entre plataformas

El caché es direccionable por contenido y su hash incluye la versión del motor,
pero **nadie comprueba que el mismo bloque produzca los mismos bytes en Linux y
en macOS**. Si las fuentes del sistema entran en el SVG, no los produce, y dos
personas del mismo equipo se pisan los diagramas en cada commit. La matriz de
CI ya existe; falta cruzar los hashes entre sus jobs.

---

## Lo que falta como herramienta de uso diario

Distinto de lo anterior: no es ingeniería pendiente, es lo que se echa en falta
al usarla para escribir documentación de verdad.

1. **Publicar.** Llevar la salida a Outline o Confluence sigue siendo manual.
   Es la última milla, y mete a DocViz en el negocio de hablar con servicios
   externos, que hasta ahora ha evitado a propósito: decisión, no tarea.
   `docviz bundle` deja el paquete listo justamente para no tener que decidirlo
   todavía.
2. **Una tarjeta KPI con borde.** La de Flint pinta cada indicador en su propia
   caja con su porcentaje —«93 % de 80»—; la nuestra es una fila plana con
   barra de avance. Se lee peor, y es media hora de trabajo.
3. **Reglas de estilo del catálogo.** Comparar los dibujos al lado de los de
   otra librería destapó seis defectos que leer el código no destapó: un
   «undefined» impreso, un eje de clasificación empezando en cero, un límite C4
   rotulado con el nivel equivocado. No hay nada que vigile eso salvo mirar.
   Una prueba de humo que rasterice los 62 tipos y compare contra una
   instantánea aceptada los cazaría antes.

---

## Lo que no está previsto hacer

**Más tipos por tenerlos.** Con 62 el catálogo no es el cuello de botella; la
adopción y la tasa de acierto sí. Los cinco últimos entraron porque cubrían
necesidades reales de un informe —un cronograma, una cifra con su meta, el
ritmo de un trimestre— y aun así **bajaron el acierto de `suggest` cuatro
puntos** hasta que se les escribió su vocabulario y sus casos. Un tipo nuevo no
se añade: compite.

**HTML interactivo.** Contradice la tesis de salida portable, ya existe
`docviz preview` para revisar antes de publicar, y sería reimplementar un
renderer entero. Si algún día hace falta salida editable, el camino barato es un
puente desde el JSON con layout que ya exporta LikeC4.
