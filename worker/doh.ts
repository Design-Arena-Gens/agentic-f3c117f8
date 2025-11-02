import { handleDohRequest } from "../lib/doh-service";

interface Env {
  DOH_UPSTREAMS?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cacheStorage =
      typeof caches !== "undefined"
        ? ((caches as unknown as { default: Cache })?.default ?? null)
        : null;

    return handleDohRequest(request, {
      env,
      cf: (request as any).cf ?? null,
      cache: cacheStorage
        ? {
            match: (key: string) => cacheStorage.match(key),
            put: (key: string, value: Response) => cacheStorage.put(key, value)
          }
        : null
    });
  }
};
