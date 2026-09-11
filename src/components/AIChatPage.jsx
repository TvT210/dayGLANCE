// AIChatPage.jsx
// ChatGPT 风格的 AI 对话页面: 6 Agent 专家 + 文本输入 + 语音 + 拍照 + 文件上传
// 统一走 src/ai.js 的 aiChat（多轮 + 流式 + <think> 实时过滤）
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Plus, Send, Mic, MicOff, Camera, Paperclip, X, ChevronDown,
  Sparkles, User, Bot, StopCircle, FileText,
  RotateCcw, Trash2, Target,
} from 'lucide-react';
import { useDayPlannerCtx } from '../context/DayPlannerContext.jsx';
import { useFeaturesCtx } from '../context/FeaturesContext.jsx';
import { useTranslation } from 'react-i18next';
import { AGENTS, getCurrentAgent, setCurrentAgent, aiChat } from '../ai.js';
import { agentPromptByKey } from '../ai-prompts.js';
import KaoyanGoalsPanel from '../kaoyan/KaoyanGoalsPanel.jsx';

const LEGACY_STORAGE_KEY = 'kaoyan-ai-chat-history';
const STORE_KEY = 'kaoyan-ai-chat-store-v1';

const uid = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

// 每个 agent 一套历史，key 与 AGENTS 对齐
function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) || {};
  } catch {}
  // 迁移旧的单会话历史到「通用助手」
  try {
    const old = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '[]');
    if (Array.isArray(old) && old.length > 0) return { general: old };
  } catch {}
  return {};
}

function saveStore(store) {
  try {
    const trimmed = {};
    for (const [k, v] of Object.entries(store || {})) {
      trimmed[k] = (v || []).slice(-200);
    }
    localStorage.setItem(STORE_KEY, JSON.stringify(trimmed));
  } catch {}
}

const GENERAL_SYSTEM = `你是邱松鑫的考研备考助手。他是广东技术师范大学网络工程专业学生，目标 2027 考研（初试 2026-12）。
回答要具体、可执行，给出明确的时长/题量/章节，不要空泛的"多练多看"。
不要输出 <think> 标签，不要输出 <|im_end|> <|im_start|> 这类内部 token，只用干净的标准 Markdown。`;

const SUGGESTIONS = {
  general: [
    { icon: '📚', title: '今日计划', desc: '基于今天日历给我一份 3-5 步的执行清单' },
    { icon: '🧮', title: '数学答疑', desc: '把这道题的做法讲一下' },
    { icon: '📝', title: '英语长难句', desc: '拆解这句的结构和翻译' },
    { icon: '🎯', title: '进度复盘', desc: '根据本周完成情况给下周建议' },
  ],
  english: [
    { icon: '📖', title: '今日词汇', desc: '给我今天要背的 40 个核心词，带例句' },
    { icon: '📝', title: '长难句', desc: '拆解这句的结构并给出翻译思路' },
    { icon: '📄', title: '阅读精读', desc: '这道题为什么选这个答案，其他选项错在哪' },
    { icon: '✍️', title: '作文批改', desc: '帮我改这段作文，指出语法和高级表达' },
  ],
  politics: [
    { icon: '📕', title: '马原考点', desc: '这一章的核心考点和易错点' },
    { icon: '📰', title: '时政梳理', desc: '本月时政要点和可能的出题角度' },
    { icon: '✅', title: '1000 题答疑', desc: '这道题的解析和相关知识点' },
    { icon: '🗓️', title: '冲刺排期', desc: '距离初试还有 100 天，怎么安排政治' },
  ],
  math: [
    { icon: '🧮', title: '题目求解', desc: '这道题怎么做，考点是什么' },
    { icon: '📐', title: '概念辨析', desc: '这两个概念的区别和联系' },
    { icon: '⚠️', title: '易错点', desc: '这类题我总错，帮我总结易错点' },
    { icon: '📊', title: '真题规划', desc: '真题该怎么刷，时间怎么分配' },
  ],
  cs: [
    { icon: '🌳', title: '数据结构', desc: '这个算法的时间复杂度和手写代码' },
    { icon: '🖥️', title: '操作系统', desc: '进程调度/内存管理这块怎么考' },
    { icon: '🔌', title: '计算机网络', desc: '这一层的协议和典型计算题' },
    { icon: '🧩', title: '组成原理', desc: '这个部件的工作原理和考点' },
  ],
  fitness: [
    { icon: '🏋️', title: '今日训练', desc: '今天练什么部位，具体动作和组数' },
    { icon: '🍗', title: '饮食安排', desc: '训练前后的饮食怎么吃' },
    { icon: '😴', title: '疲劳调整', desc: '这几天很累，训练要不要减量' },
    { icon: '📈', title: '计划进阶', desc: '三个月后怎么调整训练计划' },
  ],
  health: [
    { icon: '😴', title: '睡眠优化', desc: '睡不够怎么办，怎么提高效率' },
    { icon: '👀', title: '用眼保护', desc: '长时间看书眼睛累怎么缓解' },
    { icon: '🧘', title: '焦虑缓解', desc: '最近很焦虑，怎么办' },
    { icon: '🍚', title: '三餐安排', desc: '考研期间的饮食怎么安排' },
  ],
};

const AIChatPage = () => {
  const { t } = useTranslation();
  const { aiConfig } = useFeaturesCtx() || {};
  const { cardBg, borderClass, textPrimary, textSecondary, darkMode } = useDayPlannerCtx();

  const [agent, setAgent] = useState(() => getCurrentAgent());
  const [store, setStore] = useState(() => loadStore());
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [error, setError] = useState('');
  const [showGoals, setShowGoals] = useState(false);

  const scrollerRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const abortRef = useRef(null);

  const messages = useMemo(() => store[agent] || [], [store, agent]);
  const setMessages = useCallback((updater) => {
    setStore(prev => {
      const cur = prev[agent] || [];
      const next = typeof updater === 'function' ? updater(cur) : updater;
      return { ...prev, [agent]: next };
    });
  }, [agent]);

  // 初始化模型选择
  useEffect(() => {
    if (aiConfig?.model && !selectedModel) {
      setSelectedModel(aiConfig.model);
    }
  }, [aiConfig?.model]);

  // 持久化
  useEffect(() => { saveStore(store); }, [store]);

  // 自动滚到底
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  // 切换 agent
  const switchAgent = useCallback((key) => {
    if (!AGENTS[key]) return;
    setCurrentAgent(key);
    setAgent(key);
    setError('');
    setAttachments([]);
  }, []);

  // 未配置 provider 但有 baseUrl 时按 OpenAI 兼容端点处理
  const effectiveConfig = useMemo(() => ({
    ...(aiConfig || {}),
    provider: aiConfig?.provider || (aiConfig?.baseUrl ? 'custom' : 'openai'),
  }), [aiConfig]);

  const systemPrompt = useMemo(
    () => agentPromptByKey(agent) || GENERAL_SYSTEM,
    [agent]
  );

  // === 发送消息（流式） ===
  const sendMessage = useCallback(async (overrideText) => {
    const text = (overrideText ?? input).trim();
    if (!text && attachments.length === 0) return;
    if (isStreaming) return;

    // 构造 user content (多模态: 文本 + 图片)
    const userContent = [];
    if (text) userContent.push({ type: 'text', text });
    for (const att of attachments) {
      if (att.kind === 'image') {
        userContent.push({ type: 'image_url', image_url: { url: att.dataUrl } });
        userContent.push({ type: 'text', text: `[图片: ${att.name}]` });
      } else {
        userContent.push({ type: 'text', text: `[文件: ${att.name}]` });
      }
    }

    const userMsg = {
      id: uid(),
      role: 'user',
      content: userContent.length === 1 && userContent[0].type === 'text'
        ? userContent[0].text
        : userContent,
      ts: Date.now(),
    };

    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setAttachments([]);
    setError('');
    setIsStreaming(true);

    // 给 AI 的 messages: system + 历史（去掉 ts/id 等 UI 字段）
    const aiMessages = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : m.content,
      })),
    ];

    const replyId = uid();
    setMessages(prev => [...prev, { id: replyId, role: 'assistant', content: '', ts: Date.now() }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await aiChat({
        messages: aiMessages,
        config: effectiveConfig,
        model: selectedModel || aiConfig.model,
        signal: controller.signal,
        onDelta: (delta) => {
          setMessages(prev => prev.map(m =>
            m.id === replyId ? { ...m, content: m.content + delta } : m
          ));
        },
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === replyId && !m.content ? { ...m, content: '（已停止生成）' } : m
        ));
      } else {
        const msg = err?.message || '网络错误';
        setError(msg);
        setMessages(prev => prev.map(m =>
          m.id === replyId
            ? { ...m, content: `❌ 请求失败: ${msg}`, isError: true }
            : m
        ));
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, attachments, messages, isStreaming, systemPrompt, effectiveConfig, selectedModel, aiConfig, setMessages]);

  const stopGenerating = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  // === 录音 (Web Speech API) ===
  const startRecording = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError('当前浏览器不支持语音识别');
      return;
    }
    const rec = new SR();
    rec.lang = 'zh-CN';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setInput(prev => (prev ? prev + ' ' : '') + text);
    };
    rec.onerror = (e) => setError('语音识别错误: ' + e.error);
    rec.onend = () => {
      setIsRecording(false);
      setRecordingTime(0);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
    rec.start();
    mediaRecorderRef.current = rec;
    setIsRecording(true);
    setRecordingTime(0);
    recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    setIsRecording(false);
  }, []);

  // === 文件处理 ===
  const handleFiles = useCallback((files) => {
    const fileArr = Array.from(files);
    const promises = fileArr.map(file => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const isImage = file.type.startsWith('image/');
        resolve({
          kind: isImage ? 'image' : 'file',
          name: file.name,
          size: file.size,
          dataUrl: reader.result,
        });
      };
      reader.readAsDataURL(file);
    }));
    Promise.all(promises).then(newOnes => {
      setAttachments(prev => [...prev, ...newOnes]);
    });
  }, []);

  // 目标面板不依赖 AI 配置，未配置时也要能进（放在配置检查之前）
  if (showGoals) {
    return <KaoyanGoalsPanel onClose={() => setShowGoals(false)} />;
  }

  // AI 未配置（所有 hooks 之后才可提前 return，否则 hook 数量会变化）
  if (!aiConfig?.enabled) {
    return (
      <div className={`flex flex-col items-center justify-center h-full p-6 ${cardBg}`}>
        <Sparkles size={48} className="text-purple-500 mb-4" />
        <h2 className={`text-lg font-bold ${textPrimary} mb-2`}>AI 未启用</h2>
        <p className={`text-sm ${textSecondary} text-center mb-4`}>
          请在 设置 → AI 功能 中启用并配置 API
        </p>
        <div className="text-xs text-gray-400 text-center max-w-xs mb-6">
          推荐 Custom (兼容 OpenAI) +<br/>
          <code className="font-mono">https://api.minimaxi.com/v1</code>
        </div>
        <button
          onClick={() => setShowGoals(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm"
        >
          <Target size={15} /> 考研目标 · 每日任务
        </button>
        <div className={`text-[10px] ${textSecondary} mt-2`}>不依赖 AI，可以直接用</div>
      </div>
    );
  }

  if (!aiConfig.baseUrl || !aiConfig.apiKey) {
    return (
      <div className={`flex flex-col items-center justify-center h-full p-6 ${cardBg}`}>
        <Sparkles size={48} className="text-amber-500 mb-4" />
        <h2 className={`text-lg font-bold ${textPrimary} mb-2`}>AI 配置不完整</h2>
        <p className={`text-sm ${textSecondary} text-center mb-4`}>
          缺少 Base URL 或 API Key<br/>请到设置中补全
        </p>
        <button
          onClick={() => setShowGoals(true)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border ${borderClass} text-sm ${textPrimary}`}
        >
          <Target size={15} /> 考研目标 · 每日任务
        </button>
      </div>
    );
  }

  const removeAttachment = (idx) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const newChat = () => {
    if (messages.length > 0 && !confirm('清空当前专家的对话?')) return;
    setMessages([]);
    setAttachments([]);
    setError('');
  };

  const removeMessage = (idx) => {
    setMessages(prev => prev.filter((_, i) => i !== idx));
  };

  const currentAgent = AGENTS[agent] || AGENTS.general;
  const suggestions = SUGGESTIONS[agent] || SUGGESTIONS.general;

  // === 渲染 ===
  return (
    <div className={`flex flex-col h-full ${cardBg}`}>
      {/* 顶部 bar */}
      <div className={`flex items-center justify-between px-4 py-2.5 border-b ${borderClass} flex-shrink-0`}>
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: currentAgent.color }}
          >
            <span className="text-base">{currentAgent.icon}</span>
          </div>
          <div className="min-w-0">
            <div className={`font-bold text-sm ${textPrimary} truncate`}>{currentAgent.name}</div>
            <button
              onClick={() => setShowModelPicker(!showModelPicker)}
              className={`text-[10px] ${textSecondary} flex items-center gap-0.5`}
            >
              {selectedModel || aiConfig.model || '选择模型'}
              <ChevronDown size={10} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setShowGoals(true)}
            className={`p-2 rounded-lg ${textSecondary} hover:bg-gray-100 dark:hover:bg-gray-800`}
            title="考研目标 · 每日任务"
          >
            <Target size={18} />
          </button>
          <button
            onClick={newChat}
            className={`p-2 rounded-lg ${textSecondary} hover:bg-gray-100 dark:hover:bg-gray-800`}
            title="新对话"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* 6 Agent 切换器 */}
      <div className={`flex gap-1.5 overflow-x-auto px-3 py-2 border-b ${borderClass} flex-shrink-0 scrollbar-none`}>
        {Object.entries(AGENTS).map(([key, a]) => {
          const active = key === agent;
          const count = (store[key] || []).length;
          return (
            <button
              key={key}
              onClick={() => switchAgent(key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs whitespace-nowrap flex-shrink-0 transition-colors ${
                active ? 'text-white' : (darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600')
              }`}
              style={active ? { backgroundColor: a.color } : undefined}
            >
              <span>{a.icon}</span>
              <span>{a.name.replace('专家', '')}</span>
              {count > 0 && !active && (
                <span className="text-[9px] opacity-60">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 模型选择下拉 */}
      {showModelPicker && (
        <div className={`${cardBg} border-b ${borderClass} px-4 py-2 flex-shrink-0`}>
          <input
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            placeholder={aiConfig.model || '输入模型名'}
            className={`w-full px-3 py-1.5 text-sm border ${borderClass} rounded-lg ${darkMode ? 'bg-gray-800 text-white' : 'bg-white'}`}
          />
          <div className="flex gap-1 mt-2 flex-wrap">
            {(aiConfig.provider === 'custom' || !aiConfig.provider) && (
              <>
                <button onClick={() => setSelectedModel('deepseek-v4-flash')} className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">deepseek-v4-flash</button>
                <button onClick={() => setSelectedModel('glm-5.3')} className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">glm-5.3</button>
                <button onClick={() => setSelectedModel('qwen3.8-max')} className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">qwen3.8-max</button>
                <button onClick={() => setSelectedModel('claude-sonnet-5')} className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">claude-sonnet-5</button>
                <button onClick={() => setSelectedModel('gemini-3.8-flash')} className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">gemini-3.8-flash</button>
                <button onClick={() => setSelectedModel('doubao-seed-evolving')} className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">doubao-seed-evolving</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 消息区 */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <EmptyState
            onPick={sendMessage}
            agent={currentAgent}
            suggestions={suggestions}
            onOpenGoals={() => setShowGoals(true)}
          />
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((m, idx) => (
              <MessageBubble
                key={m.id || idx}
                message={m}
                agent={currentAgent}
                onRemove={() => removeMessage(idx)}
                onRegenerate={m.role === 'assistant' && idx === messages.length - 1
                  ? () => {
                      setMessages(prev => prev.slice(0, -1));
                      const lastUser = [...messages].reverse().find(x => x.role === 'user');
                      if (lastUser) {
                        setTimeout(() => sendMessage(typeof lastUser.content === 'string' ? lastUser.content : ''), 100);
                      }
                    }
                  : null
                }
              />
            ))}
            {isStreaming && (
              <div className="flex gap-3 items-start">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: currentAgent.color }}
                >
                  <Bot size={14} className="text-white" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-gray-400 mb-1">思考中</div>
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-4 mb-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300">
          {error}
          <button onClick={() => setError('')} className="float-right"><X size={12} /></button>
        </div>
      )}

      {/* 输入区 */}
      <div className={`border-t ${borderClass} px-3 py-3 flex-shrink-0 ${cardBg}`}>
        {attachments.length > 0 && (
          <div className="max-w-3xl mx-auto mb-2 flex flex-wrap gap-2">
            {attachments.map((a, i) => (
              <div key={i} className="relative group">
                {a.kind === 'image' ? (
                  <img src={a.dataUrl} alt={a.name} className="w-16 h-16 object-cover rounded-lg border" />
                ) : (
                  <div className="w-32 h-16 px-2 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center gap-2 border">
                    <FileText size={20} className="text-gray-500 flex-shrink-0" />
                    <div className="text-[10px] truncate flex-1">{a.name}</div>
                  </div>
                )}
                <button
                  onClick={() => removeAttachment(i)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="max-w-3xl mx-auto">
          <div className={`flex items-end gap-2 p-2 rounded-2xl border ${borderClass} ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm`}>
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`p-2 ${textSecondary} hover:text-blue-500 flex-shrink-0`}
              title="上传文件"
            >
              <Paperclip size={18} />
            </button>
            <button
              onClick={() => cameraInputRef.current?.click()}
              className={`p-2 ${textSecondary} hover:text-blue-500 flex-shrink-0`}
              title="拍照"
            >
              <Camera size={18} />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={isRecording ? `🎤 录音中... ${recordingTime}s` : `问${currentAgent.name}... Enter 发送`}
              rows={1}
              className={`flex-1 resize-none bg-transparent ${textPrimary} text-sm focus:outline-none max-h-32`}
              style={{ minHeight: '24px' }}
              onInput={e => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
              }}
            />
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`p-2 flex-shrink-0 ${isRecording ? 'text-red-500 animate-pulse' : textSecondary + ' hover:text-blue-500'}`}
              title={isRecording ? '停止录音' : '语音输入'}
            >
              {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button
              onClick={isStreaming ? stopGenerating : () => sendMessage()}
              disabled={!isStreaming && (!input.trim() && attachments.length === 0)}
              className={`p-2 rounded-full flex-shrink-0 ${
                isStreaming
                  ? 'bg-red-500 text-white'
                  : (input.trim() || attachments.length > 0)
                    ? 'text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
              }`}
              style={!isStreaming && (input.trim() || attachments.length > 0) ? { backgroundColor: currentAgent.color } : undefined}
              title={isStreaming ? '停止生成' : '发送'}
            >
              {isStreaming ? <StopCircle size={18} /> : <Send size={18} />}
            </button>
          </div>
          <div className={`text-[10px] text-center mt-1 ${textSecondary}`}>
            各专家独立记忆 · 消息仅存本地浏览器
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.md,.doc,.docx"
          onChange={e => handleFiles(e.target.files)}
          className="hidden"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={e => handleFiles(e.target.files)}
          className="hidden"
        />
      </div>
    </div>
  );
};

// 空状态 (欢迎页)
const EmptyState = ({ onPick, agent, suggestions, onOpenGoals }) => {
  const { cardBg, textPrimary, textSecondary, borderClass } = useDayPlannerCtx();
  return (
    <div className="max-w-3xl mx-auto flex flex-col items-center justify-center h-full">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 text-3xl"
        style={{ backgroundColor: agent.color }}
      >
        {agent.icon}
      </div>
      <h2 className={`text-xl font-bold ${textPrimary} mb-1`}>{agent.name}</h2>
      <p className={`text-sm ${textSecondary} mb-8`}>我能帮你学习, 答疑, 计划, 复盘</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onPick(s.desc)}
            className={`text-left p-3 rounded-xl border ${borderClass} ${cardBg} hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors`}
          >
            <div className="text-xl mb-1">{s.icon}</div>
            <div className={`font-semibold text-sm ${textPrimary} mb-0.5`}>{s.title}</div>
            <div className={`text-xs ${textSecondary}`}>{s.desc}</div>
          </button>
        ))}
      </div>
      <button
        onClick={onOpenGoals}
        className={`mt-6 text-xs ${textSecondary} underline`}
      >
        查看考研目标与每日任务
      </button>
    </div>
  );
};

// 消息气泡
const MessageBubble = ({ message, agent, onRemove, onRegenerate }) => {
  const { textSecondary } = useDayPlannerCtx();
  const isUser = message.role === 'user';
  const content = typeof message.content === 'string'
    ? message.content
    : message.content?.map(c => c.text || `[${c.type}]`).join(' ') || '';
  const images = typeof message.content === 'object'
    ? message.content?.filter(c => c.type === 'image_url').map(c => c.image_url?.url) || []
    : [];
  const empty = !isUser && !content && !images.length;

  return (
    <div className={`flex gap-3 items-start group ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: isUser ? '#3b82f6' : agent.color,
        }}
      >
        {isUser ? <User size={14} className="text-white" /> : <span className="text-sm">{agent.icon}</span>}
      </div>
      <div className={`flex-1 min-w-0 ${isUser ? 'flex flex-col items-end' : ''}`}>
        <div className={`text-xs ${textSecondary} mb-1 ${isUser ? 'text-right' : ''}`}>
          {isUser ? '你' : agent.name} · {new Date(message.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </div>
        {!empty && (
          <div className={`inline-block max-w-[85%] rounded-2xl px-4 py-2.5 ${
            isUser
              ? 'bg-gradient-to-br from-blue-500 to-cyan-500 text-white'
              : message.isError
                ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
          }`}>
            {images.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {images.map((src, i) => (
                  <img key={i} src={src} alt="" className="max-w-[200px] max-h-[200px] rounded-lg" />
                ))}
              </div>
            )}
            <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
              {content}
            </div>
          </div>
        )}
        {!empty && (
          <div className={`opacity-0 group-hover:opacity-100 transition-opacity mt-1 flex gap-2 ${isUser ? 'justify-end' : ''}`}>
            {onRegenerate && (
              <button onClick={onRegenerate} className={`text-[10px] ${textSecondary} hover:text-blue-500 flex items-center gap-0.5`}>
                <RotateCcw size={10} /> 重新生成
              </button>
            )}
            <button onClick={onRemove} className={`text-[10px] ${textSecondary} hover:text-red-500 flex items-center gap-0.5`}>
              <Trash2 size={10} /> 删除
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIChatPage;
