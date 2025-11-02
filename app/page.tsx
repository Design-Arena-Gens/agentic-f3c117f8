"use client";

import { FormEvent, useMemo, useState } from "react";

type Method = "GET" | "POST";

const RECORD_TYPES = [
  "A",
  "AAAA",
  "NS",
  "CNAME",
  "MX",
  "TXT",
  "PTR",
  "SOA"
] as const;

const methodOptions: Method[] = ["GET", "POST"];

function encodeDnsQuery(domain: string, type: string): Uint8Array {
  const labels = domain.trim().split(".").filter(Boolean);
  const buffer = new ArrayBuffer(512);
  const view = new DataView(buffer);
  let offset = 0;

  // transaction ID
  view.setUint16(offset, Math.floor(Math.random() * 65535));
  offset += 2;

  // flags: standard query with recursion desired
  view.setUint16(offset, 0x0100);
  offset += 2;

  // QDCOUNT
  view.setUint16(offset, 1);
  offset += 2;
  // ANCOUNT, NSCOUNT, ARCOUNT
  view.setUint16(offset, 0);
  offset += 2;
  view.setUint16(offset, 0);
  offset += 2;
  view.setUint16(offset, 0);
  offset += 2;

  for (const label of labels) {
    const length = label.length;
    view.setUint8(offset, length);
    offset += 1;
    for (let i = 0; i < length; i += 1) {
      view.setUint8(offset + i, label.charCodeAt(i));
    }
    offset += length;
  }

  view.setUint8(offset, 0);
  offset += 1;

  const typeMap: Record<string, number> = {
    A: 1,
    NS: 2,
    CNAME: 5,
    SOA: 6,
    PTR: 12,
    MX: 15,
    TXT: 16,
    AAAA: 28
  };

  view.setUint16(offset, typeMap[type] ?? 1);
  offset += 2;

  // QCLASS = IN
  view.setUint16(offset, 1);
  offset += 2;

  return new Uint8Array(buffer.slice(0, offset));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default function Page() {
  const [domain, setDomain] = useState("example.com");
  const [recordType, setRecordType] = useState<(typeof RECORD_TYPES)[number]>("A");
  const [method, setMethod] = useState<Method>("GET");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hexDump, setHexDump] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return domain.trim().length > 0 && /^[a-z0-9.-]+$/i.test(domain.trim());
  }, [domain]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || loading) return;

    setLoading(true);
    setError(null);
    setHexDump(null);

    try {
      const queryBytes = encodeDnsQuery(domain, recordType);
      const url = new URL("/dns-query", window.location.origin);
      let response: Response;

      if (method === "GET") {
        url.searchParams.set("dns", base64UrlEncode(queryBytes));
        response = await fetch(url.toString(), {
          cache: "no-store",
          headers: {
            accept: "application/dns-message"
          }
        });
      } else {
        response = await fetch(url.toString(), {
          method: "POST",
          headers: {
            "content-type": "application/dns-message",
            accept: "application/dns-message"
          },
          body: queryBytes
        });
      }

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const dump = Array.from(bytes)
        .map((byte, idx) => {
          const hex = byte.toString(16).padStart(2, "0");
          const separator = idx % 2 === 1 ? " " : "";
          return hex + separator;
        })
        .join("")
        .trim();
      setHexDump(dump);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <div className="badge">Edge Powered DoH Gateway</div>
      <div className="card">
        <h1>
          智能 <span className="accent">DoH</span> 代理
        </h1>
        <p>
          使用 Cloudflare Workers 兼容的策略，自动挑选最快的上游解析服务，
          支持浏览器直接访问 <code>/dns-query</code> 进行 RFC&nbsp;8484 查询。
        </p>
        <form onSubmit={handleSubmit} className="grid">
          <label>
            <div>域名</div>
            <input
              value={domain}
              onChange={(event) => setDomain(event.currentTarget.value)}
              placeholder="example.com"
              required
              pattern="[a-zA-Z0-9.-]+"
              className="input"
            />
          </label>
          <label>
            <div>记录类型</div>
            <select
              value={recordType}
              onChange={(event) =>
                setRecordType(event.currentTarget.value as (typeof RECORD_TYPES)[number])
              }
              className="input"
            >
              {RECORD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            <div>请求方式</div>
            <select
              value={method}
              onChange={(event) => setMethod(event.currentTarget.value as Method)}
              className="input"
            >
              {methodOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="submit"
          >
            {loading ? "查询中..." : "开始解析"}
          </button>
        </form>
        {error && <p className="error">请求失败：{error}</p>}
        {hexDump && (
          <div>
            <div className="accent">响应十六进制内容</div>
            <pre className="code-block">{hexDump}</pre>
          </div>
        )}
        <section>
          <h2>特性</h2>
          <ul className="list">
            <li>上游智能排序：基于用户 IP 推断的经纬度优先选择最近节点</li>
            <li>竞速算法：实时并发探测多个 DoH 上游，优先返回最快响应</li>
            <li>缓存支持：智能缓存响应，加速重复请求</li>
            <li>浏览器友好：直接兼容主流浏览器的 DoH 配置</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
