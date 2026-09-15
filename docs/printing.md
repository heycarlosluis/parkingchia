# Impresión térmica

`TicketPrinter` define la abstracción y `ElectronTicketPrinter` implementa el adapter actual con APIs nativas de Electron. No existe dependencia de una marca de impresora y puede agregarse un adapter ESC/POS sin cambiar la interfaz React.

La configuración persistida incluye impresora, papel de 58 u 80 mm, uso del diálogo del sistema y un logo opcional en PNG, JPEG o WebP de máximo 1 MB. El logo se guarda como dato local validado, no como una ruta del equipo, y aparece en todos los documentos.

El tiquete de ingreso es HTML monocromático y conserva matrícula, tipo de vehículo, tarifa y precio de entrada, fecha y hora local hasta el minuto, gracia, empleado del turno y nota. Incluye dos símbolos generados localmente con `bwip-js`:

- Un QR `PC1Q` con el snapshot completo del ingreso.
- Un Code 128 `PC1S` corto con la referencia de la sesión, como respaldo para lectores que solo soportan códigos lineales.

Escanear cualquiera de los dos nunca acepta como autoridad un precio contenido en el papel: el proceso principal resuelve la sesión activa en SQLite y el QR se contrasta con el snapshot almacenado antes de abrir el cobro. Los duplicados conservan los datos originales y se marcan como reimpresión.

## Diagnóstico

1. Confirma que el sistema operativo detecte la impresora.
2. Selecciónala en la pestaña Impresión de Configuración.
3. Mantén activado el diálogo del sistema durante las pruebas.
4. Imprime el ticket de prueba.
5. Registra un ingreso y confirma con el lector que tanto el QR como el Code 128 abran la salida correcta.

Si no hay impresoras o la guardada desapareció, la app devuelve un mensaje controlado y continúa abierta. La impresión silenciosa depende del driver. El corte de papel, apertura de cajón y comandos de bajo nivel se reservaron para un futuro adapter ESC/POS.

## Lectores de códigos

La integración usa el modo USB HID o «teclado»: el lector escribe el contenido y termina con Enter o Tab. No depende de una marca ni de un SDK. El campo de Registrar salida acepta QR, Code 128 o matrícula; cuando ningún formulario ni diálogo tiene el foco, un tiquete válido también abre el flujo de salida desde cualquier sección.

Para instalar un lector, configúralo en modo teclado, habilita QR y Code 128 y deja Enter o Tab como sufijo. La aplicación muestra «Lector listo» para indicar que está preparada para recibir teclas; no afirma que el sistema operativo haya detectado físicamente el dispositivo.
