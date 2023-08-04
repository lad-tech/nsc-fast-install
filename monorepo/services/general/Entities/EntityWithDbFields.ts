export type Uuid = string;

export type EntityWithDbFields<T> = T & {
  uuid: Uuid;
  created: Date;
  updated: Date;
} & { [key: string]: unknown };
