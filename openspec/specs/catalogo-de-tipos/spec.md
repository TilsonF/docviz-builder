# Catálogo de tipos

## Purpose

Que la decisión de "qué forma tiene esto" esté escrita en un solo sitio, y que
quien escribe documentación —cada vez más a menudo un modelo de lenguaje— pueda
consultarla en lugar de recordarla.

## Requirements

### Requirement: Una sola fuente de verdad

El catálogo **MUST** ser el único lugar donde se declara qué tipos existen, qué
motor atiende cada uno y con qué alternativa, y la CLI, el servidor MCP y la
documentación **MUST** derivar sus listados de él.

Tres listas de tipos mantenidas a mano divergen en la primera semana: la CLI
ofrece uno que el compilador no conoce, la documentación describe otro que se
retiró. Derivarlo todo de una estructura convierte ese fallo en imposible.

#### Scenario: Tipo nuevo
- **DADO** un tipo añadido al catálogo con su compilador
- **CUANDO** se consulta la CLI o la herramienta MCP
- **ENTONCES** aparece sin haber tocado ninguna de las dos

#### Scenario: Catálogo y compiladores desincronizados
- **DADO** un tipo declarado en el catálogo sin compilador, o al revés
- **CUANDO** se ejecutan las pruebas
- **ENTONCES** fallan nombrando el tipo descolgado

### Requirement: Cada tipo declara cuándo NO usarlo

Todo tipo **MUST** declarar su propósito, cuándo es la elección correcta y
cuándo conviene otro, y **MUST** incluir un ejemplo mínimo que compile tal cual.

Un catálogo de nombres obliga a adivinar. Decir cuándo *no* usar algo es lo que
evita el error más común —representar un análisis estratégico con UML porque UML
era lo que se recordaba— y el ejemplo evita el segundo: acertar el tipo y
equivocarse en la forma.

#### Scenario: Ejemplo del catálogo
- **DADO** cualquier tipo del catálogo
- **CUANDO** se compila su ejemplo
- **ENTONCES** produce una fuente válida para el motor que declara

### Requirement: Recomendación a partir de una frase

El sistema **MUST** ofrecer una consulta que reciba una descripción en lenguaje
natural y devuelva los tipos más adecuados con su bloque listo para rellenar.

Con más de cincuenta tipos, recordarlos todos deja de ser razonable. Una
recomendación convierte el catálogo en algo que se usa, y devolver el esqueleto
elimina el paso donde más se falla.

#### Scenario: Necesidad descrita en lenguaje natural
- **DADO** el texto "el proceso de aprobación para auditoría"
- **CUANDO** se pide una recomendación
- **ENTONCES** el primer resultado es `bpmn`
- **Y** viene acompañado de un bloque de ejemplo

#### Scenario: Necesidad que no encaja
- **DADO** un texto sin relación con ninguna intención del catálogo
- **CUANDO** se pide una recomendación
- **ENTONCES** no se inventa una
- **Y** se recuerda que a veces una tabla comunica mejor

### Requirement: El motor alternativo se compila de nuevo

Cuando un tipo declara un motor de respaldo, el sistema **MUST** compilar la
fuente al lenguaje de ese motor, y **MUST NOT** limitarse a enviar la misma
fuente a otro sitio.

Cada motor tiene su propia sintaxis: un cronograma de Mermaid no es un
cronograma de PlantUML. Un respaldo que solo cambia el destinatario fallaría en
el primer intento.

#### Scenario: Máquina sin navegador
- **DADO** un `gantt` y un entorno sin Chromium
- **CUANDO** se compila
- **ENTONCES** se resuelve con PlantUML
- **Y** la fuente generada es la de PlantUML, no la de Mermaid

#### Scenario: Respaldo sin compilador
- **DADO** un tipo que declara un respaldo para el que no existe compilador
- **CUANDO** se ejecutan las pruebas
- **ENTONCES** fallan: un respaldo sin compilador es una promesa vacía

### Requirement: El tipo pertenece a una valla concreta

El compilador **MUST** rechazar un tipo declarado en una valla que no le
corresponde, indicando cuál es la suya.

`radar` es un diagrama y `bar` un gráfico. Aceptar cualquiera en cualquier valla
haría que el nombre de la valla dejara de significar nada; rechazarlo con el
nombre correcto convierte el error en una corrección de un carácter.

#### Scenario: Valla equivocada
- **DADO** un bloque `chart` con `type: radar`
- **CUANDO** se compila
- **ENTONCES** falla indicando que `radar` pertenece a `diagram`
