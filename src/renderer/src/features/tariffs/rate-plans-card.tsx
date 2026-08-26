import { Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { RatePlan, RatePlanDraft } from '@shared/contracts'
import { formatCurrency } from '@shared/format'
import { describeBillingUnit, VEHICLE_TYPE_LABELS, type TariffBillingUnit } from '@shared/tariff'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { RatePlanDialog } from '@/features/tariffs/rate-plan-dialog'
import { useTariffStore } from '@/store/tariff-store'

export function RatePlansCard(): React.JSX.Element {
  const settings = useTariffStore((store) => store.settings)
  const plans = useTariffStore((store) => store.plans)
  const error = useTariffStore((store) => store.error)
  const createPlan = useTariffStore((store) => store.createPlan)
  const updatePlan = useTariffStore((store) => store.updatePlan)
  const deletePlan = useTariffStore((store) => store.deletePlan)

  const [editing, setEditing] = useState<RatePlan | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [planToDelete, setPlanToDelete] = useState<RatePlan | null>(null)

  const openCreate = (): void => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (plan: RatePlan): void => {
    setEditing(plan)
    setDialogOpen(true)
  }

  const submitPlan = async (draft: RatePlanDraft): Promise<boolean> =>
    editing ? updatePlan({ ...draft, id: editing.id }) : createPlan(draft)

  const confirmDelete = async (): Promise<void> => {
    if (!planToDelete) return
    const removed = await deletePlan(planToDelete.id)
    if (removed) setPlanToDelete(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="title-with-icon">
          <Tags aria-hidden="true" /> Tarifas por tipo de vehículo
        </CardTitle>
        <CardDescription>
          Cada tarifa define el precio de una {describeBillingUnit(settings.billingUnit)} de
          parqueo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {plans.length === 0 ? (
          <Empty className="module-empty border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Tags aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Todavía no hay tarifas</EmptyTitle>
              <EmptyDescription>
                Crea al menos una tarifa por tipo de vehículo para poder liquidar salidas.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <caption className="sr-only">
                Tarifas configuradas por tipo de vehículo, con precio, mínimo, tope y gracia.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Vehículo</th>
                  <th scope="col" className="numeric">
                    Precio por {describeBillingUnit(settings.billingUnit)}
                  </th>
                  <th scope="col" className="numeric">
                    Cobro mínimo
                  </th>
                  <th scope="col" className="numeric">
                    Plena
                  </th>
                  <th scope="col" className="numeric">
                    Gracia
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
                    <td className="numeric tabular">
                      {plan.minimumChargeCop === 0 ? '—' : formatCurrency(plan.minimumChargeCop)}
                    </td>
                    <td className="numeric tabular">
                      {plan.plenaCop === null ? (
                        '—'
                      ) : (
                        <>
                          {formatCurrency(plan.plenaCop)}
                          {settings.billingUnit === 'hour' ? null : (
                            <span className="grace-scope">No aplica por minuto</span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="numeric tabular">
                      {plan.graceMinutes === null ? (
                        <>
                          {settings.graceMinutes} min
                          <span className="grace-scope">General</span>
                        </>
                      ) : (
                        `${plan.graceMinutes} min`
                      )}
                    </td>
                    <td>
                      <Badge variant={plan.status === 'active' ? 'secondary' : 'outline'}>
                        {plan.status === 'active' ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </td>
                    <td className="actions">
                      <div className="row-actions">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(plan)}
                        >
                          <Pencil data-icon="inline-start" />
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setPlanToDelete(plan)}
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
      <CardFooter>
        <Button type="button" onClick={openCreate}>
          <Plus data-icon="inline-start" />
          Agregar tarifa
        </Button>
      </CardFooter>

      <RatePlanDialog
        open={dialogOpen}
        plan={editing}
        billingUnit={settings.billingUnit satisfies TariffBillingUnit}
        graceMinutes={settings.graceMinutes}
        plenaThresholdHours={settings.plenaThresholdHours}
        error={dialogOpen ? error : null}
        onOpenChange={setDialogOpen}
        onSubmit={submitPlan}
      />

      <AlertDialog
        open={planToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPlanToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar «{planToDelete?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Si la tarifa ya se usó en una sesión o mensualidad,
              desactívala en lugar de eliminarla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void confirmDelete()
              }}
            >
              Eliminar tarifa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
