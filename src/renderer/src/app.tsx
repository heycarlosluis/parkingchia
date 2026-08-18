import { Banknote, BarChart3, UsersRound } from 'lucide-react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/app-shell'
import { ActiveSessionsPage } from '@/features/active-sessions/active-sessions-page'
import { DashboardPage } from '@/features/dashboard/dashboard-page'
import { EntriesPage } from '@/features/entries/entries-page'
import { SettingsPage } from '@/features/settings/settings-page'
import { EmptyModulePage } from '@/features/shared/empty-module-page'

export function App(): React.JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="ingresos" element={<EntriesPage />} />
          <Route path="parqueo-activo" element={<ActiveSessionsPage />} />
          <Route
            path="mensualidades"
            element={
              <EmptyModulePage
                title="Mensualidades"
                description="Clientes y suscripciones mensuales."
                emptyTitle="No hay mensualidades para mostrar"
                emptyDescription="Aquí se administrarán los clientes, vehículos y vigencias de sus planes mensuales."
                icon={UsersRound}
              />
            }
          />
          <Route
            path="caja"
            element={
              <EmptyModulePage
                title="Caja"
                description="Apertura, movimientos y cierre explícito del turno."
                emptyTitle="No hay una caja abierta"
                emptyDescription="La apertura y el cierre requerirán confirmación antes de registrar movimientos."
                icon={Banknote}
              />
            }
          />
          <Route
            path="reportes"
            element={
              <EmptyModulePage
                title="Reportes"
                description="Consulta consolidada de la operación local."
                emptyTitle="Los reportes están en preparación"
                emptyDescription="Los datos se mantendrán locales y podrán consultarse por periodo y tipo de operación."
                icon={BarChart3}
              />
            }
          />
          <Route path="configuracion" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
