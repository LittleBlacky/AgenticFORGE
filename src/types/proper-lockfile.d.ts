declare module "proper-lockfile" {
  type LockOptions = {
    stale?: number;
    retries?:
      | number
      | {
          retries?: number;
          minTimeout?: number;
          maxTimeout?: number;
        };
  };

  type ReleaseFn = () => Promise<void>;

  const lock: (path: string, options?: LockOptions) => Promise<ReleaseFn>;

  export default {
    lock,
  };
}
