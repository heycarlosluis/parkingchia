import { describe, expect, it } from 'vitest'
import { isValidPlate, plateSchema, sanitizePlateInput } from './validation'

describe('validación de matrícula', () => {
  it('normaliza espacios, guiones y minúsculas', () => {
    expect(plateSchema.parse('abc-123')).toBe('ABC123')
  })

  it('rechaza símbolos y longitudes inválidas', () => {
    expect(isValidPlate('A!')).toBe(false)
    expect(isValidPlate('ABC 123')).toBe(true)
  })
})

describe('saneado de la matrícula mientras se escribe', () => {
  it('descarta cualquier carácter que no sea letra o dígito', () => {
    expect(sanitizePlateInput('abc-123')).toBe('ABC123')
    expect(sanitizePlateInput('a@b c!1')).toBe('ABC1')
    expect(sanitizePlateInput('...')).toBe('')
  })

  it('reduce tildes y eñe a su letra base en lugar de borrarlas', () => {
    expect(sanitizePlateInput('ábñ1')).toBe('ABN1')
  })

  it('corta en el largo máximo que acepta el esquema', () => {
    expect(sanitizePlateInput('ABCDEFGHIJ')).toBe('ABCDEFGH')
  })

  it('nunca produce un valor que el esquema tenga que rechazar por formato', () => {
    for (const raw of ['abc-123', 'a@b c!1', 'ábñ1', 'ABCDEFGHIJ']) {
      const sanitized = sanitizePlateInput(raw)
      if (sanitized.length >= 3) expect(isValidPlate(sanitized)).toBe(true)
    }
  })
})
