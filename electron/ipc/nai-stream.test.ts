import { encode } from "@msgpack/msgpack";
import { describe, expect, it } from "vitest";
import {
  NaiSseFrameDecoder,
  NaiStreamFrameDecoder,
  frameNaiStreamMessage,
} from "./nai-stream";

describe("NaiStreamFrameDecoder", () => {
  it("decodes a frame split across arbitrary network chunks", () => {
    const image = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    const framed = frameNaiStreamMessage(encode({
      event_type: "intermediate",
      samp_ix: 1,
      step_ix: 7,
      image,
    }));
    const decoder = new NaiStreamFrameDecoder();
    expect(decoder.push(framed.subarray(0, 3))).toEqual([]);
    expect(decoder.push(framed.subarray(3, 9))).toEqual([]);
    const frames = decoder.push(framed.subarray(9));
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      eventType: "intermediate",
      sampleIndex: 1,
      stepIndex: 7,
    });
    expect(frames[0].image).toEqual(Buffer.from(image));
    expect(decoder.remainingBytes()).toHaveLength(0);
  });

  it("decodes multiple frames and surfaces stream errors", () => {
    const finalFrame = frameNaiStreamMessage(encode({
      event_type: "final",
      samp_ix: 0,
      image: Uint8Array.from([1, 2, 3]),
    }));
    const errorFrame = frameNaiStreamMessage(encode({
      event_type: "error",
      message: "streaming is not allowed",
    }));
    const decoder = new NaiStreamFrameDecoder();
    const frames = decoder.push(Buffer.concat([finalFrame, errorFrame]));
    expect(frames[0].eventType).toBe("final");
    expect(frames[0].image).toEqual(Buffer.from([1, 2, 3]));
    expect(frames[1].error).toBe("streaming is not allowed");
  });
});

describe("NaiSseFrameDecoder", () => {
  it("decodes JSON SSE records split across arbitrary chunks", () => {
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
    const body = Buffer.from(
      `event: intermediate\r\ndata: {"samp_ix":1,"step_ix":4,"image":"${image}"}\r\n\r\n`
      + `event: final\ndata: {"samp_ix":1,"image":"${image}"}\n\n`,
    );
    const decoder = new NaiSseFrameDecoder();
    expect(decoder.push(body.subarray(0, 7))).toEqual([]);
    expect(decoder.push(body.subarray(7, 31))).toEqual([]);
    const frames = decoder.push(body.subarray(31));
    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({
      eventType: "intermediate",
      sampleIndex: 1,
      stepIndex: 4,
    });
    expect(frames[0].image).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(frames[1].eventType).toBe("final");
  });

  it("decodes base64 MessagePack SSE data and flushes a final unterminated event", () => {
    const packed = Buffer.from(encode({
      event_type: "final",
      samp_ix: 0,
      image: Uint8Array.from([9, 8, 7]),
    })).toString("base64");
    const decoder = new NaiSseFrameDecoder();
    expect(decoder.push(Buffer.from(`event: final\ndata: ${packed}`))).toEqual([]);
    const frames = decoder.finish();
    expect(frames).toHaveLength(1);
    expect(frames[0].eventType).toBe("final");
    expect(frames[0].image).toEqual(Buffer.from([9, 8, 7]));
  });

  it("surfaces plain-text SSE errors", () => {
    const decoder = new NaiSseFrameDecoder();
    const frames = decoder.push(Buffer.from("event: error\ndata: quota exceeded\n\n"));
    expect(frames[0].error).toBe("quota exceeded");
  });
});
