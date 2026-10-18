---
name: docviz
description: Genera diagramas y gráficos dentro de documentación Markdown declarando la intención (secuencia, flujo, arquitectura C4, barras, tendencia…) en lugar de escribir PlantUML, Mermaid, D2 o Vega-Lite a mano. Úsalo siempre que vayas a dibujar algo en un documento, cuando dudes qué tipo de diagrama encaja, o cuando un bloque de diagrama no compile. Todo se renderiza en local y la salida es Markdown estándar con imágenes SVG, así que se ve igual en GitHub, en un wiki o en un PDF.
---

# DocViz — diagramas como código dentro de Markdown

Escribes **qué quieres explicar**; DocViz elige el motor y devuelve Markdown
portable con la imagen ya generada. No escribas PlantUML, Mermaid, D2, Graphviz,
Vega-Lite ni LikeC4 a mano: cada visor soporta un subconjunto distinto y el
resultado deja de verse según dónde se lea.

## Las tres vallas

| Valla | Cuándo |
|---|---|
| `diagram` | Interacción, flujo, estados, dependencias, análisis estratégico |
| `chart` | Comparación cuantitativa, tendencia, distribución |
| `architecture` | Modelo C4 |

````md
```diagram
type: sequence
title: Autenticación

participants:
  - Usuario
  - API

flow:
  - Usuario -> API: Login
  - API --> Usuario: Token
```
````

`->` es un mensaje, `-->` una respuesta.

## No adivines el tipo — pregunta

Hay 62 tipos. Antes de escribir un bloque, si no estás seguro:

```bash
npx docviz suggest "el proceso de aprobación de una solicitud"   # recomienda el tipo
npx docviz types                                                 # catálogo con su propósito
npx docviz types sequence                                        # ficha y ejemplo que compila tal cual
```

`docviz types <tipo>` imprime el esqueleto mínimo del tipo. Cópialo y rellénalo:
es la forma más rápida de no equivocarte de campo.

## Di para dónde es el dibujo

El mismo diagrama no se lee igual embebido en una página que proyectado en una
sala. Declara el destino y DocViz ajusta el lienzo para que la letra llegue a la
altura mínima que ese destino exige:

| Destino | Para qué | Letra mínima |
|---|---|---|
| `fit` | Lo que emita el motor (por defecto) | — |
| `doc-inline` | Dentro del ancho de lectura de una página | 12 px |
| `doc-wide` | A sangre, todo el ancho de la página | 12 px |
| `slide-16x9` · `slide-4x3` | Una diapositiva proyectada | 16 px |
| `social-og` | Tarjeta de enlace; se mira en miniatura | 18 px |
| `print-a4-landscape` | A4 horizontal | 11 px |

Se declara una vez en `docviz.config.yaml` (`size: slide-16x9`) y se puede
cambiar bloque a bloque en la valla:

````md
```diagram size=slide-16x9
type: flow
title: Alta de cliente
descripcion: Tres pasos, del alta al cobro, con la validación en el segundo
steps: [Alta, Validación, Cobro]
```
````

No se recoloca nada: solo cambia el lienzo, igual que si agrandaras la imagen.
Si el dibujo **no cabe** en el destino con la letra legible, sale un
`AVISO [DV108]`. No es un fallo del sistema: significa que el diagrama lleva
demasiada información para donde va. Córtalo o cambia de destino; no lo
silencies.

## Pon siempre `descripcion`

`title` dice **de qué** es el diagrama; `descripcion` dice **qué se ve en él**,
y es lo único que le llega a quien no puede mirarlo. Va al `<desc>` del SVG,
junto al `<title>` y a `role="img"`, que DocViz escribe solo.

Una descripción útil nombra lo que el dibujo demuestra, no su forma: «el cobro
depende de la validación, que es el único punto con reintento», no «diagrama de
tres cajas conectadas».

## Flujo de trabajo

```bash
npx docviz check docs-src                     # valida sin dibujar (rápido)
npx docviz build docs-src --output docs       # compila a Markdown + SVG
npx docviz verify docs                        # comprueba que no haya imágenes rotas
npx docviz lint docs                          # revisa los SVG generados
npx docviz diff <docs-src anterior> docs-src  # qué diagramas cambiaron
```

`verify` mira el **Markdown** (que no cite imágenes que no existen); `lint` mira
los **SVG** (nombre accesible, ids únicos, referencias que resuelven, lienzo
utilizable, letra legible para el destino). Son preguntas distintas y ninguna
sustituye a la otra.

Mientras escribes, `npx docviz preview docs --watch` recompila al guardar y
recarga el navegador solo.

No des la tarea por terminada mientras `check`, `verify` o `lint` fallen.

## Cuando algo falla

Cada error trae un **código** además de archivo y línea. Léelo, no adivines:

| Código | Qué hacer |
|---|---|
| `DV101` | Falta un campo obligatorio; el detalle dice cuál |
| `DV102` | El campo está con la forma equivocada (lista donde iba mapa, o al revés) |
| `DV103` | El valor no es uno de los admitidos; el detalle los enumera |
| `DV104` | Escribiste un campo que ese tipo no usa. Si te propone otro nombre, es una errata |
| `DV105` | El bloque no es YAML válido; suele ser la indentación |
| `DV106` | El `type` no existe o va en otra valla; usa `docviz suggest` |
| `DV107` | Se dibujó con un motor de respaldo: el dibujo tiene otro aspecto. Falta algo en la máquina, no en el bloque |
| `DV108` | El dibujo no alcanza la letra del destino. Córtalo o cambia el `size` |
| `DV005` | Falta Java o Chromium en la máquina. No cambies el diagrama: dilo |

Un documento con varios bloques rotos los reporta **todos a la vez**:
arréglalos en una sola pasada.

Y antes de reescribir un bloque a mano:

```bash
npx docviz fix bloque.yaml    # corrige las erratas y dice si con eso basta
```

Un `AVISO ... [DV104]` no rompe el build, pero significa que un campo que
escribiste no llegó al dibujo. O sobra, o está mal escrito; en ningún caso se
ignora.

## Reglas

- Modifica los documentos fuente; nunca el directorio de salida ni `assets/generated`.
- No generes SVG o PNG a mano si DocViz puede generarlos.
- No fijes colores: el tema trae su equivalente en modo oscuro y un color escrito
  a mano pierde esa propiedad.
- No sustituyas un diagrama declarativo por una captura de pantalla.
- Antes de dibujar, comprueba que aporta algo: para información sencilla, una
  tabla o un párrafo comunican mejor. Un diagrama de veinte cajas no explica
  nada — divídelo.

## Primera vez en un proyecto

```bash
npm install -D docviz-builder
npx docviz setup    # descarga plantuml.jar (única operación de red)
npx docviz init     # configuración, AGENTS.md y un documento de ejemplo
npx docviz doctor   # qué motores puede usar esta máquina
```

`docviz init` deja un `AGENTS.md` con el catálogo completo de los 62 tipos y sus
tablas de decisión. Consúltalo cuando necesites el detalle que este resumen no
trae.
