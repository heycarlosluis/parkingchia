import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import type { Employee, EmployeeDraft } from '@shared/contracts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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

const employeeFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, 'El nombre del empleado es obligatorio')
    .max(80, 'El nombre del empleado es demasiado largo'),
  documentNumber: z.string().trim().max(20, 'El documento es demasiado largo'),
  active: z.boolean(),
})

type EmployeeForm = z.infer<typeof employeeFormSchema>

const EMPTY_FORM: EmployeeForm = { fullName: '', documentNumber: '', active: true }

function toForm(employee: Employee | null): EmployeeForm {
  if (!employee) return EMPTY_FORM
  return {
    fullName: employee.fullName,
    documentNumber: employee.documentNumber ?? '',
    active: employee.status === 'active',
  }
}

type EmployeeDialogProps = {
  open: boolean
  employee: Employee | null
  error: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: EmployeeDraft) => Promise<boolean>
}

export function EmployeeDialog({
  open,
  employee,
  error,
  onOpenChange,
  onSubmit,
}: EmployeeDialogProps): React.JSX.Element {
  const { control, handleSubmit, register, reset, formState } = useForm<EmployeeForm>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: toForm(employee),
  })

  useEffect(() => {
    if (open) reset(toForm(employee))
  }, [open, employee, reset])

  const submit = handleSubmit(async (values) => {
    const saved = await onSubmit({
      fullName: values.fullName,
      documentNumber: values.documentNumber === '' ? null : values.documentNumber,
      status: values.active ? 'active' : 'inactive',
    })
    if (saved) onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rate-plan-dialog">
        <DialogHeader>
          <DialogTitle>{employee ? 'Editar empleado' : 'Nuevo empleado'}</DialogTitle>
          <DialogDescription>
            Quien opera un turno de caja se selecciona al abrirla; aquí se administra el personal.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} noValidate>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>No fue posible guardar el empleado</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup>
            <Field data-invalid={Boolean(formState.errors.fullName)}>
              <FieldLabel htmlFor="employee-name">Nombre completo</FieldLabel>
              <Input
                id="employee-name"
                className="min-h-11"
                autoComplete="off"
                placeholder="Laura Torres"
                aria-invalid={Boolean(formState.errors.fullName)}
                {...register('fullName')}
              />
              <FieldError errors={[formState.errors.fullName]} />
            </Field>

            <Field data-invalid={Boolean(formState.errors.documentNumber)}>
              <FieldLabel htmlFor="employee-document">Documento (opcional)</FieldLabel>
              <Input
                id="employee-document"
                className="min-h-11"
                autoComplete="off"
                placeholder="1012345678"
                aria-invalid={Boolean(formState.errors.documentNumber)}
                {...register('documentNumber')}
              />
              <FieldDescription>No puede repetirse entre empleados.</FieldDescription>
              <FieldError errors={[formState.errors.documentNumber]} />
            </Field>

            <Field orientation="horizontal">
              <Controller
                control={control}
                name="active"
                render={({ field }) => (
                  <Checkbox
                    id="employee-active"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                )}
              />
              <FieldLabel htmlFor="employee-active">
                Empleado activo, puede abrir una caja
              </FieldLabel>
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
              {employee ? 'Guardar cambios' : 'Crear empleado'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
