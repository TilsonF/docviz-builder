# Roadmap

Estado y siguientes pasos de DocViz. Lo que ya está hecho vive en el
[README](./README.md); aquí solo está lo que falta y por qué importa.

## Dónde está hoy

57 tipos sobre seis motores, dibujados de verdad en cada commit. DSL de tres
vallas, salida Markdown portable, todo local. Servidor MCP, skill instalable y
`AGENTS.md` que no puede desfasarse del catálogo. Códigos de error estables,
`diff` entre versiones, banco de casos que mide el acierto, y un saneador de
SVG con lista de permitidos. 889 pruebas, cobertura 96/88/95/98, cero
vulnerabilidades.

Lo que falta ya no es construir la herramienta: es **saber si se usa bien** y
**llegar a quien la use**.

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

### 2. Inglés

Todo —README, `AGENTS.md`, el skill, los mensajes de error— está en español. El
público de un paquete cuyo argumento es "cualquier agente sabe usarlo" lee
inglés, y los modelos rinden mejor con instrucciones en inglés. Conviene
decidirlo antes de que haya usuarios citando la documentación actual.

### 3. Hillclimb del `suggest`, con partición reservada

Los cuatro fallos conocidos (`histogram`, `funnel`, `stacked-bar`,
`horizontal-bar`) no son vocabulario faltante: "embudo" y "distribucion" ya
están en el catálogo. Es la puntuación —las coincidencias de prosa genérica
suman en muchos tipos y ahogan el término de dominio—. Objetivo: >90 % en la
primera propuesta, medido **sobre casos reservados**, o el número deja de
significar nada.

### 4. Validación de campos anidados

Hoy solo se miran las claves de primer nivel: una errata dentro de `flow:` o de
`elements:` sigue siendo silenciosa.

---

## Medio plazo

### 5. Ampliar los respaldos

49 de 57 tipos no tienen ninguno: sin Chromium caen 12 tipos, sin Java otros 11.
Varios `plantuml → mermaid` y `mermaid → d2` son viables y subirían la tasa de
éxito real más que cualquier mejora de los mensajes.

### 6. `docviz_fix`

El agente manda el bloque roto y recibe el corregido. Con los códigos ya puestos
es barato, pero el eval con modelo dirá si hace falta o si con los mensajes
basta.

### 7. Matriz de CI

Windows y macOS no se han ejecutado nunca. Hay candidatos de Chromium para
Windows en el código que nadie ha probado.

### 8. Rendimiento

El build en frío son unos 33 s y los renders van en serie. Irrelevante con nueve
diagramas, molesto con doscientos.

---

## Largo plazo

### 9. Catálogo visual en el sitio

Los 57 tipos dibujados, generados en el workflow de Pages para no versionar 69
SVG. Es la página que convence.

### 10. Criterios para la 1.0

Decidir explícitamente qué es contrato estable —códigos de error, el DSL, las
herramientas MCP, el formato de salida— y qué puede cambiar. Hoy `0.x` no
promete nada, y está bien; pero conviene saber qué se va a prometer antes de
prometerlo.

### 11. Mantenimiento del allowlist de SVG

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
