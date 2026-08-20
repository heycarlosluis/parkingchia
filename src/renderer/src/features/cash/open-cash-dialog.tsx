import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import type { OpenCashSessionInput } from '@shared/cash'
import { MAX_AMOUNT_COP } from '@shared/tariff'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useEmployeeStore } from '@/store/employee-store'

const openCashFormSchema = z.object({
  employeeId: z.string().min(1, 'Selecciona el empleado que abre la caja'),
  openingAmountCop: z
    .number({ error: 'Ingresa el fondo inicial' })
    .int('El fondo inicial debe ser un valor entero en pesos')
    .min(0, 'El fondo inicial no puede ser negativo')
    .max(MAX_AMOUNT_COP, 'El fondo inicial supera el máximo permitido'),
  notes: z.string().trim().max(200, 'La nota es demasiado larga'),
})

type OpenCashForm = z.infer<typeof openCashFormSchema>

const EMPTY_FORM: OpenCashForm = { employeeId: '', openingAmountCop: 0, notes: '' }

type OpenCashDialogProps = {
  open: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (input: OpenCashSessionInput) => Promise<boolean>
}

export function OpenCashDialog({
  open,
  error,
  onOpenChange,
  onSubmit,
}: OpenCashDialogProps): React.JSX.Element {
  const employees = useEmployeeStore((store) => store.employees)
  const initializeEmployees = useEmployeeStore((store) => store.initialize)

  const { control, handleSubmit, register, reset, formState } = useForm<OpenCashForm>({
    resolver: zodResolver(openCashFormSchema),
    defaultValues: EMPTY_FORM,
  })

  useEffect(() => {
    void initializeEmployees()
  }, [initializeEmployees])

  useEffect(() => {
    if (open) reset(EMPTY_FORM)
  }, [open, reset])

  const activeEmployees = employees.filter((employee) => employee.status === 'active')

  const submit = handleSubmit(async (values) => {
    const saved = await onSubmit({
      employeeId: values.employeeId,
      openingAmountCop: values.openingAmountCop,
      notes: values.notes === '' ? null : values.notes,
    })
    if (saved) onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rate-plan-dialog">
        <DialogHeader>
          <DialogTitle>Abrir caja</DialogTitle>
          <DialogDescription>
            Elige quién opera el turno y registra el dinero con el que inicia.
          </DialogDescription>
        </DialogHeader>

        {activeEmployees.length === 0 ? (
          <Alert>
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Falta crear un empleado</AlertTitle>
            <AlertDescription className="alert-with-action">
              <p>Registra al menos un empleado activo antes de abrir una caja.</p>
              <Button variant="outline" size="sm" asChild>
                <Link to="/configuracion?tab=empleados" onClick={() => onOpenChange(false)}>
                  Ir a Empleados
                </Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={(event) => void submit(event)} noValidate>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>No fue posible abrir la caja</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <FieldGroup>
              <Field data-invalid={Boolean(formState.errors.employeeId)}>
                <FieldLabel htmlFor="cash-employee">Empleado</FieldLabel>
                <Controller
                  control={control}
                  name="employeeId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="cash-employee" className="min-h-11">
                        <SelectValue placeholder="Selecciona el empleado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {activeEmployees.map((employee) => (
                            <SelectItem key={employee.id} value={employee.id}>
                              {employee.fullName}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[formState.errors.employeeId]} />
              </Field>

              <Field data-invalid={Boolean(formState.errors.openingAmountCop)}>
                <FieldLabel htmlFor="cash-opening-amount">Fondo inicial</FieldLabel>
                <Input
                  id="cash-opening-amount"
                  className="min-h-11"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1000}
                  aria-invalid={Boolean(formState.errors.openingAmountCop)}
                  {...register('openingAmountCop', { valueAsNumber: true })}
                />
                <FieldDescription>
                  Pesos colombianos enteros, sin puntos ni centavos.
                </FieldDescription>
                <FieldError errors={[formState.errors.openingAmountCop]} />
              </Field>

              <Field data-invalid={Boolean(formState.errors.notes)}>
                <FieldLabel htmlFor="cash-opening-notes">Nota (opcional)</FieldLabel>
                <Input
                  id="cash-opening-notes"
                  className="min-h-11"
                  autoComplete="off"
                  placeholder="Turno de la mañana"
                  {...register('notes')}
                />
                <FieldError errors={[formState.errors.notes]} />
              </Field>
            </FieldGroup>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={formState.isSubmitting}>
                {formState.isSubmitting ? (
                  <LoaderCircle className="animate-spin" data-icon="inline-start" />
                ) : null}
                Abrir caja
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
