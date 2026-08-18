import { ArrowRight, CarFront, Database, LogIn, LogOut, RefreshCw, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeading } from '@/components/page-heading'
import { useSystemStore } from '@/store/system-store'

function UpdateSummary(): React.JSX.Element {
  const update = useSystemStore((state) => state.updateState)
  const label =
    update?.status === 'downloaded' ? 'Lista para instalar' : (update?.message ?? 'Consultando…')
  return (
    <div className="system-row">
      <div className="system-icon" aria-hidden="true">
        <RefreshCw />
      </div>
      <div>
        <p className="system-label">Actualizaciones</p>
        <p className="system-value">{label}</p>
      </div>
    </div>
  )
}

export function DashboardPage(): React.JSX.Element {
  const { status, loading, error } = useSystemStore()

  return (
    <div className="page-stack">
      <PageHeading
        title="Buen turno"
        description="Estado operativo del parqueadero y accesos para las tareas frecuentes."
        action={
          <Button asChild>
            <Link to="/ingresos">
              <LogIn data-icon="inline-start" />
              Registrar ingreso
            </Link>
          </Button>
        }
      />

      {error ? (
        <div className="inline-error" role="alert">
          <strong>No se pudo consultar el sistema.</strong> {error}
        </div>
      ) : null}

      <section aria-labelledby="summary-title">
        <h2 id="summary-title" className="sr-only">
          Resumen del turno
        </h2>
        <div className="summary-grid">
          <Card className="active-card">
            <CardHeader>
              <CardDescription>Vehículos actualmente activos</CardDescription>
              <CardTitle className="metric-value">
                {loading ? '—' : (status?.activeSessions ?? 0)}
              </CardTitle>
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
              <CardDescription>Estado de los datos locales</CardDescription>
              <CardTitle className="status-title">
                <Database aria-hidden="true" />
                {status?.database.connected ? 'Base de datos lista' : 'Sin conexión local'}
              </CardTitle>
            </CardHeader>
            <CardContent className="card-detail-row">
              <Badge variant={status?.database.connected ? 'secondary' : 'destructive'}>
                {status?.database.connected ? 'SQLite conectado' : 'Requiere atención'}
              </Badge>
              {status?.database.connected ? <span>WAL · claves foráneas activas</span> : null}
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
          <Link className="action-tile" to="/parqueo-activo">
            <span className="action-icon">
              <LogOut aria-hidden="true" />
            </span>
            <span>
              <strong>Registrar salida</strong>
              <small>Busca un vehículo activo y prepara el cobro.</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link className="action-tile" to="/configuracion">
            <span className="action-icon">
              <Settings aria-hidden="true" />
            </span>
            <span>
              <strong>Configuración</strong>
              <small>Administra impresión, copias y actualizaciones.</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="system-strip" aria-label="Estado del sistema">
        <div className="system-row">
          <div className="system-icon" aria-hidden="true">
            <CarFront />
          </div>
          <div>
            <p className="system-label">Aplicación instalada</p>
            <p className="system-value">Versión {status?.version ?? '…'}</p>
          </div>
        </div>
        <UpdateSummary />
      </section>
    </div>
  )
}
