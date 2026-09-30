import {PreviewImageViewer, type PreviewImage} from "./components/PreviewImageViewer";
import {useFeatureText} from "./feature-i18n";
import { useEffect, useState } from "react";
import "./detective-download.css";
import { AppPortal, Button, CommittedNumberInput, SelectMenu } from "./components/ui";
import { confirmAction } from "./components/confirm";
import { useAppStore } from "./store";
import { imagePasteProps } from "./image-paste";
import { detectiveRoundBudget, detectiveRounds, detectiveParameters, resetDetectiveDraft, type DetectiveParameters, type DetectiveSnapshot } from "./artist-detective-contract";

type Target = { filePath: string; fileUrl: string; name: string };
type Draft = { target: Target | null; prompt: string; style: string; subjectHint: string; knownCharacter: boolean; reverseMode: "tags" | "natural" | "mixed"; budget: number; parameters: DetectiveParameters };
type Download = Awaited<ReturnType<Window["naiDesktop"]["artistDetectiveDownloadStatus"]>>;
const bytes = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GiB` : `${(value / 1024 ** 2).toFixed(1)} MiB`;
const DOWNLOAD_STAGE: Record<string, string> = { idle: "按需下载", downloading: "下载中", verifying: "校验 SHA-256", extracting: "解压中", checking: "检查 CUDA 与模型", complete: "安装完成", cancelled: "已取消，可继续", failed: "安装失败" };
const KEY = "langbai.artist-detective.v1";
function restore(): Draft {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (value && typeof value.prompt === "string" && typeof value.style === "string") {
      detectiveRounds(value.budget);
      return { target: value.target ?? null, prompt: value.prompt, style: value.style,
        subjectHint: typeof value.subjectHint === "string" ? value.subjectHint : "", knownCharacter: value.knownCharacter === true,
        reverseMode: value.reverseMode === "tags" || value.reverseMode === "natural" ? value.reverseMode : "mixed",
        budget: value.budget, parameters: detectiveParameters(value.parameters) };
    }
  } catch { /* new or invalid settings */ }
  return { target: null, prompt: "", style: "", subjectHint: "", knownCharacter: false, reverseMode: "mixed", budget: 300, parameters: detectiveParameters() };
}
const STAGE: Record<string, string> = { idle: "未开始", loading: "校验与加载本地模型", retrieving: "检索相似画师组合", generating: "正在生成", generated: "图片已保存", scoring: "本地评分", scored: "本轮评分完成", complete: "迭代完成", failed: "任务已停止" };

export default function DetectiveArtistLab({ onBack }: { onBack: () => void }) {
  const ft=useFeatureText();
  const [draft, setDraft] = useState(restore);
  const [preview,setPreview] = useState<{images:PreviewImage[];index:number}|null>(null);
  const [snapshot, setSnapshot] = useState<DetectiveSnapshot | null>(null);
  const [download, setDownload] = useState<Download | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const applyParams = useAppStore(s => s.applyParams);
  const templateVersion = useAppStore(s => s.settings?.reversePromptTemplateVersion) === "v4.5" ? "v4.5" : "v5";
  const runtimeVerified = snapshot?.runtimeValidation?.state === 'passed';
  const runtimeChecking = snapshot?.runtimeValidation?.state === 'checking';
  const active = !!snapshot?.running || busy || !!download?.busy || runtimeChecking;
  useEffect(() => {
    if(active)return;
    const refresh=()=>setDraft(restore());
    window.addEventListener("langbai:workspace-imported",refresh);
    return()=>window.removeEventListener("langbai:workspace-imported",refresh);
  },[active]);
  const patch = (value: Partial<Draft>) => setDraft(s => ({ ...s, ...value }));
  const patchParameters = (value: Partial<DetectiveParameters>) => {
    try { patch({ parameters: detectiveParameters({...draft.parameters, ...value}) }); } catch(e) { setError(String(e)); }
  };
  useEffect(() => {
    const timer = setTimeout(() => localStorage.setItem(KEY, JSON.stringify(draft)), 300);
    return () => clearTimeout(timer);
  }, [draft]);
  useEffect(() => {
    let disposed = false, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await window.naiDesktop.artistDetectiveStatus();
        const install = await window.naiDesktop.artistDetectiveDownloadStatus();
        if (!disposed) {
          setDownload(install);
          setSnapshot(next);
          if (next.reference) setDraft(current => current.target ? current : { ...current, target: next.reference!,
            prompt: current.prompt || next.fixedPrompt?.content_tags || "", style: current.style || next.fixedPrompt?.style_tags || "" });
        }
      }
      catch (e) { if (!disposed) setError(String(e)); }
      if (!disposed) timer = setTimeout(poll, 2000);
    };
    void poll();
    const saved = restore().target;
    if (saved?.filePath) void window.naiDesktop.artistLabPickTarget(saved.filePath).then(t => { if (!disposed && t) patch({ target: t }); }).catch(() => {});
    return () => { disposed = true; clearTimeout(timer); };
  }, []);
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await fn(); setSnapshot(await window.naiDesktop.artistDetectiveStatus()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const choose = (file?: string) => action(async () => {
    const target = await window.naiDesktop.artistLabPickTarget(file); if (target) patch({ target });
  });
  const reverse = () => action(async () => {
    if (!draft.target) return;
    const blob = await (await fetch(draft.target.fileUrl)).blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error(ft("读取参考图失败"))); reader.readAsDataURL(blob);
    });
    const hint = ["只提取人物、服装、动作、镜头与场景。不写画师名或 artist 标签；不复制对话文字。",
      draft.subjectHint.trim() ? `用户的目标/角色提示：${draft.subjectHint.trim()}` : ""].filter(Boolean).join("\n");
    const result = await window.naiDesktop.reversePrompt(data, draft.reverseMode, "full", hint, draft.knownCharacter, templateVersion);
    const prompt = (draft.knownCharacter ? result.variants?.namePrompt : undefined) || result.prompt;
    if (!result.ok || !prompt) throw new Error(result.message);
    patch({ prompt });
  });
  const clearResults = () => action(async () => {
    if(!snapshot?.directory)return;
    let deleteImages=false;
    if(!await confirmAction(ft("清空当前任务的结果列表和进度。默认保留图片文件；勾选下方选项会将本次迭代生成的全部图片移入回收站，不仅是页面展示的候选。参考图、模型、参数和其他任务不受影响。"),ft("清空迭代结果？"),{label:ft("同时将本次生成的全部图片移入回收站"),onChange:value=>{deleteImages=value;}}))return;
    setSnapshot(await window.naiDesktop.artistDetectiveClearResults({directory:snapshot.directory,deleteImages}));
    setPreview(null);
  });
  return <main className="artist-lab target-artist-lab">
    <header className="artist-lab-hero"><div><h2>{ft("目标画风自动迭代 · Artist Detective")}</h2><p>{ft("本地画风模型检索、筛选与评分；使用 NAI 4.5 Full 实际生成，按多个 Seed 复测画师组合。")}</p></div><Button onClick={onBack}>{ft("返回画风实验室")}</Button></header>
    <section className="artist-lab-config-grid">
      <article className="artist-lab-panel target-panel" {...(active ? {} : imagePasteProps(paths => choose(paths[0])))}>
        <h3>{ft("目标图片")}</h3>{draft.target ? <img onDoubleClick={()=>setPreview({images:[{src:draft.target!.fileUrl,alt:draft.target!.name}],index:0})} src={draft.target.fileUrl} alt={draft.target.name} /> : <div className="artist-target-empty">{ft("选择或粘贴参考图")}</div>}
        <Button disabled={active} onClick={() => void choose()}>{draft.target ? ft("更换图片") : ft("选择图片")}</Button>
        <small>{ft("评分模型比较整体与人脸画风，不把分数当作“还原百分比”。")}</small>
      </article>
      <article className="artist-lab-panel artist-lab-controls">
        <section className="detective-caption-options" aria-label={ft("模型独立管理")}>
          <SelectMenu label={ft("模型版本")} ariaLabel={ft("模型版本")} disabled={active} value={snapshot?.selectedVariant ?? download?.variant ?? 'full'} options={(['full','light'] as const).map(value=>{
            const model=snapshot?.models?.[value];
            const status=model?.validation.state==='passed'?'已验证':model?.validation.state==='checking'?'校验中':model?.validation.state==='failed'?'校验失败':model?.configured?'待校验':'未配置';
            return {value,label:ft(value==='full'?"完整版 PE-G50 · 至少 8GB 显存":"轻量版 PE-L24 · 低显存试用")+' · '+ft(status)};
          })} onChange={value=>void action(async()=>{setSnapshot(await window.naiDesktop.artistDetectiveSelectModel(value as 'full'|'light'));setDownload(await window.naiDesktop.artistDetectiveDownloadStatus());})}/>
          <small>{ft("两个版本分别保存模型、环境和下载位置，分别校验。切换不会自动下载；校验通过后才启用，失败不覆盖原可用模型。")}</small>
          {snapshot?.selectedVariant && snapshot.models?.[snapshot.selectedVariant] && <small>{ft("当前版本路径：")}<br/>{snapshot.models[snapshot.selectedVariant].assets ?? ft("尚未选择模型目录")}<br/>{snapshot.models[snapshot.selectedVariant].python ?? ft("尚未选择运行环境")}</small>}
        </section>
        <div className="artist-model-cache detective-runtime-toolbar"><b>{runtimeVerified ? ft("模型与环境已验证，可使用") : runtimeChecking ? ft("正在校验文件并加载模型…") : snapshot?.ready ? ft("模型与环境待验证") : ft("请配置模型与运行环境")}</b><div className="detective-runtime-actions"><Button disabled={active} onClick={() => void action(() => window.naiDesktop.artistDetectiveConfigure("python"))}>{ft("使用已有运行环境")}</Button><Button disabled={active} onClick={() => void action(() => window.naiDesktop.artistDetectiveConfigure("assets"))}>{ft("使用已有模型目录")}</Button><Button disabled={active || !snapshot?.ready} onClick={() => void action(() => window.naiDesktop.artistDetectiveVerifyRuntime())}>{ft("重新校验")}</Button></div></div>
        {runtimeVerified && <p className="detective-runtime-summary"><Button disabled>{ft("已验证，无需下载")}</Button> {snapshot?.runtimeValidation?.details?.architecture} · {snapshot?.runtimeValidation?.details?.gpu}</p>}
        {runtimeChecking && <p role="status">{ft("正在检查模型完整性、Python、PyTorch 和 CUDA，并执行本地模型评分。不会下载资源或调用付费生图，请稍候。")}</p>}
        {snapshot?.runtimeValidation?.state === 'failed' && <p className="artist-error" role="alert">{ft("模型或环境校验失败，请检查路径后重新校验。")} {snapshot.runtimeValidation.message}</p>}
        {(!runtimeVerified || download?.busy) && <details className="detective-download-panel" open={!snapshot?.ready || !!download?.busy}>
          <summary>{ft(snapshot?.ready ? "重新下载或切换模型（可选）" : "下载模型与运行环境")}</summary>
          <h3>{ft("模型与 PyTorch 运行环境")}</h3>
          <p>{ft("Windows x64 · NVIDIA 显卡 · 完整版至少 8GB 显存；轻量版面向低显存设备，具体余量取决于驱动和其他程序。包含 Python 3.12、PyTorch CUDA 12.8。此流程目前仅开放 NAI 4.5 Full。")}</p>
          <p>{ft((snapshot?.selectedVariant ?? download?.variant)==='light'?"轻量版 PE-L24 · 低显存试用":"完整版 PE-G50 · 至少 8GB 显存")}</p>
          {download && <>
            {download.stage !== "idle" && <>
            <p role="status">{ft(DOWNLOAD_STAGE[download.stage] ?? download.stage)} · {download.total ? (100 * download.downloaded / download.total).toFixed(1) : "0"}% · {bytes(download.downloaded)} / {bytes(download.total)} · {bytes(download.bytesPerSecond)}/s</p>
            <progress aria-label={ft("资源下载进度")} max={download.total || 1} value={download.downloaded} style={{ width: "100%" }} />
            </>}
            <p>{ft("存放位置：")}<code style={{ overflowWrap: "anywhere" }}>{download.directory}</code></p>

            {download.message && <p role="status">{download.message.startsWith('安装在 ') ? ft('安装在 {stage} 阶段失败。原运行环境和模型配置未替换；请检查网络、磁盘空间及显卡驱动后重试。',{stage:ft(DOWNLOAD_STAGE[download.message.match(/^安装在 (\w+) 阶段/)?.[1] ?? 'failed'] ?? download.stage)}) : ft(download.message)}</p>}
          </>}
          <div className="artist-candidate-actions">
            <Button disabled={active} onClick={() => void action(async () => setDownload(await window.naiDesktop.artistDetectiveDownloadDirectory()))}>{ft("选择存放位置")}</Button>
            {download?.busy ? <Button onClick={() => void action(async () => setDownload(await window.naiDesktop.artistDetectiveDownloadCancel()))}>{ft("取消下载")}</Button>
              : <Button disabled={active} variant="primary" onClick={() => void action(async () => setDownload(await window.naiDesktop.artistDetectiveDownloadStart()))}>{ft("下载并安装 / 继续下载")}</Button>}
          </div>
          <p><a href="https://huggingface.co/langbai666/novelai-studio-artist-detective" target="_blank" rel="noreferrer" onClick={event => { event.preventDefault(); void window.naiDesktop.openExternal(event.currentTarget.href).catch(e => setError(e instanceof Error ? e.message : String(e))); }}>{ft("前往 Hugging Face 模型仓库 ↗")}</a></p>
          <details><summary>{ft("使用说明")}</summary><ol><li>{ft("先选择模型版本和磁盘位置，建议预留至少 35GB（完整版）或 20GB（轻量版）。两种模型与索引成套下载，不可混用。")}</li><li>{ft("下载完成后自动校验、解压并检查 CUDA。未通过检查时保留原配置。")}</li><li>{ft("安装 NVIDIA 驱动；无需另装完整 CUDA Toolkit。完整版至少 8GB；轻量版尚未逐一验证各款低显存显卡。")}</li><li>{ft("配置 NovelAI API，选择参考图，反推或填写固定内容提示词，再选择图片预算开始迭代。")}</li><li>{ft("NAI 负责云端出图，本地 GPU 负责画风评分，CPU 负责画师检索与候选预测。不同模型的分数不能直接比较。")}</li><li>{ft("网络中断保留下载片段，重试可断点续传；取消或失败不替换现有配置和历史图片。")}</li></ol></details>
        </details>}
        <label><span>{ft("固定内容提示词")}</span><textarea disabled={active} value={draft.prompt} onChange={e => patch({ prompt: e.target.value })} /></label>
        <section className="detective-caption-options" aria-label={ft("反推范围与角色")}>
          <SelectMenu label={ft("反推模式")} ariaLabel={ft("反推模式")} disabled={active} value={draft.reverseMode} options={[
            {value:"mixed",label:ft("混合模式")},{value:"tags",label:ft("Danbooru 标签")},{value:"natural",label:ft("自然语言")}
          ]} onChange={value=>patch({reverseMode:value as Draft["reverseMode"]})}/>
          <small>{ft("使用软件设置中保存的 {version} 对应模式模板；网络角色选项不改变模板要求。",{version:templateVersion.toUpperCase()})}</small>
          <label><span>{ft("目标/角色提示（可选）")}</span><input disabled={active} value={draft.subjectHint} onChange={e => patch({subjectHint:e.target.value})} placeholder={ft("例如：这是芙宁娜 / 只反推右侧角色 / 只反推桌上的物品")} aria-describedby="detective-subject-help" /></label>
          <label className="checkbox-line prompt-character-toggle"><input type="checkbox" disabled={active} checked={draft.knownCharacter} onChange={e => patch({knownCharacter:e.target.checked})} aria-describedby="detective-subject-help" /><span>{ft("网络角色：优先使用角色 Tag")}</span></label>
          <p id="detective-subject-help">{ft("提示用于告诉视觉模型要识别谁、看哪里；留空则分析整张图。开启网络角色后，仅在能可靠识别时优先使用角色 Tag；识别不确定时仍描述外貌，不猜角色名。")}</p>
          <Button disabled={active || !draft.target} onClick={() => void reverse()}>{ft("使用已配置的视觉模型反推内容")}</Button>
          <small>{ft("修改这些选项后需重新点击反推；结果填入上方固定内容提示词，不会自动开始生图。")}</small>
        </section>
        <label><span>{ft("固定辅助画风词（可选）")}</span><textarea disabled={active} value={draft.style} onChange={e => patch({ style: e.target.value })} /></label>
        <div className="artist-run-options">
          <CommittedNumberInput label={ft("迭代轮数")} value={detectiveRounds(draft.budget)} min={1} disabled={active} normalize={v => Math.max(1, Math.floor(v))} onCommit={rounds => { try { patch({ budget: detectiveRoundBudget(rounds) }); } catch (e) { setError(String(e)); } }} />
          <CommittedNumberInput label={ft("最多生成图片数（含最终复测）")} value={draft.budget} min={24} step={2} disabled={active} normalize={v => Math.max(24, Math.floor(v / 2) * 2)} onCommit={budget => { try { detectiveRounds(budget); patch({ budget }); } catch (e) { setError(String(e)); } }} />
        </div>
        <details className="detective-budget-help" aria-label={ft("轮数与图片上限说明")}>
          <summary>{ft("本次最多生成 {budget} 张图片",{budget:draft.budget})} · {ft("轮数与图片上限说明")}</summary>
          <ol>
            <li><b>{ft("搜索阶段：最多 {search} 张，分 {rounds} 轮。",{search:draft.budget-16,rounds:detectiveRounds(draft.budget)})}</b><p>{ft("一轮尝试最多 16 组画师组合，每组生成 2 张，用不同随机种子比较画风；一轮最多 32 张。")}</p></li>
            <li><b>{ft("最终复测：最多 16 张（已包含在上限内）。")}</b><p>{ft("从搜索结果中选出最多 4 组，每组再用 4 个新随机种子出图，检查画风是否稳定。")}</p></li>
          </ol>
          <p>{ft("修改轮数会更新图片上限；修改图片上限会重新计算轮数。最后一轮可能不足 32 张，上限不代表一定生成满。")}</p>
          <small>{ft("生成图片会调用 NovelAI API，可能消耗 Anlas；可随时停止，已完成图片会保留。")}</small>
        </details>
        <section className="detective-parameters" aria-label={ft("生成与搜索参数")}>
          <h3>{ft("生成与搜索参数")}</h3>
          <div className="detective-parameter-grid">
            <SelectMenu label={ft("生图模型")} ariaLabel={ft("生图模型")} value={draft.parameters.model} disabled={active} options={[{value:"nai-diffusion-4-5-full",label:"NAI 4.5 Full"}]} onChange={() => {}} />
            <SelectMenu label={ft("图片尺寸")} ariaLabel={ft("图片尺寸")} value={`${draft.parameters.width}x${draft.parameters.height}`} disabled={active} options={[{value:"832x1216",label:ft("竖图 832 × 1216")},{value:"1216x832",label:ft("横图 1216 × 832")},{value:"1024x1024",label:ft("方图 1024 × 1024")}]} onChange={value=>{const [width,height]=value.split("x").map(Number);patchParameters({width,height});}} />
            <SelectMenu label={ft("采样器")} ariaLabel={ft("采样器")} value={draft.parameters.sampler} disabled={active} options={["k_euler_ancestral","k_euler","k_dpmpp_2m","k_dpmpp_sde"].map(value=>({value,label:value}))} onChange={value=>patchParameters({sampler:value as DetectiveParameters["sampler"]})} />
            <SelectMenu label={ft("噪声计划")} ariaLabel={ft("噪声计划")} value={draft.parameters.noiseSchedule} disabled={active} options={["karras","exponential","polyexponential","native"].map(value=>({value,label:value}))} onChange={value=>patchParameters({noiseSchedule:value as DetectiveParameters["noiseSchedule"]})} />
            {([{key:"steps",label:ft("采样步数"),min:1,max:50,step:1},{key:"scale",label:ft("提示词引导 CFG"),min:1,max:10,step:0.1},{key:"cfgRescale",label:"CFG Rescale",min:0,max:1,step:0.05},{key:"searchSeed",label:ft("搜索随机种子"),min:0,max:4294967295,step:1},{key:"proposalPoolMultiplier",label:ft("候选预测池倍率"),min:1,max:32,step:1}] as const).map(field=><CommittedNumberInput key={field.key} label={field.label} value={draft.parameters[field.key]} min={field.min} max={field.max} step={field.step} disabled={active} normalize={v=>Math.max(field.min,Math.min(field.max,field.step===1?Math.floor(v):v))} onCommit={v=>patchParameters({[field.key]:v})} />)}
          </div>
          <label><span>{ft("质量与辅助后缀（可清空）")}</span><textarea disabled={active} value={draft.parameters.qualityPrompt} onChange={e=>patchParameters({qualityPrompt:e.target.value})} /></label>
          <label><span>{ft("负面提示词（可清空）")}</span><textarea disabled={active} value={draft.parameters.negativePrompt} onChange={e=>patchParameters({negativePrompt:e.target.value})} /></label>
          <small>{ft("搜索种子控制组合与复测种子；固定每组多种子评分。新参数仅用于下一次任务，不改动正在运行的任务或历史。")}</small>
          <Button disabled={active} onClick={()=>void action(async()=>{if(await confirmAction(ft("仅恢复本页生成与迭代参数（默认 300 张）。保留参考图、内容提示词、密钥、模型、路径和历史记录。"), ft("恢复默认配置？")))setDraft(current=>resetDetectiveDraft(current));})}>{ft("恢复默认配置")}</Button>
        </section>
      </article>
    </section>
    <section className="artist-lab-actions">
      {snapshot?.running ? <Button variant="danger" disabled={busy} onClick={() => void action(() => window.naiDesktop.artistDetectiveStop())}>{ft("停止（保留当前请求结果）")}</Button>
        : <Button variant="primary" disabled={active || !runtimeVerified || !draft.target || !draft.prompt.trim()} onClick={() => void action(() => window.naiDesktop.artistDetectiveStart({ image: draft.target!.filePath, prompt: draft.prompt, style: draft.style, budget: draft.budget, parameters: draft.parameters }))}>{ft("开始自动迭代")}</Button>}
      <span role="status">{snapshot ? ft("{stage} · {done}/{total} 张",{stage:ft(STAGE[snapshot.stage] ?? snapshot.stage),done:snapshot.completed,total:snapshot.budget}) : ft("读取状态…")}</span>
      <Button disabled={!snapshot?.directory} onClick={() => void window.naiDesktop.artistDetectiveOpenResults()}>{ft("打开结果目录")}</Button>
      <Button disabled={active || !snapshot?.directory} onClick={() => void clearResults()}>{ft("清空迭代结果")}</Button>
    </section>
    {(error || snapshot?.message) && <p className="artist-error" role="alert">{ft(error || snapshot?.message || "")}</p>}
    {!!snapshot?.candidates.length && <section className="artist-gallery-section"><h3>{snapshot.candidates[0].phase === "finalists" ? ft("最终候选 · 4 个新 Seed 的平均相似度") : ft("搜索候选 · 2 个固定 Seed 的平均相似度")}</h3><div className="artist-candidate-grid">{snapshot.candidates.map((item, i) => <article className="artist-candidate done" key={item.image + item.phase}>
      <header className="artist-candidate-header"><b>#{i + 1} · {item.score.toFixed(4)}</b><span>{ft(item.phase === 'finalists' ? '最终复测' : '搜索候选')}</span></header>
      <div className="artist-candidate-media"><img onDoubleClick={()=>setPreview({images:snapshot!.candidates.map(c=>({src:c.image,alt:c.prompt})),index:i})} src={item.image} alt={ft('画风候选 {number}',{number:i+1})} loading="lazy" /></div>
      <div className="artist-string-block"><code>{item.prompt}</code></div>
      <div className="artist-candidate-actions"><Button onClick={() => { void navigator.clipboard.writeText(item.prompt); }}>{ft("复制画师串")}</Button><Button variant="primary" onClick={() => applyParams({ stylePrompt: item.prompt })}>{ft("应用到生成")}</Button></div>
    </article>)}</div></section>}
    {preview&&<AppPortal><div className="style-image-lightbox" role="dialog" aria-modal="true" onClick={e=>{if(e.target===e.currentTarget)setPreview(null);}}><button type="button" aria-label={ft("关闭")} onClick={()=>setPreview(null)}>×</button><PreviewImageViewer images={preview.images} index={preview.index} onIndex={index=>setPreview({...preview,index})} onBackgroundClick={()=>setPreview(null)}/></div></AppPortal>}
  </main>;
}
