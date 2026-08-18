import { useEffect } from 'react'
import {
  Banknote,
  BarChart3,
  CarFront,
  CircleParking,
  LayoutDashboard,
  LogIn,
  Settings,
  UsersRound,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useSystemStore } from '@/store/system-store'

const navigation = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/ingresos', label: 'Registrar ingreso', icon: LogIn },
  { to: '/parqueo-activo', label: 'Parqueo activo', icon: CarFront },
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
  const initialize = useSystemStore((state) => state.initialize)
  const setUpdateState = useSystemStore((state) => state.setUpdateState)

  useEffect(() => {
    void initialize()
    return window.parkingAPI.onUpdateState(setUpdateState)
  }, [initialize, setUpdateState])

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
            <p className="brand-name">Parking Chía</p>
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
          <span className="status-dot" aria-hidden="true" />
          Los datos se guardan en este equipo
        </div>
      </aside>

      <main id="main-content" className="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  )
}
