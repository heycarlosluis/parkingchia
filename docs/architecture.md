# Arquitectura

Parking Chía es una aplicación Electron offline-first dividida en cuatro límites claros:

```text
src/main      Electron, SQLite, impresión, actualizaciones, ventanas y seguridad
src/preload   puente mínimo y tipado mediante contextBridge
src/renderer  React, navegación, formularios y presentación
src/shared    contratos, validaciones y helpers puros
```

## Flujo de confianza

El renderer no dispone de `require`, `process`, sistema de archivos ni `ipcRenderer`. `window.parkingAPI` expone operaciones concretas. El proceso principal valida entradas con Zod, ejecuta la operación y devuelve un resultado uniforme sin rutas ni detalles internos.

La ventana usa `nodeIntegration: false`, `contextIsolation: true`, sandbox y CSP. La navegación fuera del origen se bloquea. Solo URLs HTTPS solicitadas explícitamente por un enlace pueden abrirse con el navegador del sistema.

## Módulos principales

- `database`: conexión, migraciones, esquema Drizzle, WAL, respaldos y cierre.
- `settings`: configuración local persistida en SQLite.
- `ipc`: registro central de canales y manejo uniforme de errores.
- `printing`: interfaz `TicketPrinter` y adapter nativo de Electron.
- `updates`: máquina de estados de `electron-updater` y eventos hacia React.
- `security`: reglas de navegación externa.
- `security/access-service`: onboarding, perfil del parqueadero, hash del PIN y estado de bloqueo en memoria.
- `parking`: ingreso, salida, anulación, pagos y recibos como ciclo transaccional.
- `tariffs`: configuración de cobro, planes de tarifa y liquidación de permanencias.
- `monthly`: clientes, planes, suscripciones, cobertura y pagos por abono.
- `cash`: apertura, cierre, arqueo en vivo y anulación de cobros.
- `employee`: administración de empleados y su vínculo con los turnos de caja.
- `windows`: configuración de la ventana principal.

El bloqueo de instancia única impide dos procesos concurrentes sobre la misma base. La lógica comercial vive en servicios de dominio del proceso principal y no se traslada a componentes React.

Antes de montar las rutas operativas, el renderer consulta el estado de acceso. Onboarding y desbloqueo son las únicas operaciones disponibles sin autorización; los handlers restantes validan en el proceso principal que la configuración inicial esté completa y la aplicación desbloqueada.
