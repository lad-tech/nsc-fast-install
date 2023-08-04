export type Maybe<T> = T | undefined;
export type Newable<C extends new (...args: any) => any> = new (...args: ConstructorParameters<C>) => InstanceType<C>;
