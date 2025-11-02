import { DOH_HEADERS, handleDohRequest } from "../../lib/doh-service";

export const runtime = "edge";

const TTL_MS = 60_000;

type CacheRecord = {
  status: number;
  headers: [string, string][];
  body: ArrayBuffer;
  expires: number;
};

const memoryCache = new Map<string, CacheRecord>();

const cacheAdapter = {
  async match(key: string): Promise<Response | null> {
    const record = memoryCache.get(key);
    if (!record) {
      return null;
    }

    if (record.expires < Date.now()) {
      memoryCache.delete(key);
      return null;
    }

    const headers = new Headers(record.headers);
    return new Response(record.body.slice(0), {
      status: record.status,
      headers
    });
  },
  async put(key: string, value: Response): Promise<void> {
    const clone = value.clone();
    const buffer = await clone.arrayBuffer();
    const headersEntries: [string, string][] = [];
    clone.headers.forEach((val, header) => {
      headersEntries.push([header, val]);
    });
    memoryCache.set(key, {
      status: clone.status,
      headers: headersEntries,
      body: buffer,
      expires: Date.now() + TTL_MS
    });
  }
};

function resolveEnv(): { DOH_UPSTREAMS?: string } {
  return {
    DOH_UPSTREAMS: process.env.DOH_UPSTREAMS
  };
}

async function handler(request: Request): Promise<Response> {
  return handleDohRequest(request, {
    env: resolveEnv(),
    cf: (request as any).cf ?? null,
    cache: cacheAdapter
  });
}

export async function GET(request: Request): Promise<Response> {
  return handler(request);
}

export async function POST(request: Request): Promise<Response> {
  return handler(request);
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: DOH_HEADERS
  });
}
