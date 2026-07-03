import { IConfigComponent } from '@well-known-components/interfaces'

/**
 * A config mock backed by a plain record. Unlike a bare jest.fn(), this resolves real
 * values so components that read many keys at boot behave like production. requireX throws
 * on a missing key (matching env-config-provider); getX returns undefined.
 */
export function createConfigMock(values: Record<string, string> = {}): IConfigComponent {
  const store = { ...values }

  const getString = async (key: string): Promise<string | undefined> => store[key]
  const getNumber = async (key: string): Promise<number | undefined> => {
    const raw = store[key]
    return raw === undefined ? undefined : Number(raw)
  }
  const requireString = async (key: string): Promise<string> => {
    const value = store[key]
    if (value === undefined) {
      throw new Error(`Missing config: ${key}`)
    }
    return value
  }
  const requireNumber = async (key: string): Promise<number> => {
    const value = store[key]
    if (value === undefined) {
      throw new Error(`Missing config: ${key}`)
    }
    return Number(value)
  }

  return { getString, getNumber, requireString, requireNumber }
}
