// Unified AI Service Layer — provider-agnostic client-side AI calls
// All calls go directly from the browser to the user-configured provider endpoint.

// 考研日历 v2 改造 (2026-09-10):
// 1) 加 6 Agent 专家配置 (英语/政治/数学/专业课/健身/健康)
// 2) 加 stripThink 清理 LLM 输出 (思考内容 + 内部 token)
// 3) 扩 max_tokens 让 6 agent prompt 装得下

// ===== 6 Agent 专家 =====
export const AGENTS = {
  general: { name: '通用助手', icon: '🤖', color: '#7f8c8d' },
  english: { name: '英语专家', icon: '📘', color: '#3498db' },
  politics: { name: '政治专家', icon: '📕', color: '#e74c3c' },
  math: { name: '数学专家', icon: '📗', color: '#27ae60' },
  cs: { name: '专业课专家', icon: '📙', color: '#f39c12' },
  fitness: { name: '健身专家', icon: '🏋️', color: '#9b59b6' },
  health: { name: '健康专家', icon: '❤️', color: '#e91e63' },
};

const AGENT_STORAGE_KEY = 'kaoyan-current-agent';
export function getCurrentAgent() {
  try {
    const a = localStorage.getItem(AGENT_STORAGE_KEY);
    if (a && AGENTS[a]) return a;
  } catch {}
  return 'general';
}
export function setCurrentAgent(agent) {
  if (!AGENTS[agent]) return;
  try { localStorage.setItem(AGENT_STORAGE_KEY, agent); } catch {}
}

// 清理 LLM 输出: 去掉 <think>...</think> 内部思考 + 内部 token + 头部空白
export function stripThink(s) {
  if (!s) return '';
  return s
    .replace(/<think>[\s\S]*?<\/think>/g, '')   // 完整闭合的 <think>
    .replace(/<think>[\s\S]*$/g, '')              // 未闭合 (流式中间状态)
    .replace(/<\|[^|]*?\|>/g, '')                 // 内部 token: <|im_end|> <|im_start|> 等
    .replace(/^[\s\n]+/, '')                      // 头部空白
    .trim();
}

const DEFAULT_CONFIG = {
  enabled: false,
  // 默认给国内服务商（DeepSeek V4 Flash），免梯子即可用；老用户已保存的配置不受影响
  provider: 'deepseek',
  apiKey: '',
  model: 'deepseek-v4-flash',
  baseUrl: '',
  features: {
    voiceTaskInput: true,
    morningSummary: true,
    eveningReflection: true,
    weeklySummary: true,
    smartScheduling: true,
    durationEstimate: true,
    frameNudge: true,
    aiReschedule: true,
    aiSubtasks: true,
  }
};

const PROVIDER_MODELS = {
  openai: [
    { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra（均衡，推荐）', recommended: true },
    { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol（旗舰）' },
    { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna（快速便宜）' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
    { id: 'gpt-5.4-nano', label: 'GPT-5.4 Nano' },
  ],
  openrouter: [
    { id: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5', recommended: true },
    { id: 'anthropic/claude-opus-5', label: 'Claude Opus 5' },
    { id: 'openai/gpt-5.6-terra', label: 'GPT-5.6 Terra' },
    { id: 'google/gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
    { id: 'z-ai/glm-5.3', label: 'GLM-5.3' },
    { id: 'moonshotai/kimi-k3', label: 'Kimi K3' },
  ],
  anthropic: [
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5（推荐）', recommended: true },
    { id: 'claude-opus-5', label: 'Claude Opus 5（旗舰）' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5（最快最省）' },
    { id: 'claude-fable-5-1', label: 'Claude Fable 5.1（顶配）' },
  ],
  gemini: [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash（推荐）', recommended: true },
    { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro（最强推理）' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash（旧）' },
  ],
  ollama: [
    { id: 'llama3.2', label: 'Llama 3.2', recommended: true },
    { id: 'qwen3:8b', label: 'Qwen3 8B' },
    { id: 'gemma3', label: 'Gemma 3' },
    { id: 'mistral', label: 'Mistral' },
  ],
  custom: [],

  // ===== 国内服务商（全部 OpenAI 兼容协议，直连国内节点）=====
  // 更新于 2026-09-11：deepseek-chat / deepseek-reasoner 已于 2026-07-24 停用（调用直接报错）
  deepseek: [
    { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash（高速，推荐）', recommended: true },
    { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro（旗舰推理）' },
  ],
  zhipu: [
    { id: 'glm-5.3', label: 'GLM-5.3（旗舰，推荐）', recommended: true },
    { id: 'glm-5.3-flash', label: 'GLM-5.3-Flash（快）' },
    { id: 'glm-5.2', label: 'GLM-5.2（1M 上下文）' },
    { id: 'glm-4.6', label: 'GLM-4.6（旧）' },
  ],
  qwen: [
    { id: 'qwen3.8-max', label: '通义千问 3.8 Max（旗舰，推荐）', recommended: true },
    { id: 'qwen3.7-plus', label: '通义千问 3.7 Plus（均衡）' },
    { id: 'qwen3.8-flash', label: '通义千问 3.8 Flash（快）' },
    { id: 'qwen3.7-flash', label: '通义千问 3.7 Flash' },
    { id: 'qwen-long', label: '通义千问 Long（1000 万上下文）' },
  ],
  moonshot: [
    { id: 'kimi-k3', label: 'Kimi K3（旗舰，推荐）', recommended: true },
    { id: 'kimi-k2.7', label: 'Kimi K2.7' },
    { id: 'kimi-k2.6', label: 'Kimi K2.6' },
    { id: 'moonshot-v1-128k', label: 'Moonshot v1 128K（旧）' },
  ],
  volcengine: [
    { id: 'doubao-seed-evolving', label: '豆包 Seed Evolving（自进化，推荐）', recommended: true },
    { id: 'doubao-seed-2.1-pro', label: '豆包 Seed 2.1 Pro' },
    { id: 'doubao-seed-2.1-turbo', label: '豆包 Seed 2.1 Turbo' },
    { id: 'doubao-seed-2.0-code', label: '豆包 Seed 2.0 Code' },
  ],
  siliconflow: [
    { id: 'deepseek-ai/DeepSeek-V4', label: 'DeepSeek V4', recommended: true },
    { id: 'zai-org/GLM-5.3', label: 'GLM-5.3' },
    { id: 'moonshotai/Kimi-K3', label: 'Kimi K3' },
    { id: 'Qwen/Qwen3.8-32B', label: 'Qwen3.8 32B' },
  ],
  minimax: [
    { id: 'MiniMax-M3', label: 'MiniMax M3（旗舰，推荐）', recommended: true },
    { id: 'MiniMax-M2.7', label: 'MiniMax M2.7' },
    { id: 'MiniMax-M2.5', label: 'MiniMax M2.5' },
  ],
  hunyuan: [
    { id: 'hy4-preview', label: '混元 Hy4 Preview（旗舰，推荐）', recommended: true },
    { id: 'hy3', label: '混元 Hy3（256K）' },
    { id: 'hunyuan-a13b', label: '混元 A13B（轻量）' },
  ],
  qianfan: [
    { id: 'ernie-5.1', label: '文心 ERNIE 5.1（旗舰，推荐）', recommended: true },
    { id: 'ernie-5.0', label: '文心 ERNIE 5.0（全模态）' },
  ],
};

const PROVIDER_LABELS = {
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  ollama: 'Ollama (Local)',
  custom: 'Custom (OpenAI-compatible)',
  // 国内
  deepseek: '🇨🇳 DeepSeek 深度求索',
  zhipu: '🇨🇳 智谱 GLM',
  qwen: '🇨🇳 通义千问（阿里百炼）',
  moonshot: '🇨🇳 Kimi（月之暗面）',
  volcengine: '🇨🇳 豆包（火山方舟）',
  siliconflow: '🇨🇳 硅基流动 SiliconFlow',
  minimax: '🇨🇳 MiniMax',
  hunyuan: '🇨🇳 腾讯混元',
  qianfan: '🇨🇳 文心一言（百度千帆）',
};

// 国内服务商固定 Base URL（OpenAI 兼容），选中后自动填充，用户一般不用改
export const PROVIDER_BASE_URLS = {
  deepseek: 'https://api.deepseek.com/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  moonshot: 'https://api.moonshot.cn/v1',
  volcengine: 'https://ark.cn-beijing.volces.com/api/v3',
  siliconflow: 'https://api.siliconflow.cn/v1',
  minimax: 'https://api.minimaxi.com/v1',
  hunyuan: 'https://api.hunyuan.cloud.tencent.com/v1',
  qianfan: 'https://qianfan.baidubce.com/v2',
};

// 一键配置用的推荐预设：key = provider，给出申请入口
export const CN_PRESETS = [
  { provider: 'deepseek',    name: 'DeepSeek',    keyUrl: 'https://platform.deepseek.com/api_keys',             note: '最便宜，中文强，推荐首选' },
  { provider: 'zhipu',       name: '智谱 GLM',     keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',        note: 'GLM-5.3 旗舰，有免费额度' },
  { provider: 'qwen',        name: '通义千问',      keyUrl: 'https://bailian.console.aliyun.com/?tab=model#/api-key', note: '阿里百炼，稳定' },
  { provider: 'siliconflow', name: '硅基流动',      keyUrl: 'https://cloud.siliconflow.cn/account/ak',            note: '聚合多家开源模型' },
  { provider: 'moonshot',    name: 'Kimi',        keyUrl: 'https://platform.moonshot.cn/console/api-keys',      note: '长上下文' },
  { provider: 'volcengine',  name: '豆包',         keyUrl: 'https://console.volcengine.com/ark',                 note: '模型填接入点 ID' },
  { provider: 'minimax',     name: 'MiniMax',     keyUrl: 'https://platform.minimaxi.com/',                     note: 'M3 长上下文' },
  { provider: 'hunyuan',     name: '腾讯混元',      keyUrl: 'https://cloud.tencent.com/product/hunyuan',          note: '腾讯云' },
  { provider: 'qianfan',     name: '文心一言',      keyUrl: 'https://console.bce.baidu.com/qianfan/ais/console/apiKey', note: '百度千帆' },
];

// 走 OpenAI 兼容 /chat/completions 的 provider
export const OPENAI_COMPAT_PROVIDERS = [
  'openai', 'openrouter', 'custom',
  'deepseek', 'zhipu', 'qwen', 'moonshot', 'volcengine',
  'siliconflow', 'minimax', 'hunyuan', 'qianfan',
];

export function isOpenAICompat(provider) {
  return OPENAI_COMPAT_PROVIDERS.includes(provider);
}

// 国内服务商（有预设 Base URL 的都算）
export function isDomesticProvider(provider) {
  return !!PROVIDER_BASE_URLS[provider];
}

// 取某个 provider 的默认模型（标了 recommended 的那个）
export function defaultModelFor(provider) {
  const list = PROVIDER_MODELS[provider] || [];
  return (list.find(m => m.recommended) || list[0])?.id || '';
}

// Load config from localStorage
export function loadAIConfig() {
  try {
    const raw = localStorage.getItem('day-planner-ai-config');
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...parsed, features: { ...DEFAULT_CONFIG.features, ...parsed.features } };
    }
  } catch {}
  return { ...DEFAULT_CONFIG };
}

// Save config to localStorage
export function saveAIConfig(config) {
  localStorage.setItem('day-planner-ai-config', JSON.stringify(config));
}

// Get base URL for a provider
function getBaseUrl(config) {
  switch (config.provider) {
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'anthropic':
      return 'https://api.anthropic.com/v1';
    case 'gemini':
      return `https://generativelanguage.googleapis.com/v1beta/models/${config.model}`;
    case 'ollama':
      return config.baseUrl || 'http://localhost:11434';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1';
    case 'custom':
      return config.baseUrl || '';
    default:
      // 国内服务商：预设地址优先，允许用户在 Base URL 里覆盖
      if (PROVIDER_BASE_URLS[config.provider]) {
        return config.baseUrl || PROVIDER_BASE_URLS[config.provider];
      }
      return '';
  }
}

// Retry a fetch-based operation with exponential backoff for transient errors
// (500, 502, 503, 504, 429, network failures). Retries up to 3 times.
async function withRetry(fn, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isRetryable =
        err.name === 'TypeError' ||                     // network failure / fetch error
        /\b(500|502|503|504|529)\b/.test(err.message) ||  // server errors
        /\b429\b/.test(err.message) ||                  // rate limit
        /overloaded/i.test(err.message);
      if (!isRetryable || attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, 1000 * 2 ** attempt)); // 1s, 2s, 4s
    }
  }
  throw lastError;
}

// Make a completion request to the configured provider (with automatic retry)
export async function aiComplete(systemPrompt, userMessage, config) {
  if (!config?.enabled || !config.apiKey && config.provider !== 'ollama') {
    throw new Error('AI is not configured');
  }

  return withRetry(() => _aiComplete(systemPrompt, userMessage, config));
}

async function _aiComplete(systemPrompt, userMessage, config) {
  return _aiCompleteMessages(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    config
  );
}

// Multi-turn variant: takes a full OpenAI-style messages array so the chat
// page can send history + system prompt + multimodal content parts.
async function _aiCompleteMessages(messages, config) {
  const { provider, apiKey, model } = config;

  // OpenAI 兼容协议统一走这里：openai / openrouter / custom + 全部国内服务商
  if (isOpenAICompat(provider)) {
      const base = provider === 'custom' ? (config.baseUrl || '') : getBaseUrl(config);
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      };
      if (provider === 'openrouter') headers['HTTP-Referer'] = 'https://dayglance.app';
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
          max_tokens: 4000,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `${PROVIDER_LABELS[provider] || provider} API error: ${res.status}`);
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content == null) throw new Error(`Unexpected response format from ${PROVIDER_LABELS[provider] || provider} API`);
      return stripThink(content);
  }

  switch (provider) {
    case 'anthropic': {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4000,
          system: messages.find(m => m.role === 'system')?.content || '',
          messages: messages.filter(m => m.role !== 'system'),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Anthropic API error: ${res.status}`);
      }
      const data = await res.json();
      const text = data.content?.[0]?.text;
      if (text == null) throw new Error('Unexpected response format from Anthropic API');
      return stripThink(text);
    }

    case 'gemini': {
      const base = getBaseUrl(config);
      const res = await fetch(`${base}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userMessage }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 4000 },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini API error: ${res.status}`);
      }
      const data = await res.json();
      const geminiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (geminiText == null) throw new Error('Unexpected response format from Gemini API');
      return stripThink(geminiText);
    }

    case 'ollama': {
      const base = config.baseUrl || 'http://localhost:11434';
      const res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: { num_predict: 4000 },
        }),
      });
      if (!res.ok) {
        throw new Error(`Ollama error: ${res.status}`);
      }
      const data = await res.json();
      return stripThink(data.message.content);
    }

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// Request JSON-structured output from the AI — parses and validates the response
export async function aiJSON(systemPrompt, userMessage, config) {
  const raw = await aiComplete(systemPrompt, userMessage, config);
  // Extract JSON from the response (handles ```json fences and bare JSON)
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!jsonMatch) {
    throw new Error('AI response did not contain valid JSON');
  }
  try {
    return JSON.parse(jsonMatch[1]);
  } catch {
    throw new Error('Failed to parse AI JSON response');
  }
}

// Check if a provider supports audio transcription
// openrouter does not expose a Whisper endpoint; anthropic/ollama have no transcription API.
export function supportsTranscription(config) {
  return ['openai', 'custom', 'gemini'].includes(config?.provider);
}

// Transcribe audio using the configured AI provider
// Uses OpenAI Whisper API for openai/custom, Gemini multimodal for gemini
export async function aiTranscribe(audioBlob, config) {
  if (!config?.enabled || (!config.apiKey && config.provider !== 'ollama')) {
    throw new Error('AI is not configured');
  }

  return withRetry(() => _aiTranscribe(audioBlob, config));
}

async function _aiTranscribe(audioBlob, config) {
  const { provider, apiKey, model } = config;

  switch (provider) {
    case 'openai':
    case 'custom': {
      const base = provider === 'custom' ? (config.baseUrl || '') : 'https://api.openai.com/v1';
      // m4a is AAC-in-MP4 (what iOS records); Whisper accepts it explicitly.
      // audio/mp4 blobs from the native bridge are m4a, not generic mp4 video.
      const ext = audioBlob.type?.includes('m4a') ? 'm4a'
                : audioBlob.type?.includes('mp4') ? 'm4a'
                : 'webm';
      const formData = new FormData();
      formData.append('file', audioBlob, `recording.${ext}`);
      formData.append('model', 'whisper-1');
      const res = await fetch(`${base}/audio/transcriptions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const hint = provider === 'custom' && res.status >= 500
          ? ' (your custom endpoint may not support audio transcription — try OpenAI or Gemini directly)'
          : '';
        throw new Error(err.error?.message || `Transcription API error: ${res.status}${hint}`);
      }
      const data = await res.json();
      return data.text;
    }

    case 'gemini': {
      const buffer = await audioBlob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      const base = `https://generativelanguage.googleapis.com/v1beta/models/${model}`;
      const res = await fetch(`${base}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: audioBlob.type || 'audio/webm', data: base64 } },
              { text: 'Transcribe this audio recording exactly as spoken. Return only the transcription text, nothing else.' }
            ]
          }]
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini transcription error: ${res.status}`);
      }
      const data = await res.json();
      const transcribedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (transcribedText == null) throw new Error('Unexpected response format from Gemini transcription API');
      return transcribedText;
    }

    default:
      throw new Error(`${PROVIDER_LABELS[provider] || provider} does not support audio transcription. Use the text input instead.`);
  }
}

// Test connection to the configured provider
export async function testConnection(config) {
  try {
    const result = await aiComplete(
      'You are a helpful assistant. Respond with exactly: "Connection successful"',
      'Test',
      { ...config, enabled: true }
    );
    return { success: true, message: result.trim() };
  } catch (err) {
    const isOllama = config.provider === 'ollama';
    const isNetworkError = err.message === 'Failed to fetch' || err.name === 'TypeError';
    return {
      success: false,
      message: err.message,
      ollamaHelp: isOllama && isNetworkError
        ? 'Could not reach Ollama. Make sure it\'s running and CORS is enabled for this origin. See setup guide →'
        : isOllama && !isNetworkError
        ? err.message
        : null,
    };
  }
}

// ===== 考研 fork: 多轮流式对话 =====

// 流式 <think> 过滤器。抑制 <think>...</think> 之间的内容，且不输出；
// 尾部可能截断的标签前缀会留在缓冲区，避免跨 chunk 拆开时漏过滤。
export function createThinkFilter() {
  let buf = '';
  let inThink = false;
  const OPEN = '<think>';
  const CLOSE = '</think>';
  return function push(chunk) {
    if (!chunk) return '';
    buf += chunk;
    let out = '';
    for (;;) {
      if (inThink) {
        const end = buf.indexOf(CLOSE);
        if (end === -1) { buf = ''; break; }
        buf = buf.slice(end + CLOSE.length);
        inThink = false;
        continue;
      }
      const start = buf.indexOf(OPEN);
      if (start === -1) {
        const hold = tailTagPrefix(buf);
        out += buf.slice(0, buf.length - hold);
        buf = hold ? buf.slice(buf.length - hold) : '';
        break;
      }
      out += buf.slice(0, start);
      buf = buf.slice(start + OPEN.length);
      inThink = true;
    }
    return out.replace(/<\|[^|]*?\|>/g, '');
  };
}

// buf 尾部是否是尚未闭合的 "<…" 前缀；返回需要保留的字符数
function tailTagPrefix(s) {
  const lt = s.lastIndexOf('<');
  if (lt === -1) return 0;
  if (s.indexOf('>', lt) !== -1) return 0;
  return Math.min(s.length - lt, 16);
}

/**
 * 多轮聊天。支持完整 messages（含 system 与多模态 content）、中止信号、
 * 以及流式增量回调。OpenAI 兼容端点走 SSE 流式；其余 provider 退化成
 * 一次性返回，但仍通过 onDelta 输出。
 */
export async function aiChat({ messages, config, model, signal, onDelta, maxTokens }) {
  if (!config?.enabled || (!config.apiKey && config.provider !== 'ollama')) {
    throw new Error('AI 未配置，请到设置 → AI 功能 启用并填写 API');
  }
  // 设置页可能没显式保存 provider；只要有 baseUrl 就按 OpenAI 兼容端点处理
  const provider = config.provider || (config.baseUrl ? 'custom' : 'openai');
  const cfg = { ...config, provider };
  const modelId = model || config.model;
  const filter = createThinkFilter();
  const emit = (text) => {
    if (!text) return;
    const clean = filter(text);
    if (clean && typeof onDelta === 'function') onDelta(clean);
  };

  const canStream = isOpenAICompat(provider);
  if (!canStream || typeof onDelta !== 'function') {
    const full = await withRetry(() => _aiCompleteMessages(messages, { ...cfg, model: modelId }));
    emit(full);
    return full;
  }

  const base = provider === 'custom' ? (cfg.baseUrl || '') : getBaseUrl(cfg);
  if (!base) throw new Error('缺少 Base URL，请到设置 → AI 功能 补全');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${cfg.apiKey}`,
  };
  if (provider === 'openrouter') headers['HTTP-Referer'] = 'https://dayglance.app';

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      model: modelId,
      messages,
      temperature: 0.3,
      max_tokens: maxTokens || 4000,
      stream: true,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    let detail = txt.slice(0, 300);
    try { detail = JSON.parse(txt)?.error?.message || detail; } catch {}
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }

  if (!res.body) {
    const data = await res.json().catch(() => ({}));
    const content = data.choices?.[0]?.message?.content || '';
    emit(content);
    return stripThink(content);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  const consumeLine = (line) => {
    const t = line.trim();
    if (!t.startsWith('data:')) return;
    const payload = t.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    try {
      const json = JSON.parse(payload);
      const delta = json.choices?.[0]?.delta?.content;
      if (delta) { full += delta; emit(delta); }
    } catch {}
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) consumeLine(line);
  }
  if (buffer.trim()) consumeLine(buffer);

  return stripThink(full);
}

export { DEFAULT_CONFIG, PROVIDER_MODELS, PROVIDER_LABELS };
