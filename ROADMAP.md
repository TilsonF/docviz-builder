# Roadmap

Estado y siguientes pasos de DocViz. Lo que ya está hecho vive en el
[README](./README.md); aquí solo está lo que falta y por qué importa.

## Dónde está hoy

64 tipos sobre seis motores, dibujados de verdad en cada commit. DSL de tres
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
  funcionan 53 de los 64 tipos. Antes eran 34 de 57.
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
- **El build ya no degrada en silencio** (`DV107`): si un bloque se dibujó con
  su respaldo, lo dice con su archivo y su línea.
- **LikeC4 es opcional.** Se sigue instalando por defecto —quien lo tenía no lo
  pierde al actualizar— y con `--omit=optional` salen sus 45 paquetes y la
  cadena donde vive el aviso de `braces`.
- **Lint con información de tipos** y **auditoría con excepciones que caducan**
  en CI.
- **`docviz fix` tiene banco**: 23 casos repartidos en tres resultados
  —repara, ya estaba bien, no adivina—. Escribirlo encontró dos defectos más:
  con la misma errata repetida corregía solo la primera y devolvía un bloque a
  medio arreglar diciendo que estaba corregido, y se negaba a reparar cuando
  la clave correcta existía en OTRO elemento de la lista, que es el caso más
  común.
- **LICENCIAS.md generado**: qué hereda quien instala, con los 309 paquetes
  clasificados. Una licencia que el script no sepa clasificar hace fallar la
  comprobación, para que ninguna pase inadvertida.
- **Cómo prescindir de LikeC4**, medido: `npm remove` no lo saca, y el ahorro
  real son 19 MB y no 44, porque su respaldo pide una JVM y un jar de 27 MB.
- **Lint con información de tipos** en CI, que no había ninguno. 139 hallazgos
  al empezar, 0 al terminar, y cinco fallos reales por el camino — entre ellos
  una `note:` escrita como mapa que dibujaba «[object Object]» en el diagrama.
- **La cobertura dejó de depender del sistema que la mide.** `browserCandidates`
  leía `os.platform()` por dentro, así que dos de sus tres ramas eran
  inalcanzables en cada máquina: 85,06 % en un Mac y 84,94 % en Linux, a los
  dos lados del umbral. La plataforma es ahora un parámetro.
- **El destino del dibujo** (`size`): siete lienzos con su letra mínima, y el
  veredicto de densidad (`DV108`) cuando el diagrama no se lee en el destino al
  que va. Solo cambia `width`/`height`; el `viewBox` queda intacto, así que no
  puede solapar ni recortar nada.
- **Contrato de accesibilidad del SVG**: `role="img"` impuesto, `<title>` como
  primer hijo, `<desc>` desde `description`, ids prefijados por figura y
  variables CSS acotadas a la raíz del propio SVG. Antes todos los SVG
  numeraban sus ids desde `dv1` y declaraban su paleta sobre `:root`: dos
  diagramas en una página se pisaban el nombre accesible y los colores.
- **`docviz lint`**: la revisión del **artefacto**, que era el hueco entre
  `check` (la fuente) y `verify` (el Markdown). Nueve reglas exactas, y el
  informe cuenta cuántos elementos quedaron sin medir para que un cero no se
  lea como visto bueno. En su primera ejecución sobre las 74 figuras del
  catálogo encontró cuatro defectos reales invisibles hasta entonces, y dos de
  sus propias reglas resultaron ser falsos positivos antes de afinarlas.
- **Versión del post-proceso en el hash** (`PIPELINE_VERSION`). El hash ya
  invalidaba al cambiar la versión del motor, pero no al cambiar lo que DocViz
  hace **después** del motor: al añadir el contrato de accesibilidad, un
  proyecto con caché caliente siguió sirviendo los SVG viejos sin que nada lo
  dijera.

### Cerrado en la 0.8

- **Enlaces en los nodos** (`href`). La capacidad estaba en el SVG desde
  siempre —el saneador admite `<a href>`— y **ningun tipo la exponia**. Es la
  unica interactividad que sobrevive a un wiki, a un repositorio y a un PDF.
  Un destino que el saneador quitaria falla la compilacion en lugar de
  desaparecer en silencio.
- **`story-map` y `access-matrix`.** Los dos entraron porque su insumo ya
  existe: el backlog y el catalogo de permisos. Y los dos se declaran en plano,
  asi que `dataFile` los sirve desde un `.csv` sin escribir la matriz a mano.
  Medido: el acierto de `suggest` subio de 89,7 % a 90,5 % (reservado, de
  90,0 % a 91,2 %).
- **Los alias en español dejaron de ser campos desconocidos.** `titulo` y
  `descripcion` producian un `DV104` aunque el compilador los leyera, y
  `docviz fix` «corregia» `titulo` a `title` reescribiendo un bloque que
  funcionaba. A cambio se gano un aviso que no habia: declarar los dos nombres
  del mismo campo deja uno sin efecto, y ahora se dice.
- **`docviz --version` dejo de mentir.** Estaba escrita a mano en `cli.ts` y
  nadie la subia: la 0.7.0 y la 0.8.0 salieron al registro diciendo las dos
  que eran la 0.6.0, y `--version` es lo primero que mira quien va a abrir un
  informe de fallo. Ahora se lee del manifiesto y una prueba comprueba que
  coincidan, asi que no puede volver a desincronizarse. El primer intento
  resolvia la ruta con `new URL(...).pathname`, que en Windows es
  `/C:/Users/...` y no vale para abrir nada: respondia «desconocida» solo
  alli. Lo caza la matriz de CI, no el desarrollo local.
- **El rastreador de campos no se envuelve dos veces.** Un compilador que
  pasara a un ayudante el registro que ya observaba partia las lecturas en dos
  conjuntos, y campos leidos de verdad salian como ignorados.

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

### 2. Terminar los mensajes de error en inglés

El mecanismo ya está: `DOCVIZ_LANG=en`, y las dos versiones de cada texto
escritas juntas con `t(es, en)` en lugar de un catálogo de claves aparte —una
clave se queda sin traducir en silencio; así el compilador exige las dos.

El camino común está traducido, y resulta que cubre más de lo que parece: los
193 errores que produce romper los 64 ejemplos del catálogo salen en inglés,
porque todos pasan por los mismos ayudantes.

Faltan **161 llamadas** en compiladores concretos: `diagram-product.ts` (15),
`datos.ts` (14), `fallbacks.ts` (14), `config/load.ts` (12)… Son mensajes con
matiz de dominio, así que traducirlos en bloque sin leerlos saldría peor que
dejarlos.

Y falta la decisión: hoy el valor por defecto es `es`. Cambiarlo es ahora una
línea, que es el objetivo de haber hecho el mecanismo primero.

### 3. Los siete tipos que aún dependen de su motor

Sin Java caen `wireframe`, `json` y `yaml`: los tres son árboles o bocetos que
PlantUML dibuja de una forma sin equivalente razonable. Sin Chromium caen
`git-graph`, `sankey`, `treemap` y `bpmn`.

De esos, dos parecen viables: `git-graph` sobre D2 —ramas como contenedores— y
`treemap`, que Vega (no Vega-Lite) sabe dibujar. El resto probablemente haya
que documentarlos como dependientes de su motor y dejarlo dicho.

---

## Medio plazo

### 4. macOS: ya no es un misterio, son tres cosas

Durante semanas esto decía «una prueba de la CLI agota los 180 s y no se sabe
por qué». Medido, se descompone:

**El disco no era.** Se instrumentó el job: **94 GiB libres, 12 % de uso**,
con `node_modules` en 502 MB. La hipótesis más repetida en los informes de
GitHub queda descartada para nuestro caso.

**La concurrencia tampoco.** `vitest.config.ts` ya corre con `maxWorkers: 1` y
`fileParallelism: false`: los 51 forks que menciona el log son secuenciales,
no simultáneos.

**Lo que sí hay:**

1. **D2 es lentísimo en ese runner.** Las dos pruebas que agotan los 180 s
   —`builder.test.ts` «escribe los recursos en el assetsDir configurado» y
   `cli-comandos.test.ts` «check y verify aceptan -c»— dibujan con D2, cuyo
   bundle WASM pesa 58 MB. Y con `pool: 'forks'` **cada archivo de prueba lo
   recompila desde cero**. Encaja con que `mcp-tools.test.ts` tardara 30 s
   allí y 3 s en los demás: también usa D2. El runner tiene **7 GB de RAM**.
   El camino a probar es compartir el módulo compilado entre archivos, o
   reconocer que ese runner necesita más tiempo para los que tocan D2.
2. **`watch.test.ts` sigue siendo inestable** sobre el sistema de archivos
   real: FSEvents tarda más de lo que la prueba espera. La parte determinista
   ya se arregló haciendo inyectable el observador; lo que queda es la que
   mide el sistema de verdad.
3. **Un apagado del runner**, una sola vez: «The runner has received a
   shutdown signal», sin que fallara ninguna prueba. La corrida siguiente
   llegó al final. Parece un evento aislado de infraestructura y no algo
   nuestro.

El job sigue informativo, pero ya no por desconocimiento: ahora se sabe qué
arreglar y en qué orden.

### 5. Determinismo entre plataformas

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
3. **Los recursos huérfanos no se recogen.** `build` sin `--clean` escribe el
   recurso nuevo y **deja el viejo** en la salida: al cambiar el hash del
   pipeline, `docs/assets/generated/` pasó de 9 archivos a 19, y diez eran
   SVG que ya no referencia nadie. `verify` no los ve —comprueba que lo citado
   exista, no que lo que existe esté citado— así que en un wiki se quedan para
   siempre. Lo encontró `lint`, que sí los revisa: fallaba sobre figuras
   muertas. Recoger lo que ningún documento cita es una pasada al final del
   build, y `--clean` no es la respuesta porque borra también lo que no generó
   DocViz.
4. **Reglas de estilo del catálogo.** Comparar los dibujos al lado de los de
   otra librería destapó seis defectos que leer el código no destapó: un
   «undefined» impreso, un eje de clasificación empezando en cero, un límite C4
   rotulado con el nivel equivocado. No hay nada que vigile eso salvo mirar.
   Una prueba de humo que rasterice los 64 tipos y compare contra una
   instantánea aceptada los cazaría antes. `docviz lint` cubre ahora la parte
   que se puede leer del archivo —un lienzo inutilizable, un texto anclado
   fuera— pero no la que hay que **ver**: un eje empezando en cero o un rótulo
   con el nivel equivocado siguen necesitando el ojo o una instantánea.

---

## Lo que no está previsto hacer

**Más tipos por tenerlos.** Con 64 el catálogo no es el cuello de botella; la
adopción y la tasa de acierto sí. Los cinco últimos entraron porque cubrían
necesidades reales de un informe —un cronograma, una cifra con su meta, el
ritmo de un trimestre— y aun así **bajaron el acierto de `suggest` cuatro
puntos** hasta que se les escribió su vocabulario y sus casos. Un tipo nuevo no
se añade: compite.

Los dos de la 0.8 compitieron y ganaron: `story-map` y `access-matrix` entraron
porque su insumo ya existe en los proyectos —el backlog y el catálogo de
permisos— y porque, al declararse en plano, `dataFile` los sirve desde un
`.csv` sin escribir el bloque a mano. Y se midió antes de darlos por buenos: el
acierto de `suggest` subió, no bajó. Un tipo nuevo cuesta su vocabulario y sus
casos de evaluación, no su compilador.

**HTML interactivo.** Contradice la tesis de salida portable, ya existe
`docviz preview` para revisar antes de publicar, y sería reimplementar un
renderer entero. Si algún día hace falta salida editable, el camino barato es un
puente desde el JSON con layout que ya exporta LikeC4.
