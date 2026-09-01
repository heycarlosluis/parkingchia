import { Check, type LucideIcon } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

export type RadioCardOption = {
  value: string
  label: string
  /** Icono opcional: ayuda a reconocer la opción sin leer la etiqueta completa. */
  icon?: LucideIcon
}

type RadioCardsProps = {
  /** Opciones mostradas como cajas de selección, en el orden en que se pasan. */
  options: readonly RadioCardOption[]
  value: string
  onValueChange: (value: string) => void
  /** Nombre del grupo: agrupa los radios para navegar con las flechas del teclado. */
  name: string
  className?: string
}

/**
 * Selección única presentada como cajas pulsables en lugar de un selector.
 *
 * Usa radios nativos para conservar la semántica y el teclado (las flechas
 * cambian de opción dentro del grupo) sin depender de un menú desplegable.
 *
 * La opción seleccionada se distingue por relleno, contorno y una marca de
 * verificación, de modo que no dependa únicamente del color.
 */
export function RadioCards({
  options,
  value,
  onValueChange,
  name,
  className,
}: RadioCardsProps): React.JSX.Element {
  return (
    <div
      data-slot="radio-group"
      className={cn(
        // auto-fit reparte el ancho entre las opciones que existan, sin huecos.
        'grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]',
        className,
      )}
    >
      {options.map((option) => {
        const id = `${name}-${option.value}`
        const selected = option.value === value
        const Icon = option.icon
        return (
          <label
            key={option.value}
            htmlFor={id}
            data-selected={selected}
            className={cn(
              'relative flex min-h-16 cursor-pointer select-none flex-col items-center justify-center gap-1.5 rounded-lg border-2 px-3 py-3 text-center text-sm font-medium transition-colors',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background',
              selected
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border-input bg-background text-foreground hover:border-primary/70 hover:bg-accent',
            )}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onValueChange(option.value)}
              className="sr-only"
            />
            {selected ? (
              <Check aria-hidden="true" className="absolute right-1.5 top-1.5 size-3.5" />
            ) : null}
            {Icon ? <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} /> : null}
            <span className="leading-tight">{option.label}</span>
          </label>
        )
      })}
    </div>
  )
}
