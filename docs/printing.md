# Impresión térmica

`TicketPrinter` define la abstracción y `ElectronTicketPrinter` implementa el adapter actual con APIs nativas de Electron. No existe dependencia de una marca de impresora y puede agregarse un adapter ESC/POS sin cambiar la interfaz React.

La configuración persistida incluye impresora, papel de 58 u 80 mm y uso del diálogo del sistema. El ticket de prueba es HTML monocromático e incluye el nombre, dirección y teléfono configurados durante el onboarding, además de fecha local, consecutivo, matrícula, tarifa y total COP.

## Diagnóstico

1. Confirma que el sistema operativo detecte la impresora.
2. Selecciónala en la pestaña Impresión de Configuración.
3. Mantén activado el diálogo del sistema durante las pruebas.
4. Imprime el ticket de prueba.

Si no hay impresoras o la guardada desapareció, la app devuelve un mensaje controlado y continúa abierta. La impresión silenciosa depende del driver. El corte de papel, apertura de cajón y comandos de bajo nivel se reservaron para un futuro adapter ESC/POS.
