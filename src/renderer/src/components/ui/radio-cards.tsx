import * as React from 'react'

import { cn } from '@/lib/utils'

export type RadioCardOption = {
  value: string
  label: string
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
 */
export function RadioCards({
  options,
  value,
  onValueChange,
  name,
  className,
}: RadioCardsProps): React.JSX.Element {
  return (
    <div data-slot="radio-group" className={cn('grid grid-cols-2 gap-2 sm:grid-cols-4', className)}>
      {options.map((option) => {
        const id = `${name}-${option.value}`
        const selected = option.value === value
        return (
          <label
            key={option.value}
            htmlFor={id}
            className={cn(
              'relative flex min-h-11 cursor-pointer select-none items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
              'bg-background text-foreground',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background',
              selected
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-input hover:border-primary/60',
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
            {option.label}
          </label>
        )
      })}
    </div>
  )
}
