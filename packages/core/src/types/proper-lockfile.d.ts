declare module "proper-lockfile" {
  type LockOptions = {
    stale?: number;
    retries?: {
      retries: number;
      minTimeout: number;
      maxTimeout: number;
    };
  };

  type UnlockFn = () => Promise<void> | void;

  const lock: (path: string, options?: LockOptions) => Promise<UnlockFn>;

  export default {
    lock,
  };
}
