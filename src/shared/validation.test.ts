import { describe, expect, it } from 'vitest'
import { isValidPlate, plateSchema } from './validation'

describe('validación de matrícula', () => {
  it('normaliza espacios, guiones y minúsculas', () => {
    expect(plateSchema.parse('abc-123')).toBe('ABC123')
  })

  it('rechaza símbolos y longitudes inválidas', () => {
    expect(isValidPlate('A!')).toBe(false)
    expect(isValidPlate('ABC 123')).toBe(true)
  })
})
