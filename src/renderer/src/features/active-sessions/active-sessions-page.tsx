import { CarFront } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { PageHeading } from '@/components/page-heading'
import { useSystemStore } from '@/store/system-store'

export function ActiveSessionsPage(): React.JSX.Element {
  const activeSessions = useSystemStore((state) => state.status?.activeSessions ?? 0)
  return (
    <div className="page-stack">
      <PageHeading
        title="Parqueo activo"
        description="Sesiones abiertas que todavía no tienen una salida registrada."
        action={<Badge variant="secondary">{activeSessions} activos</Badge>}
      />
      <Empty className="module-empty border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CarFront aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>
            {activeSessions === 0 ? 'No hay vehículos activos' : 'Listado en preparación'}
          </EmptyTitle>
          <EmptyDescription>
            {activeSessions === 0
              ? 'Los vehículos aparecerán aquí después de registrar su ingreso.'
              : 'La base de datos contiene sesiones activas. La tabla operativa se incorporará en el siguiente módulo.'}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}
