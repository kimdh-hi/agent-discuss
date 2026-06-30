import { Type } from '@mikro-orm/core';

export class VectorType extends Type<number[] | null, string | null> {
  constructor(private readonly dim = 1536) {
    super();
  }

  override convertToDatabaseValue(value: number[] | null): string | null {
    if (value == null) return null;
    return `[${value.join(',')}]`;
  }

  override convertToJSValue(value: string | number[] | null): number[] | null {
    if (value == null) return null;
    if (Array.isArray(value)) return value;
    return value
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .split(',')
      .filter((s) => s.length > 0)
      .map(Number);
  }

  override getColumnType(): string {
    return `vector(${this.dim})`;
  }
}
