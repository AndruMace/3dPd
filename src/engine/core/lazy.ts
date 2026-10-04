// Late binding to classes in higher engine layers (mobs, hero) from lower ones (items, buffs, blobs), avoiding
// import cycles that would break class inheritance at load time. Classes are looked up by their save name.
import { classByName } from './Bundle';

const services = new Map<string, unknown>();

/** Registers a non-class module object (e.g. Generator) for late binding. */
export function registerService(name: string, obj: unknown): void {
  services.set(name, obj);
}

export function lazy<T>(name: string): T {
  const found = classByName(name) ?? services.get(name);
  if (!found) throw new Error(`lazy: ${name} is not registered`);
  return found as unknown as T;
}

/** `obj instanceof <registered class>` without type narrowing (the classes are only known by name here). */
export function isA(obj: unknown, name: string): boolean {
  return (
    obj !== null && typeof obj === 'object' && obj instanceof lazy<abstract new (...args: never[]) => unknown>(name)
  );
}
