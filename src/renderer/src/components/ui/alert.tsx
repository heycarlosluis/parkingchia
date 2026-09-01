import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Tono del aviso. Cada uno tiene superficie, contorno, icono y color propios,
 * de modo que se distinga de un vistazo un requisito pendiente de un error.
 */
const alertVariants = cva('alert', {
  variants: {
    variant: {
      default: 'alert-default',
      warning: 'alert-warning',
      destructive: 'alert-destructive',
      success: 'alert-success',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

type AlertVariant = NonNullable<NonNullable<VariantProps<typeof alertVariants>>['variant']>

const VARIANT_ICONS: Record<AlertVariant, LucideIcon> = {
  default: Info,
  warning: TriangleAlert,
  destructive: CircleAlert,
  success: CircleCheck,
}

export type AlertProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof alertVariants> & {
    /** Icono de la izquierda. Por defecto el del tono; `null` lo oculta. */
    icon?: LucideIcon | null
  }

/**
 * Aviso de una sola fila: icono, título, descripción y acciones a la derecha.
 *
 * Un error se anuncia de inmediato (`role="alert"`); los demás tonos informan
 * sin interrumpir lo que el operador esté leyendo (`role="status"`).
 */
const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, icon, children, role, ...props }, ref) => {
    const tone: AlertVariant = variant ?? 'default'
    const Icon = icon === null ? null : (icon ?? VARIANT_ICONS[tone])
    return (
      <div
        ref={ref}
        role={role ?? (tone === 'destructive' ? 'alert' : 'status')}
        className={cn(alertVariants({ variant }), className)}
        {...props}
      >
        {Icon ? <Icon aria-hidden="true" className="alert-icon" /> : null}
        {children}
      </div>
    )
  },
)
Alert.displayName = 'Alert'

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} data-slot="alert-title" className={className} {...props} />
))
AlertTitle.displayName = 'AlertTitle'

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} data-slot="alert-description" className={className} {...props} />
))
AlertDescription.displayName = 'AlertDescription'

/**
 * Acciones del aviso. Se alinean a la derecha y centradas respecto al texto,
 * siempre en el mismo lugar sin importar cuánto ocupe la descripción.
 */
const AlertActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('alert-actions', className)} {...props} />
  ),
)
AlertActions.displayName = 'AlertActions'

export { Alert, AlertActions, AlertDescription, AlertTitle }
