# Temas visuales

## Purpose

Que diagramas producidos por seis motores distintos parezcan piezas del mismo
documento, y que el autor no tenga que fijar colores a mano.

## Requirements

### Requirement: Un tema define la identidad en el dialecto de cada motor

Cada tema **MUST** proporcionar configuración para los seis motores: `skinparam`
de PlantUML, `themeVariables` de Mermaid, identificador de tema de D2, atributos
por defecto de Graphviz, bloque `config` de Vega-Lite y paleta del emisor de
LikeC4.

Cada motor expresa el estilo a su manera y ninguno acepta el vocabulario del
otro. Traducir la misma paleta a los seis dialectos en un único lugar es lo que
hace que un PlantUML y un Vega-Lite del mismo documento no parezcan recortes de
dos informes distintos.

#### Scenario: Cambio de tema
- **DADO** un documento con diagramas de los seis motores
- **CUANDO** se compila con un tema distinto
- **ENTONCES** los seis recursos se regeneran con la nueva paleta

### Requirement: El tema del proyecto se aplica antes de dibujar

El tema **MUST** inyectarse en la fuente del diagrama antes de entregarla al
motor, y **MUST** poder ser sobrescrito por lo que el autor escriba
explícitamente.

Un autor que necesita marcar un nodo en rojo debe poder hacerlo. El tema es un
punto de partida, no una imposición.

#### Scenario: Estilo explícito del autor
- **DADO** un bloque PlantUML con un `skinparam` propio
- **CUANDO** se compila
- **ENTONCES** el valor del autor prevalece sobre el del tema

### Requirement: Las fuentes elegidas existen en la máquina

Los motores que calculan métricas de texto a partir de una fuente concreta
—PlantUML sobre AWT y Graphviz— **MUST** recibir el nombre de una fuente
disponible en los sistemas habituales.

Un nombre de fuente inexistente no produce un error: el motor cae a una serif por
defecto y el diagrama desentona con el resto del documento sin que nadie lo
note. Los motores que emiten `font-family` como lista de alternativas sí pueden
recibir la familia completa, porque el visor resuelve la degradación.

#### Scenario: Fuente no instalada
- **DADO** un tema cuya familia tipográfica principal no está instalada
- **CUANDO** se renderiza con PlantUML o Graphviz
- **ENTONCES** el texto se dibuja con una fuente sans-serif disponible

### Requirement: El contraste del texto se calcula sobre el color real

Cuando el emisor propio dibuja texto sobre un relleno, **MUST** elegir el color
del texto según la luminancia del color que se verá realmente, después de
componer cualquier transparencia contra el fondo.

LikeC4 expresa la transparencia del relleno como opacidad. Un azul oscuro al
15 % se ve como un azul claro: elegir el color del texto a partir del azul
original produce texto blanco sobre fondo claro, ilegible.

#### Scenario: Relleno con opacidad baja
- **DADO** un nodo con color oscuro y opacidad del 15 %
- **CUANDO** se dibuja su título
- **ENTONCES** el texto usa el color oscuro, no el claro

### Requirement: Los temas se amplían sin tocar los renderers

Añadir un tema **MUST** consistir en añadir una entrada al catálogo de temas.

Si un tema nuevo obligara a modificar seis renderers, nadie crearía uno.

#### Scenario: Tema desconocido
- **DADO** una configuración que pide un tema inexistente
- **CUANDO** se carga
- **ENTONCES** falla enumerando los temas disponibles

### Requirement: Una sola imagen sirve al modo claro y al oscuro

Los temas claros **MUST** declarar una contraparte oscura, y el SVG generado
**MUST** emitir sus colores como variables CSS redefinidas bajo
`@media (prefers-color-scheme: dark)`.

Un SVG referenciado desde `<img>` se renderiza como su propio documento, de modo
que el navegador le aplica la preferencia de color del lector. Aprovecharlo
evita el problema real: un diagrama con fondo blanco incrustado en un portal
oscuro deslumbra, y uno con fondo transparente y texto oscuro desaparece.
Generar dos archivos y elegirlos con `<picture>` obligaria a que cada visor
soportara esa etiqueta y duplicaria los recursos.

#### Scenario: Diagrama en un visor claro
- **DADO** un documento compilado con un tema claro
- **CUANDO** se abre en un visor en modo claro
- **ENTONCES** los diagramas usan la paleta clara

#### Scenario: El mismo diagrama en un visor oscuro
- **DADO** el mismo archivo, sin recompilar
- **CUANDO** se abre en un visor en modo oscuro
- **ENTONCES** los diagramas usan la paleta oscura
- **Y** el texto conserva contraste suficiente sobre su fondo

#### Scenario: Tema explícitamente oscuro
- **DADO** el tema `dark`
- **CUANDO** se compila
- **ENTONCES** el SVG no declara variante alguna: quien elige ese tema quiere oscuro siempre

### Requirement: Cada color claro tiene un único equivalente oscuro

La construcción del tema **MUST** rechazar una paleta en la que un mismo
hexadecimal claro corresponda a dos colores oscuros distintos.

La reescritura es textual sobre el valor del color, así que un hexadecimal que
cumple dos roles solo puede traducirse de una forma. Que el fondo y el texto
sobre el color primario sean ambos blanco es correcto —los dos se vuelven
oscuros—; que uno debiera aclararse y el otro oscurecerse seria irresoluble, y
se detecta al construir el tema en lugar de producir una imagen ilegible.

#### Scenario: Paleta ambigua
- **DADO** un tema en el que el mismo color claro deberia volverse claro en un rol y oscuro en otro
- **CUANDO** se construyen sus pares de color
- **ENTONCES** falla indicando el color y los dos destinos en conflicto
