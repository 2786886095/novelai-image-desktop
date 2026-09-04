class AgentProviderPreset {
  final String id;
  final String label;
  final String protocol;
  final String baseUrl;
  final String model;
  final String providerName;
  final int contextWindow;
  final int maxOutputTokens;
  final bool vision;
  final bool local;

  const AgentProviderPreset({
    required this.id,
    required this.label,
    required this.protocol,
    required this.baseUrl,
    required this.model,
    required this.providerName,
    required this.contextWindow,
    required this.maxOutputTokens,
    required this.vision,
    this.local = false,
  });
}

const agentProviderPresets = <AgentProviderPreset>[
  AgentProviderPreset(
      id: 'deepseek',
      label: 'DeepSeek',
      protocol: 'openai-responses',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      providerName: 'DeepSeek',
      contextWindow: 1048576,
      maxOutputTokens: 32768,
      vision: false),
  AgentProviderPreset(
      id: 'openai',
      label: 'OpenAI',
      protocol: 'openai-responses',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5.6-terra',
      providerName: 'OpenAI',
      contextWindow: 1050000,
      maxOutputTokens: 32768,
      vision: true),
  AgentProviderPreset(
      id: 'anthropic',
      label: 'Anthropic Claude',
      protocol: 'anthropic-messages',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-5',
      providerName: 'Anthropic',
      contextWindow: 1000000,
      maxOutputTokens: 32768,
      vision: true),
  AgentProviderPreset(
      id: 'gemini',
      label: 'Google Gemini',
      protocol: 'google-gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-3.7-flash',
      providerName: 'Google Gemini',
      contextWindow: 1048576,
      maxOutputTokens: 32768,
      vision: true),
  AgentProviderPreset(
      id: 'openrouter',
      label: 'OpenRouter',
      protocol: 'openai-compatible',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: '',
      providerName: 'OpenRouter',
      contextWindow: 128000,
      maxOutputTokens: 8192,
      vision: true),
  AgentProviderPreset(
      id: 'siliconflow',
      label: 'SiliconFlow',
      protocol: 'openai-compatible',
      baseUrl: 'https://api.siliconflow.cn/v1',
      model: '',
      providerName: 'SiliconFlow',
      contextWindow: 128000,
      maxOutputTokens: 8192,
      vision: true),
  AgentProviderPreset(
      id: 'dashscope',
      label: '阿里云百炼 DashScope',
      protocol: 'openai-compatible',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: '',
      providerName: 'DashScope',
      contextWindow: 128000,
      maxOutputTokens: 8192,
      vision: true),
  AgentProviderPreset(
      id: 'volcengine',
      label: '火山方舟 Ark',
      protocol: 'openai-compatible',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      model: '',
      providerName: 'Volcengine Ark',
      contextWindow: 128000,
      maxOutputTokens: 8192,
      vision: true),
  AgentProviderPreset(
      id: 'moonshot',
      label: 'Moonshot / Kimi',
      protocol: 'openai-compatible',
      baseUrl: 'https://api.moonshot.cn/v1',
      model: '',
      providerName: 'Moonshot',
      contextWindow: 128000,
      maxOutputTokens: 8192,
      vision: true),
  AgentProviderPreset(
      id: 'zhipu',
      label: '智谱 BigModel',
      protocol: 'openai-compatible',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      model: '',
      providerName: '智谱 BigModel',
      contextWindow: 128000,
      maxOutputTokens: 8192,
      vision: true),
  AgentProviderPreset(
      id: 'ollama',
      label: 'Ollama（本机）',
      protocol: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: '',
      providerName: 'Ollama',
      contextWindow: 32768,
      maxOutputTokens: 4096,
      vision: false,
      local: true),
  AgentProviderPreset(
      id: 'lm-studio',
      label: 'LM Studio（本机）',
      protocol: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:1234/v1',
      model: '',
      providerName: 'LM Studio',
      contextWindow: 32768,
      maxOutputTokens: 4096,
      vision: false,
      local: true),
  AgentProviderPreset(
      id: 'custom',
      label: '自定义服务',
      protocol: 'openai-compatible',
      baseUrl: '',
      model: '',
      providerName: '自定义模型',
      contextWindow: 128000,
      maxOutputTokens: 8192,
      vision: true),
];

const supportedAgentProtocols = {
  'openai-compatible',
  'openai-responses',
  'anthropic-messages',
  'google-gemini'
};

String normalizeAgentProtocol(Object? value) =>
    supportedAgentProtocols.contains(value)
        ? value.toString()
        : 'openai-compatible';

bool agentApiKeyRequired(String protocol, String baseUrl) {
  if (protocol != 'openai-compatible') return true;
  final host = Uri.tryParse(baseUrl)?.host.toLowerCase() ?? '';
  return !(host == 'localhost' || host == '::1' || host.startsWith('127.'));
}

class AgentDiscoveredModel {
  final String id;
  final String displayName;
  final int? contextWindow;
  final int? maxOutputTokens;
  final int? suggestedOutputTokens;
  final bool? vision;

  const AgentDiscoveredModel(
      {required this.id,
      required this.displayName,
      this.contextWindow,
      this.maxOutputTokens,
      this.suggestedOutputTokens,
      this.vision});
}
