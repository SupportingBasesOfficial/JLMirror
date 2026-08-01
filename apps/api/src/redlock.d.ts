// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
declare module "redlock" {
  interface Lock {
    release(): Promise<void>;
    attempt: number;
    expiration: number;
  }
  interface RedlockOptions {
    driftFactor?: number;
    retryCount?: number;
    retryDelay?: number;
    retryJitter?: number;
    automaticExtensionThreshold?: number;
  }
  export default class Redlock {
    constructor(
      clients: unknown[],
      options?: RedlockOptions,
    );
    acquire(resources: string[], duration: number): Promise<Lock>;
    release(): Promise<void>;
    using<T>(resources: string[], duration: number, routine: (lock: Lock) => Promise<T>): Promise<T>;
  }
}
