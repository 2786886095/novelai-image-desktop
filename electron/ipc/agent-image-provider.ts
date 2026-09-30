import { createHmac, randomBytes } from 'node:crypto';
import type { AppSettings, CompatibleGenerationRequest } from '../../src/types';
import type { AgentToolBridgeRequest } from '../../src/agent/types';
import { buildCompatibleImageRequest, imageGenerationEndpoint } from '../../src/image-provider-contract';

// Process-local, host-only binding. Never serialize raw credentials or a plain
// credential hash into model messages, approvals, or durable tool receipts.
const bindingKey = randomBytes(32);
export type ImageProviderBinding = NonNullable<AgentToolBridgeRequest['imageProviderBinding']>;
export const PAID_IMAGE_TOOLS = new Set(['langbai_generate_image', 'langbai_redraw_image', 'langbai_inpaint_image', 'langbai_upscale_image', 'langbai_director']);
export function bindAgentImageProvider(settings: AppSettings): ImageProviderBinding {
  const provider = settings.imageProvider === 'openai-images' ? 'openai-images' : 'novelai';
  const revision = createHmac('sha256', bindingKey).update(JSON.stringify([
    provider, provider === 'openai-images' ? [settings.compatibleImage, settings.imageApiKey] : null,
    settings.outputDir, settings.generationGroupId, settings.proxyMode, settings.proxyUrl, settings.proxyForAi,
  ])).digest('hex');
  return { provider, revision };
}
export function assertAgentImageProvider(settings: AppSettings, binding?: ImageProviderBinding) {
  if (binding && binding.revision !== bindAgentImageProvider(settings).revision) {
    throw Error('图片服务配置已变化，本次未提交生图；请重新读取当前服务后发起新任务。');
  }
}
export function assertAgentImageTool(tool: string, settings: AppSettings) {
  if (settings.imageProvider === 'openai-images' && PAID_IMAGE_TOOLS.has(tool) && tool !== 'langbai_generate_image') {
    throw Error('当前兼容图片服务仅接入文生图；此操作未执行，也没有切换到 NovelAI。请在软件中选择原生服务后再使用重绘、局部重绘、超分或增强。');
  }
}
export function compatibleAgentInput(args: Record<string, unknown>, settings: AppSettings, requirePrompt = true): CompatibleGenerationRequest {
  const config = settings.compatibleImage;
  if (!config) throw Error('请先在软件设置中保存兼容图片服务配置。');
  // Do not silently clamp a custom model into a native NAI model, or silently
  // ignore requested native parameters. Template callers normally send count only.
  const allowed = new Set(['positivePrompt', 'count', 'model']);
  if (Object.keys(args).some(key => !allowed.has(key))) {
    throw Error('兼容图片生图只接收 positivePrompt、count；模型、尺寸和网关扩展参数使用软件中保存的配置。原生参考图、风格、种子等参数未提交。');
  }
  if (args.model !== undefined && args.model !== config.model) throw Error('请求模型与软件所选兼容模型不同；请先在软件中切换配置。');
  const count = args.count ?? 1;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1 || count > 8) throw Error('单次 Agent 生成张数须为1–8。');
  const prompt = args.positivePrompt;
  if (requirePrompt && (typeof prompt !== 'string' || !prompt.trim())) throw Error('正面提示词不能为空。');
  if (!settings.imageApiKey?.trim() || /[\r\n]/.test(settings.imageApiKey)) throw Error('请先在软件设置中填写独立图片 API Key。');
  imageGenerationEndpoint(config.baseUrl);
  buildCompatibleImageRequest(config, { prompt: requirePrompt ? prompt as string : 'configuration validation', size: config.size, n: count, extensions: config.extensions });
  return { prompt: typeof prompt === 'string' ? prompt : '', n: count };
}

/** Overlay native state, don't append a compatible model beside native capabilities. */
export function agentImageProviderState(settings: AppSettings): Record<string, unknown> {
  if (settings.imageProvider !== 'openai-images') return { imageProvider: 'novelai' };
  const config = settings.compatibleImage;
  let endpoint = '';
  try { endpoint = imageGenerationEndpoint(config?.baseUrl ?? ''); } catch { /* invalid saved config is not ready */ }
  return {
    imageProvider: 'openai-images',
    params: { model: config?.model ?? '', size: config?.size ?? 'auto' },
    imageService: {
      provider: 'openai-images', endpoint, model: config?.model ?? '', size: config?.size ?? 'auto',
      responseFormat: config?.responseFormat ?? 'auto', credentialConfigured: Boolean(settings.imageApiKey?.trim()),
      extensions: config?.extensions ?? {}, capabilities: ['text-to-image'],
      instructions: '使用软件已保存的独立图片服务配置；生图传 positivePrompt、count。模板转换仍遵循软件模板；原生风格锁、参考图、角色分段和其他原生图片操作不自动应用。不自动重试或切换到 NovelAI。费用以所选服务商记录为准。',
    },
    modelMode: 'compatible-text-to-image', lockedStylePrompt: '', lockedNegativePrompt: '', streamPreviewEnabled: false,
    referenceCapabilities: { maxCharacterPrompts: 0, vibeTransfer: false, preciseReference: false, attachmentIdsRequiredForAgentReferences: false },
  };
}
