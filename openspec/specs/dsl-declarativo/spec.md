# DSL declarativo de alto nivel

## Purpose

Que quien escribe documentación —cada vez más a menudo un agente— declare **qué
quiere explicar** en lugar de **con qué tecnología dibujarlo**. La elección del
motor es una decisión del compilador, no del autor.

## Requirements

### Requirement: Tres vallas, no seis sintaxis

El DSL **MUST** exponer exactamente tres lenguajes de valla —`diagram`, `chart`
y `architecture`— y **MUST** resolver internamente el motor destino a partir del
campo `type`.

Obligar a un modelo de lenguaje a recordar cuándo usar PlantUML y cuándo D2, y
además la sintaxis exacta de cada uno, multiplica los errores. Reducir la
superficie a tres vallas y un catálogo cerrado de tipos convierte un error de
sintaxis en un error de validación con mensaje accionable.

#### Scenario: Intención UML
- **DADO** un bloque `diagram` con `type: sequence`
- **CUANDO** se compila
- **ENTONCES** el motor resuelto es PlantUML

#### Scenario: Intención estratégica
- **DADO** un bloque `diagram` con `type: strategy-tree`
- **CUANDO** se compila
- **ENTONCES** el motor resuelto es D2
- **Y** no se usa UML para representar un concepto que no es UML

#### Scenario: Intención cuantitativa
- **DADO** un bloque `chart` con `type: bar`
- **CUANDO** se compila
- **ENTONCES** el motor resuelto es Vega-Lite

### Requirement: Los lenguajes nativos siguen disponibles

El sistema **MUST** seguir aceptando `plantuml`, `mermaid`, `d2`, `graphviz`,
`vega-lite` y `likec4` como vallas directas.

El DSL cubre las intenciones frecuentes, no todo lo que los motores saben hacer.
Cerrar la vía de escape convertiría una abstracción útil en una limitación.

#### Scenario: Diagrama fuera del catálogo del DSL
- **DADO** un diagrama que requiere una construcción específica de PlantUML
- **CUANDO** el autor escribe un bloque `plantuml` nativo
- **ENTONCES** se compila con el tema del proyecto aplicado

### Requirement: Tolerancia a la ambigüedad de YAML

El compilador **MUST** aceptar `- Origen -> Destino: etiqueta` aunque YAML lo
entregue como un mapa de una sola entrada.

Es la forma que cualquiera escribe de manera natural, y aparece así en toda la
documentación. Pero los dos puntos hacen que YAML lo interprete como
`{"Origen -> Destino": "etiqueta"}`. Exigir comillas sería trasladar al autor un
detalle del formato de serialización.

#### Scenario: Relación con etiqueta
- **DADO** el elemento `- Usuario -> API: Login` dentro de `flow`
- **CUANDO** se compila
- **ENTONCES** se interpreta como un mensaje de `Usuario` a `API` etiquetado `Login`

#### Scenario: Forma explícita
- **DADO** un elemento con los campos `from`, `to` y `label`
- **CUANDO** se compila
- **ENTONCES** produce el mismo resultado que la forma corta

### Requirement: Los errores del DSL enseñan a corregirlos

La validación **MUST** indicar qué campo falla, qué se esperaba y cuáles son los
valores válidos.

El consumidor del mensaje suele ser un agente que va a reintentar. Un error que
solo dice "entrada inválida" produce un segundo intento igual de malo; uno que
enumera los tipos disponibles produce una corrección.

#### Scenario: Tipo inexistente
- **DADO** un bloque `diagram` con `type: mandala`
- **CUANDO** se valida
- **ENTONCES** el error nombra el tipo recibido
- **Y** enumera los tipos disponibles

#### Scenario: Referencia a un participante no declarado
- **DADO** un `flow` que menciona un participante ausente de `participants`
- **CUANDO** se valida
- **ENTONCES** el error nombra el participante desconocido
- **Y** lista los declarados

### Requirement: Los identificadores generados son sintéticos

Los compiladores **MUST** emitir identificadores propios (`n1`, `P2`, ...) hacia
el motor destino y **MUST** usar el texto del autor solo como etiqueta
entrecomillada.

Un nombre con comillas, dos puntos, llaves o acentos rompería la sintaxis
generada, y en el peor caso permitiría inyectar directivas en el lenguaje
destino. Separar identificador de etiqueta elimina la clase entera de problemas.

#### Scenario: Nombre con caracteres especiales
- **DADO** un nodo llamado `Portal de Pagos (v2): "beta"`
- **CUANDO** se compila a cualquier motor
- **ENTONCES** el identificador generado es sintético
- **Y** el nombre aparece únicamente como etiqueta escapada
