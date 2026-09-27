import {it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {detectiveParameters, resetDetectiveDraft, DEFAULT_DETECTIVE_PARAMETERS} from "./artist-detective-contract";
it("validates each paid generation parameter and limits only this workflow to 4.5",()=>{
 expect(detectiveParameters()).toEqual(DEFAULT_DETECTIVE_PARAMETERS);
 expect(detectiveParameters({width:1216,height:832,steps:35,scale:7,searchSeed:0,negativePrompt:"",qualityPrompt:""})).toMatchObject({width:1216,steps:35,searchSeed:0,negativePrompt:""});
 for(const change of [{model:"nai-diffusion-5-full"},{steps:28.5},{scale:NaN},{searchSeed:-1},{searchSeed:4294967296},{width:900},{cfgRescale:1.1},{proposalPoolMultiplier:0},{sampler:"bad"},{noiseSchedule:"bad"},{negativePrompt:null}]) expect(()=>detectiveParameters(change as any)).toThrow();
});
it("reset retains the reference, prompts, history and unrelated fields",()=>{
 const draft={target:{filePath:"reference.png"},prompt:"kept",style:"kept style",history:["kept image"],directory:"kept directory",budget:1000,parameters:detectiveParameters({steps:40})};
 const reset=resetDetectiveDraft(draft);expect(reset.budget).toBe(300);expect(reset.parameters.steps).toBe(28);
 for(const key of ["target","prompt","style","history","directory"] as const)expect(reset[key]).toBe(draft[key]);
 expect(draft.parameters.steps).toBe(40);
});
it("uses shared controls, explicit reset confirmation, and one external repository link",()=>{
 const ui=readFileSync(new URL('./DetectiveArtistLab.tsx',import.meta.url),'utf8');
 expect(ui).not.toContain('<select');expect(ui).not.toContain('onLegacy');
 expect(ui).toContain('使用已有运行环境');expect(ui).toContain('使用已有模型目录');
 expect(ui).toContain('if(await confirmAction(');
 expect(ui).not.toContain('download?.packages.map');
 expect(ui).toContain('href="https://huggingface.co/langbai666/novelai-studio-artist-detective"');
 expect(ui).toContain('前往 Hugging Face 模型仓库');
 expect(ui).toContain('event.preventDefault()');
 expect(ui).toContain('window.naiDesktop.openExternal(event.currentTarget.href)');
 expect(ui).toContain('bytes(download.bytesPerSecond)');
 expect(ui).toContain('资源下载进度');
 expect(ui).toContain('parameters: draft.parameters');
});
