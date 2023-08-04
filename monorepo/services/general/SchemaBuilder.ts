type Properties = 'properties';

export class SchemaBuilder<T extends Record<string, any> = Record<string, any>> {
  private readonly REQUIRED = 'required';
  private readonly original: T;

  constructor(private base: T, original?: T) {
    if (!original) {
      this.original = base;
    } else {
      this.original = original;
    }
  }

  public exclude<K extends keyof T>(key: K) {
    delete this.base[key];
    return this;
  }

  public in<K extends keyof T>(key: K) {
    return new SchemaBuilder(this.base[key] as T[K], this.original as T[K]);
  }

  public optional<K extends keyof T[Properties]>(key: K) {
    if (this.REQUIRED in this.base) {
      (this.base[this.REQUIRED] as any) = this.base[this.REQUIRED].filter((item: string) => item !== key);
    }
    return this;
  }

  public finish() {
    return this.original as T;
  }
}
