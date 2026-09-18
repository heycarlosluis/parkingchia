# Impresión térmica

`TicketPrinter` define la abstracción y `ElectronTicketPrinter` implementa el adapter actual con APIs nativas de Electron. No existe dependencia de una marca de impresora y puede agregarse un adapter ESC/POS sin cambiar la interfaz React.

La configuración persistida incluye impresora, papel de 58 u 80 mm, uso del diálogo del sistema y un logo opcional en PNG, JPEG o WebP de máximo 1 MB. El logo se guarda como dato local validado, no como una ruta del equipo, y aparece en todos los documentos.

Los documentos se maquetan sobre el ancho que imprime el cabezal, no sobre el ancho del rollo: 72 mm para papel de 80 mm y 48 mm para papel de 58 mm, que es el tamaño que publican los drivers térmicos. La página se envía sin márgenes y con el alto medido del documento, de modo que el contenido queda centrado, un recibo corto no desperdicia papel y un tiquete largo no se parte en dos hojas.

Ningún documento usa negrita: en el cabezal térmico el trazo grueso se empasta y dificulta la lectura. La jerarquía se construye con tamaño, mayúsculas espaciadas y recuadros sobre una sans de sistema (Arial o Helvetica) con cifras tabulares. Todos comparten el mismo esquema: encabezado centrado con logo, nombre, contacto, tipo de documento y número; la matrícula grande con el tipo de vehículo; filas etiqueta y valor; el importe principal en un recuadro; y un pie breve. La duplicación se marca con un recuadro «REIMPRESIÓN» bajo el encabezado. Las fechas usan el formato local de la aplicación y, si no caben, se parten entre la fecha y la hora.

El tiquete de ingreso es HTML monocromático y conserva matrícula, tipo de vehículo, tarifa y precio de entrada, fecha y hora local hasta el minuto, gracia, empleado del turno y nota. Incluye dos símbolos generados localmente con `bwip-js`:

- Un QR.
- Un Code 128.

Los dos llevan el mismo código de 16 dígitos: 15 que identifican la sesión y uno de verificación Luhn. Debajo se imprime ese código agrupado de cuatro en cuatro (`1234 5678 9012 3456`) para teclearlo si no hay lector. El código es solo numérico porque el lector escribe como un teclado estadounidense y, en una distribución latinoamericana o española, los signos y las mayúsculas llegan cambiados; la fila de números es igual en todas (D-038).

Los símbolos se dibujan con módulos de un número entero de puntos del cabezal (8 puntos por milímetro), alineados a su rejilla y con zona de silencio propia:

| Papel | Módulo del Code 128 | Módulo del QR      |
| ----- | ------------------- | ------------------ |
| 80 mm | 3 puntos (0,375 mm) | 8 puntos (1 mm)    |
| 58 mm | 2 puntos (0,25 mm)  | 6 puntos (0,75 mm) |

En 58 mm el Code 128 solo cabe con módulos de 2 puntos y es sensible al sangrado del papel térmico; el QR es la lectura confiable en ese ancho.

Escanear cualquiera de los dos nunca acepta como autoridad un precio contenido en el papel: el proceso principal busca la sesión activa en SQLite y cobra con sus datos. Los duplicados conservan los datos originales y se marcan como reimpresión.

Los tiquetes impresos hasta `0.1.0-alpha.5` (QR `PC1Q` con el snapshot y Code 128 `PC1S`) se siguen aceptando. Si su QR llega con `'` o `?` en lugar de `-` o `_` por la distribución del teclado, o con las letras invertidas por el bloqueo de mayúsculas, la aplicación lo repara antes de leerlo.

## Diagnóstico

1. Confirma que el sistema operativo detecte la impresora.
2. Selecciónala en la pestaña Impresión de Configuración.
3. Mantén activado el diálogo del sistema durante las pruebas.
4. Imprime el ticket de prueba.
5. Registra un ingreso y confirma con el lector que tanto el QR como el Code 128 abran la salida correcta.

Si no hay impresoras o la guardada desapareció, la app devuelve un mensaje controlado y continúa abierta. La impresión silenciosa depende del driver. El corte de papel, apertura de cajón y comandos de bajo nivel se reservaron para un futuro adapter ESC/POS.

## Lectores de códigos

La integración usa el modo USB HID o «teclado»: el lector escribe el contenido y termina con Enter o Tab. No depende de una marca ni de un SDK. El campo de Registrar salida acepta el código escaneado, los 16 dígitos tecleados o la matrícula; cuando ningún formulario ni diálogo tiene el foco, un tiquete escaneado también abre el flujo de salida desde cualquier sección.

Para instalar un lector, configúralo en modo teclado, habilita QR y Code 128 y deja Enter o Tab como sufijo. La aplicación muestra «Lector listo» para indicar que está preparada para recibir teclas; no afirma que el sistema operativo haya detectado físicamente el dispositivo.

El lector del cliente es un YHD-9601D, de escritorio, 2D y omnidireccional: lee QR y Code 128.

### Si el lector no abre la salida

1. Abre un editor de texto y escanea el tiquete. Deben aparecer exactamente los 16 dígitos impresos bajo el código de barras, seguidos de un salto de línea.
2. Si no aparece nada, el lector no está en modo teclado o no tiene habilitado ese tipo de código: restablécelo con el código de fábrica de su manual.
3. Si aparecen los dígitos pero no el salto de línea, configura Enter o Tab como sufijo con el manual del lector.
4. Si aparecen otros caracteres, revisa en el manual la opción de idioma del teclado. Los tiquetes nuevos solo usan números y no deberían verse afectados.
