// AIChatPage.jsx
// ChatGPT 风格的 AI 对话页面: 文本输入 + 语音 + 拍照 + 文件上传
// 调用 aiConfig.baseUrl (OpenAI 兼容), 持久化消息到 localStorage
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, Send, Mic, MicOff, Camera, Paperclip, X, ChevronDown,
  Sparkles, User, Bot, StopCircle, Image as ImageIcon, FileText,
  RotateCcw, Trash2,
} from 'lucide-react';
import { useDayPlannerCtx } from '../context/DayPlannerContext.jsx';
import { useFeaturesCtx } from '../context/FeaturesContext.jsx';
import { useTranslation } from 'react-i18next';

const STORAGE_KEY = 'kaoyan-ai-chat-history';

const SUGGESTIONS = [
  { icon: '📚', title: '今日计划', desc: '基于今天日历给我一份 3-5 步的执行清单' },
  { icon: '🧮', title: '数学答疑', desc: '把这道题的做法讲一下' },
  { icon: '📝', title: '英语长难句', desc: '拆解这句的结构和翻译' },
  { icon: '🎯', title: '进度复盘', desc: '根据本周完成情况给下周建议' },
];

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}
function saveHistory(msgs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-200))); } catch {}
}

const AIChatPage = () => {
  const { t } = useTranslation();
  const { aiConfig } = useFeaturesCtx();
  const { cardBg, borderClass, textPrimary, textSecondary, darkMode } = useDayPlannerCtx();

  const [messages, setMessages] = useState(() => loadHistory());
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]); // [{kind:'image'|'file', name, dataUrl}]
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [error, setError] = useState('');

  const scrollerRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingTimerRef = useRef(null);

  // 初始化模型选择
  useEffect(() => {
    if (aiConfig?.model && !selectedModel) {
      setSelectedModel(aiConfig.model);
    }
  }, [aiConfig?.model]);

  // 持久化
  useEffect(() => { saveHistory(messages); }, [messages]);

  // 自动滚到底
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  // AI 未配置
  if (!aiConfig?.enabled) {
    return (
      <div className={`flex flex-col items-center justify-center h-full p-6 ${cardBg}`}>
        <Sparkles size={48} className="text-purple-500 mb-4" />
        <h2 className={`text-lg font-bold ${textPrimary} mb-2`}>AI 未启用</h2>
        <p className={`text-sm ${textSecondary} text-center mb-4`}>
          请在 设置 → AI 功能 中启用并配置 API
        </p>
        <div className="text-xs text-gray-400 text-center max-w-xs">
          推荐 Custom (兼容 OpenAI) +<br/>
          <code className="font-mono">https://api.minimaxi.com/v1</code>
        </div>
      </div>
    );
  }

  if (!aiConfig.baseUrl || !aiConfig.apiKey) {
    return (
      <div className={`flex flex-col items-center justify-center h-full p-6 ${cardBg}`}>
        <Sparkles size={48} className="text-amber-500 mb-4" />
        <h2 className={`text-lg font-bold ${textPrimary} mb-2`}>AI 配置不完整</h2>
        <p className={`text-sm ${textSecondary} text-center`}>
          缺少 Base URL 或 API Key<br/>请到设置中补全
        </p>
      </div>
    );
  }

  // === 核心: 调用 AI ===
  const callAI = useCallback(async (userMessages) => {
    const url = (aiConfig.baseUrl || '').replace(/\/+$/, '') + '/chat/completions';
    const body = {
      model: selectedModel || aiConfig.model || 'MiniMax-M3',
      messages: userMessages,
      stream: false,
    };
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiConfig.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
    }
    const data = await r.json();
    return data.choices?.[0]?.message?.content || '(无回复)';
  }, [aiConfig, selectedModel]);

  // === 发送消息 ===
  const sendMessage = useCallback(async (overrideText) => {
    const text = (overrideText ?? input).trim();
    if (!text && attachments.length === 0) return;
    if (isStreaming) return;

    // 构造 user content (支持多模态简化: 文本 + attachment 描述)
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
      role: 'user',
      content: userContent.length === 1 && userContent[0].type === 'text'
        ? userContent[0].text
        : userContent,
      ts: Date.now(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setAttachments([]);
    setError('');
    setIsStreaming(true);

    // 准备给 AI 的 messages (只发 role + content, 不要 ts)
    const aiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));

    try {
      const reply = await callAI(aiMessages);
      setMessages(prev => [...prev, { role: 'assistant', content: reply, ts: Date.now() }]);
    } catch (err) {
      setError(err.message || '请求失败');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ 请求失败: ${err.message || '网络错误'}`,
        ts: Date.now(),
        isError: true,
      }]);
    } finally {
      setIsStreaming(false);
    }
  }, [input, attachments, messages, isStreaming, callAI]);

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

  const removeAttachment = (idx) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const newChat = () => {
    if (messages.length > 0 && !confirm('清空当前对话?')) return;
    setMessages([]);
    setAttachments([]);
    setError('');
  };

  const removeMessage = (idx) => {
    setMessages(prev => prev.filter((_, i) => i !== idx));
  };

  // === 渲染 ===
  return (
    <div className={`flex flex-col h-full ${cardBg}`}>
      {/* 顶部 bar */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${borderClass} flex-shrink-0`}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Sparkles size={16} className="text-white" />
          </div>
          <div>
            <div className={`font-bold text-sm ${textPrimary}`}>考研 AI</div>
            <button
              onClick={() => setShowModelPicker(!showModelPicker)}
              className={`text-[10px] ${textSecondary} flex items-center gap-0.5`}
            >
              {selectedModel || aiConfig.model || '选择模型'}
              <ChevronDown size={10} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={newChat}
            className={`p-2 rounded-lg ${textSecondary} hover:bg-gray-100 dark:hover:bg-gray-800`}
            title="新对话"
          >
            <Plus size={18} />
          </button>
        </div>
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
                <button onClick={() => setSelectedModel('MiniMax-M3')} className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">MiniMax-M3</button>
                <button onClick={() => setSelectedModel('MiniMax-Text-01')} className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">MiniMax-Text-01</button>
                <button onClick={() => setSelectedModel('gpt-4o-mini')} className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">gpt-4o-mini</button>
                <button onClick={() => setSelectedModel('claude-3-5-sonnet')} className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">claude-3-5-sonnet</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 消息区 */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <EmptyState onPick={sendMessage} />
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((m, idx) => (
              <MessageBubble
                key={idx}
                message={m}
                onRemove={() => removeMessage(idx)}
                onRegenerate={m.role === 'assistant' && idx === messages.length - 1
                  ? () => {
                      // 删最后一条, 重新发
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
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                  <Bot size={14} className="text-white" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-gray-400 mb-1">AI 正在思考</div>
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
        {/* 附件预览 */}
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

        {/* 输入框 */}
        <div className="max-w-3xl mx-auto">
          <div className={`flex items-end gap-2 p-2 rounded-2xl border ${borderClass} ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm`}>
            {/* 附件按钮 */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`p-2 ${textSecondary} hover:text-blue-500 flex-shrink-0`}
              title="上传文件"
            >
              <Paperclip size={18} />
            </button>
            {/* 拍照 */}
            <button
              onClick={() => cameraInputRef.current?.click()}
              className={`p-2 ${textSecondary} hover:text-blue-500 flex-shrink-0`}
              title="拍照"
            >
              <Camera size={18} />
            </button>
            {/* 文本框 */}
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
              placeholder={isRecording ? `🎤 录音中... ${recordingTime}s` : '输入消息, Enter 发送, Shift+Enter 换行'}
              rows={1}
              className={`flex-1 resize-none bg-transparent ${textPrimary} text-sm focus:outline-none max-h-32`}
              style={{ minHeight: '24px' }}
              onInput={e => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
              }}
            />
            {/* 语音按钮 */}
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`p-2 flex-shrink-0 ${isRecording ? 'text-red-500 animate-pulse' : textSecondary + ' hover:text-blue-500'}`}
              title={isRecording ? '停止录音' : '语音输入'}
            >
              {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            {/* 发送 */}
            <button
              onClick={() => sendMessage()}
              disabled={(!input.trim() && attachments.length === 0) || isStreaming}
              className={`p-2 rounded-full flex-shrink-0 ${
                (input.trim() || attachments.length > 0) && !isStreaming
                  ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
              }`}
              title="发送"
            >
              {isStreaming ? <StopCircle size={18} /> : <Send size={18} />}
            </button>
          </div>
          <div className={`text-[10px] text-center mt-1 ${textSecondary}`}>
            消息会保存在本地浏览器, 不上传云端
          </div>
        </div>

        {/* 隐藏的 input */}
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
const EmptyState = ({ onPick }) => {
  const { cardBg, textPrimary, textSecondary, borderClass } = useDayPlannerCtx();
  return (
    <div className="max-w-3xl mx-auto flex flex-col items-center justify-center h-full">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4">
        <Sparkles size={32} className="text-white" />
      </div>
      <h2 className={`text-xl font-bold ${textPrimary} mb-1`}>考研 AI</h2>
      <p className={`text-sm ${textSecondary} mb-8`}>我能帮你学习, 答疑, 计划, 复盘</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
        {SUGGESTIONS.map((s, i) => (
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
    </div>
  );
};

// 消息气泡
const MessageBubble = ({ message, onRemove, onRegenerate }) => {
  const { textSecondary } = useDayPlannerCtx();
  const isUser = message.role === 'user';
  const content = typeof message.content === 'string'
    ? message.content
    : message.content?.map(c => c.text || `[${c.type}]`).join(' ') || '';
  const images = typeof message.content === 'object'
    ? message.content?.filter(c => c.type === 'image_url').map(c => c.image_url?.url) || []
    : [];

  return (
    <div className={`flex gap-3 items-start group ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
        isUser
          ? 'bg-gradient-to-br from-blue-500 to-cyan-500'
          : 'bg-gradient-to-br from-purple-500 to-pink-500'
      }`}>
        {isUser ? <User size={14} className="text-white" /> : <Bot size={14} className="text-white" />}
      </div>
      <div className={`flex-1 min-w-0 ${isUser ? 'flex flex-col items-end' : ''}`}>
        <div className={`text-xs ${textSecondary} mb-1 ${isUser ? 'text-right' : ''}`}>
          {isUser ? '你' : 'AI'} · {new Date(message.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </div>
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
      </div>
    </div>
  );
};

export default AIChatPage;
