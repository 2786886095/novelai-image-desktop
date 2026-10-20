import { describe,it,expect } from "vitest";
import { guessFamily,VERIFIED_TEMPLATES,verifiedTemplate } from "./families";
import { corePrompt } from "./core.test-fixtures";
describe("family labels are evidence not compatibility",()=>{
  it("recognizes independent encoder/file evidence for three families",()=>{
    const moss=corePrompt();moss["2"].inputs.type="moss_image";moss["1"].inputs.unet_name="moss_image_sft_int8.safetensors";
    expect(guessFamily(moss)).toMatchObject({family:"moss-image",variant:"sft",confidence:"encoder-type"});
    const anima=corePrompt();anima["1"].inputs.unet_name="anima/anima-base-v1.0.safetensors";expect(guessFamily(anima)).toMatchObject({family:"anima",variant:"base"});
    const krea=corePrompt();krea["2"].inputs.type="krea2";krea["1"].inputs.unet_name="krea2_turbo_nvfp4.safetensors";expect(guessFamily(krea)).toMatchObject({family:"krea2",variant:"turbo"});
  });
  it("does not infer Anima from AnimateDiff or compatibility from an arbitrary template label",()=>{
    const prompt=corePrompt();prompt["1"].inputs.unet_name="AnimateDiff.safetensors";expect(guessFamily(prompt,"Anima official template.json")).toBeNull();
    expect(VERIFIED_TEMPLATES).toEqual([]);expect(verifiedTemplate("official.json","abc")).toBeNull();
  });
  it("refuses contradictory family signals rather than guessing one",()=>{
    const prompt=corePrompt();prompt["2"].inputs.type="krea2";prompt["1"].inputs.unet_name="anima-base.safetensors";expect(guessFamily(prompt)).toBeNull();
  });
});
