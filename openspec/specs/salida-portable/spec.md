# Salida portable y verificable

## Purpose

Que el Markdown compilado funcione en cualquier visor, se pueda mover de sitio
sin romperse y se pueda comprobar automáticamente que no tiene imágenes rotas.

## Requirements

### Requirement: El resultado es Markdown estándar

Cada bloque compilable **MUST** sustituirse por una imagen Markdown estándar, y
el documento resultante **MUST NOT** requerir que el visor conozca ningún
lenguaje de diagramas ni ejecute JavaScript.

Es el objetivo entero del proyecto: la documentación deja de depender de dónde
se lea. GitHub, VS Code, un portal corporativo, un PDF o un cliente de correo
muestran lo mismo.

#### Scenario: Documento compilado
- **DADO** un documento con bloques de los seis motores
- **CUANDO** se compila
- **ENTONCES** cada bloque aparece como `![alt](ruta)`
- **Y** el documento no contiene ningún script ni referencia a un runtime

### Requirement: Las rutas son relativas al documento

Toda referencia a un recurso **MUST** ser una ruta relativa calculada desde el
directorio del documento compilado.

Una ruta absoluta ata el documento a una máquina concreta. Con rutas relativas,
mover el documento junto a su carpeta de recursos —a otro repositorio, a un
adjunto, a un servidor distinto— sigue funcionando.

#### Scenario: Documento en un subdirectorio
- **DADO** un documento en `docs/guias/detalle/uno.md`
- **CUANDO** se compila
- **ENTONCES** la ruta de la imagen sube los niveles necesarios con `../`
- **Y** no contiene ninguna ruta absoluta

#### Scenario: Traslado del documento
- **DADO** un documento compilado y su carpeta `assets/`
- **CUANDO** se copian juntos a otra ubicación cualquiera
- **ENTONCES** todas las imágenes siguen resolviéndose

### Requirement: Las imágenes declaran dimensiones absolutas

Todo SVG generado **MUST** llevar `width` y `height` en píxeles y un `viewBox`
coherente.

Mermaid emite `width="100%"` sin altura, lo que dentro de un `<img>` produce una
imagen de altura cero: técnicamente presente, visualmente ausente. PlantUML
emite `preserveAspectRatio="none"`, que deforma el dibujo al escalarlo. Ambas
cosas se corrigen antes de escribir el archivo.

#### Scenario: SVG con ancho porcentual
- **DADO** un motor que emite `width="100%"` y un `viewBox`
- **CUANDO** se escribe el recurso
- **ENTONCES** el elemento raíz lleva ancho y alto en píxeles derivados del `viewBox`

### Requirement: Las imágenes llevan texto alternativo

Cada imagen generada **MUST** llevar texto alternativo no vacío, y el SVG
**SHOULD** incluir un elemento `title` con el mismo texto.

Sin alternativa textual la documentación es inaccesible para lectores de
pantalla, y el propio Markdown pierde sentido cuando la imagen no carga.

#### Scenario: Imagen generada
- **DADO** cualquier bloque compilado
- **CUANDO** se inspecciona la salida
- **ENTONCES** la sintaxis de imagen incluye un texto alternativo
- **Y** el SVG contiene un elemento `title`

### Requirement: Verificación automática de la salida

El sistema **MUST** ofrecer una verificación que recorra el Markdown compilado y
falle si encuentra una imagen inexistente o vacía, una ruta absoluta, una imagen
sin texto alternativo o un bloque declarativo sin compilar.

"No hay imágenes rotas" es un criterio de aceptación; dejarlo a la inspección
manual significa que dejará de comprobarse. Un comando que devuelve un código de
salida encaja en el pipeline.

#### Scenario: Salida correcta
- **DADO** un directorio compilado sin incidencias
- **CUANDO** se verifica
- **ENTONCES** termina con código cero

#### Scenario: Recurso ausente
- **DADO** un documento que referencia una imagen que no existe
- **CUANDO** se verifica
- **ENTONCES** falla indicando archivo, línea y URL

#### Scenario: Bloque sin compilar en la salida
- **DADO** un documento de salida que aún contiene un bloque `mermaid`
- **CUANDO** se verifica
- **ENTONCES** falla avisando de que quedó sin compilar
