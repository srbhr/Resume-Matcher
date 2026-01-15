export function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split('.');
  let result: unknown = obj;

  for (const key of keys) {
    if (result && typeof result === 'object' && key in result) {
      result = (result as Record<string, unknown>)[key];
    } else {
      return path;
    }
  }

  return typeof result === 'string' ? result : path;
}

export function applyParams(
  value: string,
  params?: Record<string, string | number>
): string {
  if (!params) return value;
  return Object.entries(params).reduce(
    (current, [paramKey, paramValue]) =>
      current.split(`{${paramKey}}`).join(String(paramValue)),
    value
  );
}
