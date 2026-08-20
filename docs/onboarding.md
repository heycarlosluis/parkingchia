# Configuración inicial y acceso local

Parking Chía no utiliza cuentas ni requiere Internet para abrir o administrar el parqueadero. La primera ejecución presenta un onboarding local que solicita:

- Nombre del parqueadero.
- Dirección.
- Teléfono.
- PIN opcional de 8 dígitos.

Los tres datos del parqueadero son obligatorios porque identifican la operación y los tickets. El PIN se puede omitir y configurar posteriormente.

## Flujo de acceso

1. El renderer consulta únicamente el estado de acceso mediante `access:get-state`.
2. Si el onboarding está pendiente, muestra el formulario y bloquea el resto de la aplicación.
3. Si existe un PIN al iniciar, muestra la pantalla de desbloqueo.
4. El proceso principal valida el PIN y habilita los IPC operativos solo durante esa ejecución.
5. Al cerrar y volver a abrir, una instalación con PIN regresa al estado bloqueado.

La pantalla no es la única protección: estado, impresión, respaldos, configuración y actualizaciones verifican el acceso también en los handlers IPC.

## Almacenamiento del PIN

El PIN nunca se guarda ni se registra en texto plano. `AccessService` genera una sal aleatoria y deriva un hash con `scrypt`; la comparación utiliza tiempo constante. Los valores viven en `app_settings` bajo claves privadas que nunca se devuelven al renderer.

Después de cinco intentos incorrectos, la aplicación impone una pausa local de 30 segundos. Este control reduce intentos casuales, pero no sustituye el cifrado completo del disco: una persona con acceso administrativo al equipo y al archivo SQLite puede copiar o alterar los datos locales.

## Administración

La pestaña General de Configuración permite editar nombre, dirección y teléfono. La pestaña Seguridad permite:

- Crear un PIN si la aplicación estaba sin protección.
- Cambiar el PIN confirmando el actual.
- Bloquear la aplicación de inmediato.
- Eliminar el PIN confirmando el actual.

No existe recuperación remota porque no hay cuenta ni servidor. La interfaz advierte que el PIN debe conservarse en un lugar seguro. Antes de ofrecer recuperación local deberá diseñarse un mecanismo que no convierta el restablecimiento en una forma de evadir la protección.

## Datos y auditoría

Completar el onboarding, editar el perfil, crear, cambiar o eliminar el PIN genera una entrada de auditoría sin incluir el PIN, el hash ni datos sensibles de la operación. El nombre, dirección y teléfono se usan en el ticket de prueba y podrán alimentar recibos futuros mediante snapshots persistidos.
