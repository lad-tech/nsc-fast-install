export const notNullable = <T>(value: T): value is NonNullable<T> => value != null;
