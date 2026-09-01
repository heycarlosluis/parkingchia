import {
  ArrowRight,
  Banknote,
  CarFront,
  LogIn,
  LogOut,
  Settings,
  UsersRound,
  Wallet,
} from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { formatCurrency } from '@shared/format'
import { EXPIRING_SOON_DAYS } from '@shared/monthly'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeading } from '@/components/page-heading'
import { useCashStore } from '@/store/cash-store'
import { useMonthlyStore } from '@/store/monthly-store'
import { useSystemStore } from '@/store/system-store'

export function DashboardPage(): React.JSX.Element {
  const status = useSystemStore((state) => state.status)
  const loading = useSystemStore((state) => state.loading)
  const refreshStatus = useSystemStore((state) => state.refreshStatus)

  const cashSession = useCashStore((state) => state.session)
  const cashLoading = useCashStore((state) => state.loading)
  const expectedCop = useCashStore((state) => state.expectedCop)

  const summary = useMonthlyStore((state) => state.summary)
  const monthlyLoading = useMonthlyStore((state) => state.loading)
  const initializeMonthly = useMonthlyStore((state) => state.initialize)

  // El conteo de vehículos y el resumen mensual cambian con la operación; al
  // volver al dashboard se vuelven a consultar para no mostrar datos viejos.
  useEffect(() => {
    void refreshStatus()
    void initializeMonthly()
  }, [refreshStatus, initializeMonthly])

  const activeSessions = status?.activeSessions ?? 0

  return (
    <div className="page-stack">
      <PageHeading
        title="Buen turno"
        description="Lo importante del parqueadero de un vistazo y los accesos a las tareas frecuentes."
        action={
          <div className="page-heading-actions">
            <Button asChild>
              <Link to="/ingresos">
                <LogIn data-icon="inline-start" />
                Registrar ingreso
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/salidas">
                <LogOut data-icon="inline-start" />
                Registrar salida
              </Link>
            </Button>
          </div>
        }
      />

      <section aria-labelledby="summary-title">
        <h2 id="summary-title" className="sr-only">
          Resumen del turno
        </h2>
        <div className="summary-grid">
          <Card className="active-card">
            <CardHeader>
              <CardDescription>Vehículos activos ahora</CardDescription>
              <CardTitle className="metric-value">{loading ? '—' : activeSessions}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <Link to="/parqueo-activo">
                  Ver parqueo activo
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Caja del turno</CardDescription>
              <CardTitle className="status-title">
                <Wallet aria-hidden="true" />
                {cashLoading ? 'Consultando…' : cashSession ? 'Caja abierta' : 'Caja cerrada'}
              </CardTitle>
            </CardHeader>
            <CardContent className="card-detail-row">
              {cashSession ? (
                <Badge variant="secondary">Esperado al cierre {formatCurrency(expectedCop)}</Badge>
              ) : (
                <span>Ábrela para asociar los cobros del turno.</span>
              )}
              <Button variant="outline" asChild>
                <Link to="/caja">
                  {cashSession ? 'Ver caja' : 'Abrir caja'}
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Mensualidades vigentes</CardDescription>
              <CardTitle className="metric-value">
                {monthlyLoading ? '—' : summary.activeCount}
              </CardTitle>
            </CardHeader>
            <CardContent className="card-detail-row">
              {summary.expiringSoonCount > 0 ? (
                <Badge variant="outline">
                  {summary.expiringSoonCount} por vencer en {EXPIRING_SOON_DAYS} días
                </Badge>
              ) : (
                <span>Ninguna por vencer en {EXPIRING_SOON_DAYS} días.</span>
              )}
              <Button variant="outline" asChild>
                <Link to="/mensualidades">
                  Ver mensualidades
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Saldo por cobrar de mensualidades</CardDescription>
              <CardTitle className="metric-value tabular">
                {monthlyLoading ? '—' : formatCurrency(summary.pendingCollectionCop)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <Link to="/mensualidades">
                  Cobrar mensualidades
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="quick-actions-title">
        <div className="section-heading">
          <h2 id="quick-actions-title">Acciones rápidas</h2>
          <p>Elige la operación que vas a realizar.</p>
        </div>
        <div className="action-grid">
          <Link className="action-tile" to="/ingresos">
            <span className="action-icon">
              <LogIn aria-hidden="true" />
            </span>
            <span>
              <strong>Registrar ingreso</strong>
              <small>Captura una matrícula y asigna una tarifa.</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link className="action-tile" to="/salidas">
            <span className="action-icon">
              <LogOut aria-hidden="true" />
            </span>
            <span>
              <strong>Registrar salida</strong>
              <small>Escribe la matrícula y cobra en el mismo paso.</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link className="action-tile" to="/mensualidades">
            <span className="action-icon">
              <UsersRound aria-hidden="true" />
            </span>
            <span>
              <strong>Mensualidades</strong>
              <small>Clientes, periodos pagados por adelantado y sus pagos.</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link className="action-tile" to="/caja">
            <span className="action-icon">
              <Banknote aria-hidden="true" />
            </span>
            <span>
              <strong>Caja</strong>
              <small>Abre el turno, revisa los movimientos y cierra el arqueo.</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link className="action-tile" to="/configuracion">
            <span className="action-icon">
              <Settings aria-hidden="true" />
            </span>
            <span>
              <strong>Configuración</strong>
              <small>Tarifas, impresión, acceso y copias de seguridad.</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link className="action-tile" to="/historial">
            <span className="action-icon">
              <CarFront aria-hidden="true" />
            </span>
            <span>
              <strong>Historial</strong>
              <small>Consulta salidas y reimprime recibos anteriores.</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  )
}
