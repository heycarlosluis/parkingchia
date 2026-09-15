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

La segunda migración (`0001`) recrea `rate_plans` para el módulo de tarifas: `billing_unit` admite `minute`, `grace_minutes` pasa a ser anulable (`NULL` significa «usa la gracia general») y se añaden `minimum_charge_cop` y `daily_cap_cop`. Las filas existentes conservan nombre, tipo, unidad, precio y estado; su `grace_minutes` en cero se normaliza a `NULL`.

Recrear una tabla referenciada exige que las claves foráneas estén desactivadas **fuera** de la transacción de migración: dentro de ella `PRAGMA foreign_keys` no tiene efecto y `PRAGMA defer_foreign_keys` no recalcula el contador de violaciones tras el `RENAME`. Por eso `DatabaseManager` y `scripts/database.ts` apagan las claves foráneas alrededor de `migrate()`, las vuelven a encender y ejecutan `PRAGMA foreign_key_check`; si aparece una inconsistencia, el arranque falla en lugar de continuar con datos rotos.

`app_settings` conserva ajustes de impresión, perfil, finalización del onboarding, el hash del PIN opcional y la configuración de tarifas bajo el prefijo `tariff.` (unidad de cobro, gracia, hora desde la que aplica la gracia, umbral y duración de la plena, IVA, modo de IVA y redondeo). El PIN se deriva con `scrypt` y sal aleatoria; nunca se persiste en texto plano ni se expone al renderer. Añadir estas claves no requiere alterar el esquema tabular.

El logo opcional vive en `app_settings` bajo `parking.logo` como un data URL validado de imagen, con límite de 1 MB en el contrato IPC. No se persisten rutas del sistema ni se habilita acceso al sistema de archivos desde React.

## Migraciones y datos de desarrollo

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

`db:seed` crea dos tarifas por hora con cobro mínimo y plena, un vehículo y una sesión activa únicamente en la base de desarrollo. Nunca se ejecuta automáticamente en producción.

Al iniciar, la app copia una base existente a `migration-backups` antes de ejecutar migraciones y conserva las cinco copias más recientes. Las migraciones críticas futuras deberán envolver sus cambios en transacciones y validar el respaldo antes de modificar datos.

La migración `0002` agrega `plena_cop` a `rate_plans` copiando los valores de `daily_cap_cop`, y la `0003` elimina esa columna. La plena es el precio del día completo; el umbral de horas que la activa vive en `app_settings` como `tariff.plenaThresholdHours`.

La migración `0004` incorpora notas a clientes y suscripciones mensuales, índices de búsqueda y la referencia `parking_sessions.subscription_id` que enlaza una salida con la mensualidad que la cubrió. La migración `0005` crea `employees` y añade `cash_register_sessions.employee_id` para identificar quién operó cada turno de caja.

La migración `0006` añade `parking_sessions.entry_snapshot_json`. Es anulable para conservar las sesiones creadas por versiones anteriores; los ingresos nuevos guardan allí la versión del formato, referencia, matrícula, vehículo, tarifa y precio, hora UTC, gracia, empleado y nota que existían al entrar.

## Ciclo de una sesión de parqueo

Un ingreso crea o reutiliza la fila de `vehicles` correspondiente a la matrícula normalizada y abre una fila en `parking_sessions` con estado `active`, junto con el snapshot inmutable del tiquete. El índice parcial único `parking_sessions_one_active_vehicle` garantiza que un vehículo no tenga dos sesiones abiertas.

La salida ocurre en una sola transacción: actualiza la sesión a `closed` con `exited_at` y `calculated_amount_cop`, inserta el pago en `payments` y emite el recibo en `receipts` con un consecutivo calculado dentro de la misma transacción. `receipts.snapshot_json` guarda una copia inmutable del cobro (matrícula, tarifa, permanencia, desglose de IVA, medio de pago, recibido y cambio) para poder reimprimir sin recalcular.

Cuando la permanencia no supera el tiempo de gracia el total es cero, así que la sesión se cierra sin pago ni recibo: `payments` exige `amount_cop > 0`. Anular un ingreso deja la sesión en `cancelled` con importe cero y registra el motivo en `audit_logs`.

Cada pago de parqueo o de mensualidad se asocia, al registrarse, a la caja abierta en ese momento mediante `payments.cash_register_session_id`. Si no hay caja abierta, el pago se registra igual y ese campo queda en `NULL`.

## Propiedad y copias

Los datos pertenecen al usuario. El instalador y las actualizaciones no reemplazan la base, y el desinstalador no elimina automáticamente los datos. Configuración ofrece una copia consistente mediante la API de backup de SQLite y un diálogo nativo; React nunca recibe acceso arbitrario al sistema de archivos.
