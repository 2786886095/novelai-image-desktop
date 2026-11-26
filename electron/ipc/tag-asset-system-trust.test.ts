import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import axios from "axios";
import { expect, it, vi } from "vitest";
import { tagAssetTransport } from "./tag-asset-download";
vi.mock("./store", () => ({getSettings: () => ({})}));
vi.mock("node:tls", async (original) => ({
  ...await original<typeof import("node:tls")>(),
  getCACertificates: (source: string) => source === "system"
    ? [readFileSync("shared/issue-network-fixtures/public-test-ca.pem","utf8")] : [],
}));
it("accepts a system-only issuer without disabling TLS or hostname checks", async () => {
  const dir="shared/issue-network-fixtures/public-test-";
  const server=createServer({key:readFileSync(dir+"key.pem"),cert:readFileSync(dir+"cert.pem")},(_,res)=>res.end("tag data"));
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  try {
    const address=server.address(); if (!address || typeof address==="string") throw Error("Missing port");
    const url="https://127.0.0.1:"+address.port;
    const options={proxy:false as const,maxRedirects:0};
    await expect(axios.get(url,options)).rejects.toThrow(/certifi|issuer/i);
    expect((await axios.get(url,{...options,transport:tagAssetTransport})).data).toBe("tag data");
    await expect(axios.get(url,{...options,headers:{Host:"unrelated.invalid"},transport:tagAssetTransport})).rejects.toThrow(/altname|hostname/i);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
