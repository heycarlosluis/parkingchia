import { useEffect } from 'react'
import {
  Banknote,
  BarChart3,
  CarFront,
  CircleParking,
  History,
  LayoutDashboard,
  LogIn,
  LogOut,
  Settings,
  UsersRound,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useSystemStore } from '@/store/system-store'
import { useAccessStore } from '@/store/access-store'
import { useCashStore } from '@/store/cash-store'
import { useEntryTicketScanner } from '@/hooks/use-entry-ticket-scanner'

const navigation = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/ingresos', label: 'Registrar ingreso', icon: LogIn },
  { to: '/salidas', label: 'Registrar salida', icon: LogOut },
  { to: '/parqueo-activo', label: 'Parqueo activo', icon: CarFront },
  { to: '/historial', label: 'Historial', icon: History },
  { to: '/mensualidades', label: 'Mensualidades', icon: UsersRound },
  { to: '/caja', label: 'Caja', icon: Banknote },
  { to: '/reportes', label: 'Reportes', icon: BarChart3 },
  { to: '/configuracion', label: 'Configuración', icon: Settings },
] satisfies ReadonlyArray<{
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
}>

export function AppShell(): React.JSX.Element {
  useEntryTicketScanner()
  const initialize = useSystemStore((state) => state.initialize)
  const setUpdateState = useSystemStore((state) => state.setUpdateState)
  const updateStatus = useSystemStore((state) => state.updateState?.status)
  const parkingName = useAccessStore((state) => state.state?.profile?.name ?? 'Parking Chía')
  const cashSession = useCashStore((state) => state.session)
  const cashLoading = useCashStore((state) => state.loading)
  const initializeCash = useCashStore((state) => state.initialize)

  useEffect(() => {
    void initialize()
    void initializeCash()
    return window.parkingAPI.onUpdateState(setUpdateState)
  }, [initialize, initializeCash, setUpdateState])

  const updateNotice =
    updateStatus === 'installing'
      ? 'Cerrando para actualizar'
      : updateStatus === 'downloaded'
        ? 'Reiniciar para actualizar'
        : updateStatus === 'downloading'
          ? 'Descargando actualización'
          : updateStatus === 'available'
            ? 'Actualización disponible'
            : null

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      <aside className="sidebar" aria-label="Navegación principal">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <CircleParking />
          </div>
          <div>
            <p className="brand-name">{parkingName}</p>
            <Badge variant="secondary">Modo local</Badge>
          </div>
        </div>

        <nav className="navigation">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              {...(end === undefined ? {} : { end })}
              className={({ isActive }) => cn('nav-link', isActive && 'nav-link-active')}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          {updateNotice ? (
            <NavLink to="/configuracion?tab=sistema" className="cash-indicator">
              <span className="status-dot" aria-hidden="true" />
              <span>{updateNotice}</span>
            </NavLink>
          ) : null}
          <NavLink to="/caja" className="cash-indicator" title="Ver la caja del turno">
            <span
              className={cn('status-dot', cashSession ? 'status-dot-open' : 'status-dot-closed')}
              aria-hidden="true"
            />
            <span>
              {cashLoading ? 'Consultando…' : cashSession ? 'Caja abierta' : 'Caja cerrada'}
            </span>
          </NavLink>
          <span className="sidebar-footer-note">
            <span className="status-dot" aria-hidden="true" />
            Los datos se guardan en este equipo
          </span>
        </div>
      </aside>

      <main id="main-content" className="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  )
}
