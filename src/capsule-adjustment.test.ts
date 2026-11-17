import {describe, expect, it} from "vitest";
import {capsuleTagUnits, capsuleWheelDirection, changeCapsuleWeight, removeCapsuleTag} from "./compact-prompt";

describe("tag capsule weights", () => {
  it("splits explicit weighted runs and leaves surrounding formatting intact", () => {
    const prompt = 'solo,  1.2::blue sky, clouds::,  best quality';
    expect(capsuleTagUnits(prompt).map(x=>[x.core,x.weight])).toEqual([
      ['solo',1],['blue sky',1.2],['clouds',1.2],['best quality',1],
    ]);
    expect(changeCapsuleWeight(prompt,2,1)).toBe('solo,  1.2::blue sky::, 1.3::clouds::,  best quality');
    expect(removeCapsuleTag(prompt,1)).toBe('solo,  1.2::clouds::,  best quality');
  });
  it("supports signed values and doesn't corrupt the guard around free-form text", () => {
    const prompt = '-0.1::blue eyes::, "hello, sky", [smile], {blue eyes, collarbone}';
    expect(capsuleTagUnits(prompt).map(x=>x.core)).toEqual(['blue eyes','"hello, sky"','smile','{blue eyes, collarbone}']);
    expect(changeCapsuleWeight(prompt,0,1)).toBe('0::blue eyes::, "hello, sky", [smile], {blue eyes, collarbone}');
    expect(changeCapsuleWeight(prompt,3,1)).toBe(prompt);
  });
  it("never treats a dangling closing token as an opening weight scope", () => {
    const prompt = 'blue sky::, 1.0::clouds, solo::, rain';
    expect(capsuleTagUnits(prompt).map(x=>x.core)).toEqual(['blue sky::','clouds','solo','rain']);
    expect(changeCapsuleWeight(prompt,0,1)).toBe(prompt);
    expect(changeCapsuleWeight('  solo, rain',0,1)).toBe('  1.1::solo::, rain');
  });
  it("does not rewrite neutral, malformed or out-of-range weights on a no-op", () => {
    expect(changeCapsuleWeight('1.2::a, b', 0, 1)).toBe('1.2::a, b');
    expect(changeCapsuleWeight('5::a::', 0, 1)).toBe('5::a::');
    expect(changeCapsuleWeight('6::a::', 0, 1)).toBe('6::a::');
    expect(changeCapsuleWeight('6::a::', 0, -1)).toBe('5.9::a::');
    expect(changeCapsuleWeight('solo', 0, -1)).toBe('0.9::solo::');
  });
});

it("accepts fine-grained vertical wheel steps and ignores zoom and horizontal scroll",()=>{
 const plain = {deltaX:0,deltaY:-5,ctrlKey:false,metaKey:false,shiftKey:false};
 expect(capsuleWheelDirection(plain)).toBe(1);
 expect(capsuleWheelDirection({...plain,deltaY:0.5})).toBe(-1);
 for(const altered of [{deltaX:50},{ctrlKey:true},{metaKey:true},{shiftKey:true},{deltaY:0},{deltaY:NaN}]){
  expect(capsuleWheelDirection({...plain,...altered})).toBe(0);
 }
});
