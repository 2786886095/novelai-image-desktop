import {describe,expect,it} from "vitest";
import {detectiveLockedArtists,parseDetectiveArtists} from "./artist-detective-contract";
describe("artist lock parsing",()=>{
  it("accepts manual labels and explicit fixed weight",()=>{
    expect(parseDetectiveArtists("artist:patzzi, 1.20::artist:(test_artist)::")).toEqual([
      {tag:"patzzi",weight:1},{tag:"test_artist",weight:1.2},
    ]);
    expect(parseDetectiveArtists("")).toEqual([]);
  });
  it("attaches a per-artist range and leaves blank ranges legacy-compatible",()=>{
    const ranges={patzzi:{min:".65",max:".86"},test_artist:{min:" ",max:""},irrelevant:{min:"",max:"9"}};
    expect(parseDetectiveArtists("artist:patzzi, 1.25::artist:test_artist::",ranges)).toEqual([
      {tag:"patzzi",weight:1,weightRange:{min:.65,max:.86}},{tag:"test_artist",weight:1.25},
    ]);
    expect(detectiveLockedArtists([{tag:"p",weight:1.2,weightRange:{min:.25,max:2.4}}])[0].weightRange).toEqual({min:.25,max:2.4});
  });
  it("rejects missing, inverted, equal, non-numeric or overprecise ranges",()=>{
    for(const range of [{min:"",max:"1.2"},{min:"1.2",max:"1"},{min:".99",max:".99"},
      {min:"foo",max:"1"},{min:".251",max:"1"},{min:".24",max:"1"},{min:"1",max:"2.41"}]){
      expect(()=>parseDetectiveArtists("p",{p:range})).toThrow(/权重/);
    }
    expect(()=>detectiveLockedArtists([{tag:"p",weight:1,weightRange:{min:"1",max:2}}])).toThrow();
  });
  it("rejects duplicate names, invalid weights and prompt delimiters",()=>{
    expect(()=>parseDetectiveArtists("patzzi, PATZZI")).toThrow();
    expect(()=>parseDetectiveArtists("3::artist:patzzi::")).toThrow();
    expect(()=>detectiveLockedArtists([{tag:"x:1",weight:1}])).toThrow();
    expect(()=>detectiveLockedArtists([{tag:"a)",weight:1}])).toThrow();
  });
});
