# Contribuir a Parking Chía

Gracias por ayudar a construir Parking Chía. El proyecto está en una etapa inicial y prioriza la seguridad de los datos locales, la claridad operativa y cambios pequeños que puedan verificarse.

## Preparación

1. Instala Node.js 22 y npm.
2. Ejecuta `npm ci`.
3. Crea una rama desde `main`.
4. Usa `npm run dev` para desarrollar.

## Antes de abrir un pull request

Ejecuta:

```bash
npm run format:check
npm run typecheck
npm run lint
npm run test:run
npm run build
```

No incluyas bases de datos, datos de clientes, tickets reales, certificados, tokens ni archivos `.env`. Las migraciones deben ser aditivas cuando sea posible y deben preservar los datos existentes. Toda operación IPC nueva necesita un canal estático, entrada validada y una función específica en el preload.

## Convenciones

- TypeScript estricto y sin `any` evitable.
- Fechas persistidas en UTC.
- Valores monetarios como enteros en pesos colombianos.
- Componentes visuales sin acceso a Node.js ni SQLite.
- Textos visibles en español y en estilo de oración.
- Commits con mensajes claros, por ejemplo `feat: add vehicle entry flow`.

No se aceptan cambios que reduzcan `contextIsolation`, habiliten `nodeIntegration`, expongan `ipcRenderer` completo o borren datos locales durante una actualización o desinstalación.
