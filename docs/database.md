# Base de datos local

La base se llama `parkingchia.sqlite` y se crea en el directorio que Electron obtiene con `app.getPath("userData")`. La ruta varía por sistema operativo y no se expone al renderer. La aplicación de desarrollo usa `parkingchia-development` como `userData`; los comandos CLI usan `.data/parkingchia-development.sqlite`. Ambas ubicaciones están separadas de producción.

## Decisiones

- SQLite en modo WAL y con claves foráneas activas.
- IDs de dominio como UUID de texto; el seed usa identificadores estables solo para poder repetirse.
- Timestamps ISO 8601 en UTC.
- Pesos colombianos como enteros (`amount_cop`).
- Estados limitados con restricciones `CHECK`.
- Una sola sesión activa por vehículo y una sola caja abierta mediante índices parciales únicos.
- Recibos con consecutivo positivo y único.
- Auditoría append-only para acciones críticas.

La primera migración crea `app_settings`, `vehicles`, `parking_sessions`, `rate_plans`, `monthly_customers`, `monthly_subscriptions`, `payments`, `receipts`, `cash_register_sessions` y `audit_logs`.

## Migraciones y datos de desarrollo

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

`db:seed` crea dos tarifas, un vehículo y una sesión activa únicamente en la base de desarrollo. Nunca se ejecuta automáticamente en producción.

Al iniciar, la app copia una base existente a `migration-backups` antes de ejecutar migraciones y conserva las cinco copias más recientes. Las migraciones críticas futuras deberán envolver sus cambios en transacciones y validar el respaldo antes de modificar datos.

## Propiedad y copias

Los datos pertenecen al usuario. El instalador y las actualizaciones no reemplazan la base, y el desinstalador no elimina automáticamente los datos. Configuración ofrece una copia consistente mediante la API de backup de SQLite y un diálogo nativo; React nunca recibe acceso arbitrario al sistema de archivos.
