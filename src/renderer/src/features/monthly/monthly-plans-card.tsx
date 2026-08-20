import { Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { RatePlan } from '@shared/contracts'
import { formatCurrency } from '@shared/format'
import { VEHICLE_TYPE_LABELS } from '@shared/tariff'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { MonthlyPlanDialog } from '@/features/monthly/monthly-plan-dialog'
import { useMonthlyStore } from '@/store/monthly-store'

export function MonthlyPlansCard(): React.JSX.Element {
  const plans = useMonthlyStore((store) => store.plans)
  const loading = useMonthlyStore((store) => store.loading)
  const error = useMonthlyStore((store) => store.error)
  const createPlan = useMonthlyStore((store) => store.createPlan)
  const updatePlan = useMonthlyStore((store) => store.updatePlan)
  const deletePlan = useMonthlyStore((store) => store.deletePlan)
  const clearFeedback = useMonthlyStore((store) => store.clearFeedback)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RatePlan | null>(null)
  const [removing, setRemoving] = useState<RatePlan | null>(null)

  const openDialog = (plan: RatePlan | null): void => {
    clearFeedback()
    setEditing(plan)
    setDialogOpen(true)
  }

  const confirmRemove = async (): Promise<void> => {
    if (!removing) return
    const removed = await deletePlan(removing.id)
    if (removed) setRemoving(null)
  }

  return (
    <>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>La operación no se completó</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="sessions-toolbar">
          <CardTitle className="title-with-icon">
            <Tags aria-hidden="true" /> {plans.length}{' '}
            {plans.length === 1 ? 'plan mensual' : 'planes mensuales'}
          </CardTitle>
          <div className="sessions-toolbar-actions">
            <Button type="button" onClick={() => openDialog(null)}>
              <Plus data-icon="inline-start" />
              Nuevo plan
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="field-hint">Consultando los planes mensuales…</p>
          ) : plans.length === 0 ? (
            <Empty className="module-empty border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Tags aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Todavía no hay planes mensuales</EmptyTitle>
                <EmptyDescription>
                  Un plan define el costo mensual que se le propone al cliente. Las tarifas por hora
                  se siguen administrando en Configuración.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <caption className="sr-only">
                  Planes mensuales disponibles con su costo y estado.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Plan</th>
                    <th scope="col">Vehículo</th>
                    <th scope="col" className="numeric">
                      Costo mensual
                    </th>
                    <th scope="col">Estado</th>
                    <th scope="col" className="actions">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.id} data-inactive={plan.status === 'inactive'}>
                      <th scope="row">{plan.name}</th>
                      <td>{VEHICLE_TYPE_LABELS[plan.vehicleType]}</td>
                      <td className="numeric tabular">{formatCurrency(plan.amountCop)}</td>
                      <td>
                        <Badge variant={plan.status === 'active' ? 'default' : 'outline'}>
                          {plan.status === 'active' ? 'Disponible' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td className="actions">
                        <div className="row-actions">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openDialog(plan)}
                          >
                            <Pencil data-icon="inline-start" />
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              clearFeedback()
                              setRemoving(plan)
                            }}
                          >
                            <Trash2 data-icon="inline-start" />
                            Eliminar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <MonthlyPlanDialog
        open={dialogOpen}
        plan={editing}
        error={error}
        onOpenChange={setDialogOpen}
        onSubmit={(draft) =>
          editing ? updatePlan({ ...draft, id: editing.id }) : createPlan(draft)
        }
      />

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el plan {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Un plan que ya se usó en una mensualidad no se puede eliminar; en ese caso desactívalo
              para dejar de ofrecerlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void confirmRemove()
              }}
            >
              Eliminar plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
