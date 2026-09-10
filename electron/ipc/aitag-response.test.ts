import { beforeEach, describe, expect, it, vi } from "vitest";
import { readAitagResponse, aitagTransportError } from "./aitag-response";
const axiosGet = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { get: axiosGet } }));
vi.mock("./proxy", () => ({ proxyConfig: () => ({}) }));
vi.mock("./aitag-cache", () => ({ cacheAitagImage: vi.fn() }));
import { clearAitagDataCache, getAitagConfig, getAitagWork, searchAitag, searchAitagFresh } from "./aitag";
const blocked = '<html><title>Attention Required! | Cloudflare</title>Sorry, you have been blocked</html>';
beforeEach(() => { clearAitagDataCache(); axiosGet.mockReset(); });
describe("AITag failure classification and recovery", () => {
  it.each(["config", "latest", "nextPage", "monthly", "historical", "detail"])("sends source context on %s requests", async (operation) => {
    axiosGet.mockImplementation(async (url:string, options:{headers:Record<string,string>}) => {
      // Simulate the live site's exact missing-source rejection, not just a
      // static source assertion: removing Referer makes every operation fail.
      if (options.headers.Referer !== "https://aitag.win/") return {status:403,data:blocked};
      return {status:200,data:url.includes('/api/work/') ? {work:{id:7},images:[]}
        : url.endsWith('/api/config') ? {available_years:[2026]}
        : {page:1,page_size:60,total:1,items:[{id:7}]}};
    });
    if (operation === "config") await expect(getAitagConfig()).resolves.toBeTruthy();
    else if (operation === "detail") await expect(getAitagWork(7)).resolves.toBeTruthy();
    else await expect(searchAitagFresh({page:operation === "nextPage" ? 2 : 1,
      sort:["monthly","historical"].includes(operation) ? "monthly" : "new",
      timeRange:operation === "historical" ? "m2026-08" : operation === "monthly" ? "current" : "all",
    })).resolves.toBeTruthy();
    expect(axiosGet).toHaveBeenCalled();
    for (const [, options] of axiosGet.mock.calls) {
      expect(options.headers).toMatchObject({Referer:"https://aitag.win/",Accept:"application/json"});
      expect(options.headers["User-Agent"]).toBe("Langbai-NovelAI-Studio/AITag-Data-Client");
    }
  });

  it("distinguishes Cloudflare 403 from network failures without exposing HTML", () => {
    expect(() => readAitagResponse(403, blocked, "config")).toThrow("AITAG_BLOCKED_403");
    expect(() => readAitagResponse(403, {error: "access_denied"}, "search")).toThrow("AITAG_HTTP_403");
  });
  it.each([401, 429, 500, 503])("preserves HTTP %s instead of blaming the network", status => {
    expect(() => readAitagResponse(status, {}, "search")).toThrow(`AITAG_HTTP_${status}`);
  });
  it("allows a real empty-search 404 but rejects HTML, detail and config 404", () => {
    expect(readAitagResponse(404, "", "search").total).toBe(0);
    expect(readAitagResponse(404, {items: [], total: 0}, "search").items).toEqual([]);
    expect(() => readAitagResponse(404, "<html>not found</html>", "search")).toThrow("AITAG_HTTP_404");
    expect(() => readAitagResponse(404, {}, "work")).toThrow("AITAG_HTTP_404");
    expect(() => readAitagResponse(404, {}, "config")).toThrow("AITAG_HTTP_404");
  });
  it.each(["<html>Verify browser</html>", [], {message:"validation required"}, {items:[],total:"bad"}])("rejects invalid 200 payload %j", data => {
    expect(() => readAitagResponse(200, data, "search")).toThrow("AITAG_INVALID_RESPONSE");
  });
  it("classifies timeout and connection failure without leaking proxy credentials", () => {
    expect(aitagTransportError({code:"ECONNABORTED"}).message).toBe("AITAG_TIMEOUT");
    expect(aitagTransportError({code:"ETIMEDOUT"}).message).toBe("AITAG_TIMEOUT");
    expect(aitagTransportError({message:"http://private:secret@proxy"}).message).toBe("AITAG_NETWORK");
  });
  it("does not retry denied requests or cache them as successful empty lists", async () => {
    axiosGet.mockResolvedValueOnce({status:403,data:blocked});
    await expect(searchAitag({page:2})).rejects.toThrow("AITAG_BLOCKED_403");
    expect(axiosGet).toHaveBeenCalledTimes(1);
    axiosGet.mockResolvedValue({status:200,data:{page:1,page_size:60,total:60,items:Array.from({length:60},(_,i)=>({id:i+1}))}});
    const retry = await searchAitag({page:2}) as {items: {id:number}[]};
    expect(retry.items[0].id).toBe(13);
    expect(axiosGet).toHaveBeenCalledTimes(2);
  });
  it("config recovers after a denied request", async () => {
    axiosGet.mockResolvedValueOnce({status:403,data:blocked}).mockResolvedValueOnce({status:200,data:{available_years:[2026]}});
    await expect(getAitagConfig()).rejects.toThrow("AITAG_BLOCKED_403");
    await expect(getAitagConfig()).resolves.toEqual({available_years:[2026]});
  });
  it("does not discard successful search data when optional configuration fails", async () => {
    axiosGet.mockImplementation(async (url:string) => url.endsWith('/api/config')
      ? {status:403,data:blocked}
      : {status:200,data:{page:1,page_size:60,total:1,items:[{id:7}]}});
    const result = await searchAitagFresh({page:1,pageSize:12}) as {total:number,items:unknown[]};
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
  });
});
