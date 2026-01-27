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

export function applyParams(value: string, params?: Record<string, string | number>): string {
  if (!params) return value;
  return value.replace(/\{([^{}]+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      return String(params[key]);
    }
    return match;
  });
}
