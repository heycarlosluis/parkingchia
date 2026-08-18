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
- `windows`: configuración de la ventana principal.

El bloqueo de instancia única impide dos procesos concurrentes sobre la misma base. La lógica comercial se añadirá en servicios de dominio, sin trasladarla a componentes React.
