export function isString(value: any): value is string {
  return typeof(value) === 'string';
}

export function isNumber(value: any): value is number {
  return typeof(value) === 'number';
}

export function isObject(value: any): value is Record<string, any> {
  return typeof(value) === 'object' && value !== null;
}

export function isTypeOf<T = any>(value: any, ...keys: (keyof T)[]): value is T {
  for (const key of keys)
    if (!(key in value))
      return false;
  return true;
}

export function assert(condition: boolean, errMsg: string = 'Assert failed'): asserts condition {
  if (!condition) {
    console.trace(errMsg);
    throw new Error(errMsg);
  }
}

export function assertTypeOf<T = any>(value: any, ...keys: (keyof T)[]): asserts value is T {
  return assert(isTypeOf<T>(value, ...keys));
}