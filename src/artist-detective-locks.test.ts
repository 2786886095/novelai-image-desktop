import {describe,expect,it} from "vitest";
import {detectiveLockedArtists,parseDetectiveArtists} from "./artist-detective-contract";
describe("artist lock parsing",()=>{
  it("accepts manual labels and explicit fixed weight",()=>{
    expect(parseDetectiveArtists("artist:patzzi, 1.20::artist:(test_artist)::")).toEqual([
      {tag:"patzzi",weight:1},{tag:"test_artist",weight:1.2},
    ]);
    expect(parseDetectiveArtists("")).toEqual([]);
  });
  it("rejects duplicate names, invalid weights and prompt delimiters",()=>{
    expect(()=>parseDetectiveArtists("patzzi, PATZZI")).toThrow();
    expect(()=>parseDetectiveArtists("3::artist:patzzi::")).toThrow();
    expect(()=>detectiveLockedArtists([{tag:"x:1",weight:1}])).toThrow();
    expect(()=>detectiveLockedArtists([{tag:"a)",weight:1}])).toThrow();
  });
});
