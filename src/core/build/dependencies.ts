/** Inputs actually consumed while rendering a page, serialized for disk cache reuse. */
export type DependencySnapshots = Record<string, string>;

export type DependencyInputs = Record<string, Record<string, unknown>>;

function snapshot(value: unknown): string {
  return JSON.stringify(value) ?? "undefined";
}

/** Records reads of named inputs without changing the values exposed to templates. */
export class DependencyTracker {
  public readonly snapshots: DependencySnapshots = Object.create(null);

  public record(namespace: string, key: string, value: unknown): void {
    const encodedKey = JSON.stringify([namespace, key]);
    if (!Object.hasOwn(this.snapshots, encodedKey)) this.snapshots[encodedKey] = snapshot(value);
  }

  public track<T extends Record<string, unknown>>(namespace: string, values: T): T {
    const recordAll = () => {
      const encodedKey = JSON.stringify([namespace]);
      if (!Object.hasOwn(this.snapshots, encodedKey)) this.snapshots[encodedKey] = snapshot(values);
    };
    const recordKey = (key: string | symbol) => {
      if (typeof key === "symbol" || (!Object.hasOwn(values, key) && Reflect.has(values, key))) {
        // Prototype operations (including coercion) may inspect the entire object.
        recordAll();
      }
      if (typeof key === "string") this.record(namespace, key, values[key]);
    };

    return new Proxy(values, {
      get(target, key, receiver) {
        recordKey(key);
        return Reflect.get(target, key, receiver);
      },
      has(target, key) {
        recordKey(key);
        return Reflect.has(target, key);
      },
      getOwnPropertyDescriptor(target, key) {
        recordKey(key);
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      ownKeys(target) {
        recordAll();
        return Reflect.ownKeys(target);
      },
    });
  }
}

/** Unknown or legacy dependency records require a fresh render. */
export function dependenciesChanged(
  dependencies: DependencySnapshots | undefined,
  inputs: DependencyInputs,
): boolean {
  if (!dependencies) return true;
  for (const [encodedKey, previous] of Object.entries(dependencies)) {
    let key: unknown;
    try {
      key = JSON.parse(encodedKey);
    } catch {
      return true;
    }
    if (
      !Array.isArray(key) ||
      (key.length !== 1 && key.length !== 2) ||
      !key.every((part) => typeof part === "string") ||
      !Object.hasOwn(inputs, key[0])
    ) {
      return true;
    }
    const values = inputs[key[0]];
    const current = key.length === 1 ? values : values[key[1]];
    if (previous !== snapshot(current)) return true;
  }
  return false;
}
