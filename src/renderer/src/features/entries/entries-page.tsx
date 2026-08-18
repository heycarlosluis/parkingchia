import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { PageHeading } from '@/components/page-heading'
import { plateSchema } from '@shared/validation'

const entrySchema = z.object({ plate: plateSchema })
type EntryForm = z.input<typeof entrySchema>

export function EntriesPage(): React.JSX.Element {
  const [validatedPlate, setValidatedPlate] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<EntryForm>({
    resolver: zodResolver(entrySchema),
    defaultValues: { plate: '' },
  })

  return (
    <div className="page-stack narrow-page">
      <PageHeading
        title="Registrar ingreso"
        description="Valida la matrícula antes de crear una sesión de parqueo."
      />
      <Card>
        <CardHeader>
          <CardTitle>Datos del vehículo</CardTitle>
          <CardDescription>La matrícula se normaliza en mayúsculas y sin espacios.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="form-stack"
            onSubmit={handleSubmit((data) => setValidatedPlate(plateSchema.parse(data.plate)))}
            noValidate
          >
            <div className="field-stack" data-invalid={Boolean(formState.errors.plate)}>
              <Label htmlFor="plate">Matrícula</Label>
              <input
                id="plate"
                className="plate-input"
                autoComplete="off"
                placeholder="ABC123"
                aria-invalid={Boolean(formState.errors.plate)}
                aria-describedby={formState.errors.plate ? 'plate-error' : 'plate-hint'}
                {...register('plate')}
              />
              {formState.errors.plate ? (
                <p id="plate-error" className="field-error">
                  {formState.errors.plate.message}
                </p>
              ) : (
                <p id="plate-hint" className="field-hint">
                  Usa entre 3 y 8 letras o números.
                </p>
              )}
            </div>
            <Button type="submit">Validar matrícula</Button>
          </form>
          <div className="stable-status" role="status" aria-live="polite">
            {validatedPlate ? (
              <>
                <CheckCircle2 aria-hidden="true" />
                <span>
                  <strong>{validatedPlate}</strong> está lista. La creación definitiva de ingresos
                  se implementará en el siguiente módulo.
                </span>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
