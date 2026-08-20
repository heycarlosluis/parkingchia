import { zodResolver } from '@hookform/resolvers/zod'
import { CircleParking, Database, LoaderCircle, ShieldCheck } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { completeOnboardingSchema, pinSchema } from '@shared/ipc'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { PinInput } from '@/features/access/pin-input'
import { useAccessStore } from '@/store/access-store'

const onboardingFormSchema = completeOnboardingSchema
  .omit({ pin: true })
  .extend({
    protectWithPin: z.boolean(),
    pin: z.string(),
    confirmPin: z.string(),
  })
  .superRefine((value, context) => {
    if (!value.protectWithPin) return
    const pinResult = pinSchema.safeParse(value.pin)
    if (!pinResult.success) {
      context.addIssue({
        code: 'custom',
        path: ['pin'],
        message: pinResult.error.issues[0]?.message ?? 'El PIN no es válido',
      })
    }
    if (value.confirmPin !== value.pin) {
      context.addIssue({ code: 'custom', path: ['confirmPin'], message: 'Los PIN no coinciden' })
    }
  })

type OnboardingForm = z.infer<typeof onboardingFormSchema>

export function OnboardingPage(): React.JSX.Element {
  const setAccessState = useAccessStore((store) => store.setAccessState)
  const { control, register, handleSubmit, setValue, setError, formState } =
    useForm<OnboardingForm>({
      resolver: zodResolver(onboardingFormSchema),
      defaultValues: {
        name: '',
        address: '',
        phone: '',
        protectWithPin: false,
        pin: '',
        confirmPin: '',
      },
    })
  const protectWithPin = useWatch({ control, name: 'protectWithPin' })

  const completeOnboarding = handleSubmit(async (values) => {
    const result = await window.parkingAPI.completeOnboarding({
      name: values.name,
      address: values.address,
      phone: values.phone,
      pin: values.protectWithPin ? values.pin : '',
    })
    if (result.ok) setAccessState(result.data)
    else setError('root', { type: 'server', message: result.error.message })
  })

  return (
    <main className="access-screen">
      <section className="onboarding-layout" aria-labelledby="onboarding-title">
        <div className="onboarding-intro">
          <div className="onboarding-brand">
            <span className="onboarding-mark" aria-hidden="true">
              <CircleParking />
            </span>
            <span>Parking Chía</span>
          </div>
          <div>
            <p className="onboarding-eyebrow">Configuración inicial</p>
            <h1 id="onboarding-title">Prepara tu parqueadero</h1>
            <p>
              Esta información identifica tus tickets y la operación local. Podrás cambiarla más
              adelante desde Configuración.
            </p>
          </div>
          <ul className="onboarding-benefits" aria-label="Características del modo local">
            <li>
              <Database aria-hidden="true" />
              <span>
                <strong>Datos en este equipo</strong>
                <small>La operación funciona sin conexión a Internet.</small>
              </span>
            </li>
            <li>
              <ShieldCheck aria-hidden="true" />
              <span>
                <strong>Protección opcional</strong>
                <small>Puedes usar un PIN local de 8 dígitos o continuar sin él.</small>
              </span>
            </li>
          </ul>
        </div>

        <Card className="onboarding-card">
          <CardHeader>
            <CardTitle>Datos del parqueadero</CardTitle>
            <p className="required-note">Todos los campos, excepto el PIN, son obligatorios.</p>
          </CardHeader>
          <form onSubmit={(event) => void completeOnboarding(event)} noValidate>
            <CardContent>
              {formState.errors.root ? (
                <Alert variant="destructive">
                  <AlertTitle>No fue posible guardar la configuración</AlertTitle>
                  <AlertDescription>{formState.errors.root.message}</AlertDescription>
                </Alert>
              ) : null}

              <FieldGroup>
                <Field data-invalid={Boolean(formState.errors.name)}>
                  <FieldLabel htmlFor="parking-name">Nombre del parqueadero</FieldLabel>
                  <Input
                    id="parking-name"
                    className="min-h-11"
                    autoComplete="organization"
                    placeholder="Parqueadero Central"
                    aria-invalid={Boolean(formState.errors.name)}
                    aria-describedby={formState.errors.name ? 'parking-name-error' : undefined}
                    autoFocus
                    {...register('name')}
                  />
                  <FieldError id="parking-name-error" errors={[formState.errors.name]} />
                </Field>

                <Field data-invalid={Boolean(formState.errors.address)}>
                  <FieldLabel htmlFor="parking-address">Dirección</FieldLabel>
                  <Input
                    id="parking-address"
                    className="min-h-11"
                    autoComplete="street-address"
                    placeholder="Carrera 10 # 12-34, Chía"
                    aria-invalid={Boolean(formState.errors.address)}
                    aria-describedby={
                      formState.errors.address ? 'parking-address-error' : undefined
                    }
                    {...register('address')}
                  />
                  <FieldError id="parking-address-error" errors={[formState.errors.address]} />
                </Field>

                <Field data-invalid={Boolean(formState.errors.phone)}>
                  <FieldLabel htmlFor="parking-phone">Teléfono</FieldLabel>
                  <Input
                    id="parking-phone"
                    className="min-h-11"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="300 123 4567"
                    aria-invalid={Boolean(formState.errors.phone)}
                    aria-describedby={formState.errors.phone ? 'parking-phone-error' : undefined}
                    {...register('phone')}
                  />
                  <FieldError id="parking-phone-error" errors={[formState.errors.phone]} />
                </Field>

                <Controller
                  name="protectWithPin"
                  control={control}
                  render={({ field }) => (
                    <Field orientation="horizontal">
                      <Checkbox
                        id="protect-with-pin"
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked === true)
                          if (checked !== true) {
                            setValue('pin', '')
                            setValue('confirmPin', '')
                          }
                        }}
                      />
                      <div>
                        <FieldLabel htmlFor="protect-with-pin">Proteger con un PIN</FieldLabel>
                        <FieldDescription>
                          Solicita 8 dígitos cada vez que se abra la aplicación.
                        </FieldDescription>
                      </div>
                    </Field>
                  )}
                />

                {protectWithPin ? (
                  <FieldGroup className="pin-fields">
                    <Controller
                      name="pin"
                      control={control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={Boolean(fieldState.error)}>
                          <FieldLabel htmlFor="onboarding-pin">PIN de 8 dígitos</FieldLabel>
                          <PinInput
                            id="onboarding-pin"
                            value={field.value}
                            onChange={field.onChange}
                            describedBy={
                              fieldState.error ? 'onboarding-pin-error' : 'onboarding-pin-hint'
                            }
                            invalid={Boolean(fieldState.error)}
                          />
                          {fieldState.error ? (
                            <FieldError id="onboarding-pin-error" errors={[fieldState.error]} />
                          ) : (
                            <FieldDescription id="onboarding-pin-hint">
                              No existe recuperación por Internet. Guarda el PIN en un lugar seguro.
                            </FieldDescription>
                          )}
                        </Field>
                      )}
                    />
                    <Controller
                      name="confirmPin"
                      control={control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={Boolean(fieldState.error)}>
                          <FieldLabel htmlFor="onboarding-pin-confirm">Confirmar PIN</FieldLabel>
                          <PinInput
                            id="onboarding-pin-confirm"
                            value={field.value}
                            onChange={field.onChange}
                            describedBy="onboarding-pin-confirm-error"
                            invalid={Boolean(fieldState.error)}
                          />
                          <FieldError
                            id="onboarding-pin-confirm-error"
                            errors={[fieldState.error]}
                          />
                        </Field>
                      )}
                    />
                  </FieldGroup>
                ) : null}
              </FieldGroup>
            </CardContent>
            <CardFooter className="onboarding-footer">
              <p>El PIN es opcional y puede configurarse después.</p>
              <Button type="submit" size="lg" disabled={formState.isSubmitting}>
                {formState.isSubmitting ? (
                  <LoaderCircle className="animate-spin" data-icon="inline-start" />
                ) : null}
                {formState.isSubmitting ? 'Guardando…' : 'Guardar y comenzar'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </section>
    </main>
  )
}
