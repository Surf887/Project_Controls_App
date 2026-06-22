/** Express route params may be string | string[] — normalize to a single string. */
export function param(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? ''
  }
  return value ?? ''
}
