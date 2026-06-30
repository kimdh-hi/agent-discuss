import {
  RequestContext,
  TransactionPropagation,
  type EntityManager,
  type TransactionOptions,
} from '@mikro-orm/core';

type ContextResolver<T> = (self: T) => unknown;

interface TransactionalDecoratorOptions<T> extends TransactionOptions {
  context?: ContextResolver<T>;
}

export function CreateRequestContext<T extends object>(
  context?: ContextResolver<T>,
): MethodDecorator {
  return (_target, _propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...args: unknown[]) => unknown;
    descriptor.value = function (this: T, ...args: unknown[]) {
      const em = resolveEntityManager(this, context);
      if (!em) return original.apply(this, args);

      if (RequestContext.getEntityManager(em.name)) {
        return original.apply(this, args);
      }

      return RequestContext.create(em, () => original.apply(this, args));
    };
  };
}

export function Transactional<T extends object>(
  options: TransactionalDecoratorOptions<T> = {},
): MethodDecorator {
  return (_target, _propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...args: unknown[]) => unknown;
    const { context, ...transactionOptions } = options;

    descriptor.value = function (this: T, ...args: unknown[]) {
      const em = resolveEntityManager(this, context);
      if (!em) return original.apply(this, args);

      return em.transactional(() => original.apply(this, args), {
        propagation: TransactionPropagation.REQUIRED,
        ...transactionOptions,
      });
    };
  };
}

function resolveEntityManager<T extends object>(
  self: T,
  context?: ContextResolver<T>,
): EntityManager | undefined {
  const explicit = toEntityManager(context?.(self));
  if (explicit) return explicit;

  for (const value of Object.values(self)) {
    const em = toEntityManager(value);
    if (em) return em;
  }

  return undefined;
}

function toEntityManager(source: unknown): EntityManager | undefined {
  if (!source) return undefined;
  if (isEntityManager(source)) return source;

  const em = (source as { em?: EntityManager }).em;
  if (isEntityManager(em)) return em;

  const getEntityManager = (source as { getEntityManager?: () => unknown }).getEntityManager;
  if (typeof getEntityManager !== 'function') return undefined;

  const repoEm = getEntityManager.call(source);
  return isEntityManager(repoEm) ? repoEm : undefined;
}

function isEntityManager(value: unknown): value is EntityManager {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as EntityManager).fork === 'function' &&
    typeof (value as EntityManager).transactional === 'function'
  );
}
