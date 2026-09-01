import { useEffect } from 'react'
import { BarChart3, RefreshCw } from 'lucide-react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/app-shell'
import { ActiveSessionsPage } from '@/features/active-sessions/active-sessions-page'
import { CashPage } from '@/features/cash/cash-page'
import { DashboardPage } from '@/features/dashboard/dashboard-page'
import { EntriesPage } from '@/features/entries/entries-page'
import { ExitPage } from '@/features/exits/exit-page'
import { HistoryPage } from '@/features/history/history-page'
import { MonthlyPage } from '@/features/monthly/monthly-page'
import { SettingsPage } from '@/features/settings/settings-page'
import { EmptyModulePage } from '@/features/shared/empty-module-page'
import { OnboardingPage } from '@/features/access/onboarding-page'
import { UnlockPage } from '@/features/access/unlock-page'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAccessStore } from '@/store/access-store'

export function App(): React.JSX.Element {
  const accessState = useAccessStore((store) => store.state)
  const loading = useAccessStore((store) => store.loading)
  const error = useAccessStore((store) => store.error)
  const initialize = useAccessStore((store) => store.initialize)

  useEffect(() => {
    void initialize()
  }, [initialize])

  if (loading) {
    return (
      <main className="startup-screen" aria-busy="true">
        <RefreshCw aria-hidden="true" />
        <p>Preparando los datos locales…</p>
      </main>
    )
  }

  if (error || !accessState) {
    return (
      <main className="startup-screen">
        <Alert variant="destructive" className="startup-error">
          <AlertTitle>No fue posible abrir Parking Chía</AlertTitle>
          <AlertDescription>
            {error ?? 'No se pudo consultar la configuración local.'}
          </AlertDescription>
        </Alert>
        <Button type="button" onClick={() => void initialize()}>
          <RefreshCw data-icon="inline-start" />
          Intentar nuevamente
        </Button>
      </main>
    )
  }

  if (!accessState.onboardingCompleted) return <OnboardingPage />
  if (accessState.locked) return <UnlockPage />

  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="ingresos" element={<EntriesPage />} />
          <Route path="salidas" element={<ExitPage />} />
          <Route path="parqueo-activo" element={<ActiveSessionsPage />} />
          <Route path="historial" element={<HistoryPage />} />
          <Route path="tarifas" element={<Navigate to="/configuracion?tab=tarifas" replace />} />
          <Route path="mensualidades" element={<MonthlyPage />} />
          <Route path="caja" element={<CashPage />} />
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
