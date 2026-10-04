// Port of com.watabou.utils.Bundle / Bundlable: PD's save format, as plain JSON.
// Objects are stored with their registered class name so they can be re-instantiated on load.

export interface Bundlable {
  storeInBundle(bundle: Bundle): void;
  restoreFromBundle(bundle: Bundle): void;
}

type Ctor = new () => Bundlable;
const byName = new Map<string, Ctor>();
const byCtor = new Map<unknown, string>();

const CLASS_NAME = '__className';

/** Registers a class for saving. Every Bundlable stored in a save must be registered under a unique name. */
export function registerClass(name: string, ctor: Ctor | (abstract new () => Bundlable)): void {
  if (byName.has(name) && byName.get(name) !== ctor) throw new Error(`Duplicate bundlable class name ${name}`);
  byName.set(name, ctor as Ctor);
  byCtor.set(ctor, name);
}

export function classNameOf(obj: object): string {
  const name = byCtor.get(obj.constructor);
  if (!name) throw new Error(`Class ${obj.constructor.name} is not registered for saving`);
  return name;
}

export function isRegistered(obj: object): boolean {
  return byCtor.has(obj.constructor);
}

export function classByName(name: string): Ctor | undefined {
  return byName.get(name);
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export class Bundle {
  constructor(readonly data: Record<string, Json> = {}) {}

  contains(key: string): boolean {
    return key in this.data;
  }

  isNull(): boolean {
    return Object.keys(this.data).length === 0;
  }

  put(key: string, value: number | boolean | string | null | undefined): void;
  put(key: string, value: Bundlable | null | undefined): void;
  put(key: string, value: Iterable<Bundlable>): void;
  put(key: string, value: ArrayLike<number> | ArrayLike<boolean> | string[]): void;
  put(key: string, value: Bundle): void;
  put(key: string, value: unknown): void {
    if (value === null || value === undefined) return;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
      this.data[key] = value;
    } else if (value instanceof Bundle) {
      this.data[key] = value.data;
    } else if (ArrayBuffer.isView(value)) {
      this.data[key] = Array.from(value as unknown as ArrayLike<number>);
    } else if (Array.isArray(value) && (value.length === 0 || typeof value[0] !== 'object')) {
      this.data[key] = value as Json[];
    } else if (typeof (value as Bundlable).storeInBundle === 'function') {
      this.data[key] = Bundle.store(value as Bundlable).data;
    } else if (typeof (value as Iterable<unknown>)[Symbol.iterator] === 'function') {
      const arr: Json[] = [];
      for (const v of value as Iterable<Bundlable | null>) if (v) arr.push(Bundle.store(v).data);
      this.data[key] = arr;
    } else {
      throw new Error(`Bundle.put: unsupported value for ${key}`);
    }
  }

  getInt(key: string): number {
    const v = this.data[key];
    return typeof v === 'number' ? Math.trunc(v) : 0;
  }

  getFloat(key: string): number {
    const v = this.data[key];
    return typeof v === 'number' ? v : 0;
  }

  getBoolean(key: string): boolean {
    return this.data[key] === true;
  }

  getString(key: string): string {
    const v = this.data[key];
    return typeof v === 'string' ? v : '';
  }

  getEnum<T extends string>(key: string, fallback: T): T {
    const v = this.data[key];
    return typeof v === 'string' ? (v as T) : fallback;
  }

  getIntArray(key: string): number[] {
    const v = this.data[key];
    return Array.isArray(v) ? (v as number[]) : [];
  }

  getBooleanArray(key: string): boolean[] {
    const v = this.data[key];
    return Array.isArray(v) ? (v as boolean[]) : [];
  }

  getStringArray(key: string): string[] {
    const v = this.data[key];
    return Array.isArray(v) ? (v as string[]) : [];
  }

  getBundle(key: string): Bundle {
    const v = this.data[key];
    return new Bundle(v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Json>) : {});
  }

  /** A stored object, re-instantiated from its class name. */
  get<T extends Bundlable = Bundlable>(key: string): T | null {
    const v = this.data[key];
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    return Bundle.restore(new Bundle(v as Record<string, Json>)) as T | null;
  }

  getCollection<T extends Bundlable = Bundlable>(key: string): T[] {
    const v = this.data[key];
    if (!Array.isArray(v)) return [];
    const out: T[] = [];
    for (const e of v) {
      const obj = Bundle.restore(new Bundle(e as Record<string, Json>));
      if (obj) out.push(obj as T);
    }
    return out;
  }

  static store(obj: Bundlable): Bundle {
    const b = new Bundle();
    b.data[CLASS_NAME] = classNameOf(obj);
    obj.storeInBundle(b);
    return b;
  }

  static restore(b: Bundle): Bundlable | null {
    const name = b.data[CLASS_NAME];
    if (typeof name !== 'string') return null;
    const ctor = byName.get(name);
    if (!ctor) {
      console.warn(`Bundle: unknown class ${name}`);
      return null;
    }
    const obj = new ctor();
    obj.restoreFromBundle(b);
    return obj;
  }

  toJSON(): string {
    return JSON.stringify(this.data);
  }

  static parse(json: string): Bundle {
    return new Bundle(JSON.parse(json));
  }
}
