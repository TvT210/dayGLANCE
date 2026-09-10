// 考研 fork: 6 Agent 目标进度 + 每日任务面板
// 数据完全来自 dayglance 原生 Goal/Project/Task，进度按 duration 加权自动累加。
import React, { useState } from 'react';
import { X, Target, Check, ChevronDown, Download, Sparkles } from 'lucide-react';
import { useDayPlannerCtx } from '../context/DayPlannerContext.jsx';
import { AGENTS } from '../ai.js';
import { KAOYAN_AGENT_GOALS } from './agentGoals.js';
import useKaoyanGoals from './useKaoyanGoals.js';

const KaoyanGoalsPanel = ({ onClose }) => {
  const { cardBg, borderClass, textPrimary, textSecondary, darkMode } = useDayPlannerCtx();
  const {
    agentKeys, ensureAll, ensureGoal, importDaily, importAllToday,
    progressOf, todayTasksOf, todayStatsOf, toggleTask, summary, todayStr,
  } = useKaoyanGoals();

  const [expanded, setExpanded] = useState(null);
  const [toast, setToast] = useState('');

  const date = todayStr();
  const missing = summary.filter(s => !s.hasGoal).length;

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  };

  const handleCreateAll = () => {
    const n = ensureAll();
    flash(n > 0 ? `已创建 ${n} 个考研目标` : '目标已存在');
  };

  const handleImportAll = () => {
    const n = importAllToday(date);
    flash(n > 0 ? `已导入 ${n} 条今日任务` : '今日任务已导入过');
  };

  const pct = (p) => Math.round((p || 0) * 100);

  return (
    <div className={`flex flex-col h-full ${cardBg}`}>
      <div className={`flex items-center justify-between px-4 py-3 border-b ${borderClass} flex-shrink-0`}>
        <div className="flex items-center gap-2">
          <Target size={18} className="text-emerald-500" />
          <div>
            <div className={`font-bold text-sm ${textPrimary}`}>考研目标 · 每日任务</div>
            <div className={`text-[10px] ${textSecondary}`}>完成打卡后目标进度自动累加</div>
          </div>
        </div>
        <button onClick={onClose} className={`p-2 rounded-lg ${textSecondary}`} title="关闭">
          <X size={18} />
        </button>
      </div>

      <div className="flex gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <button
          onClick={handleCreateAll}
          className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-emerald-500 text-white text-xs font-medium"
        >
          <Sparkles size={13} />
          {missing > 0 ? `生成 6 个目标` : '目标已就绪'}
        </button>
        <button
          onClick={handleImportAll}
          className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border ${borderClass} text-xs font-medium ${textPrimary}`}
        >
          <Download size={13} />
          导入今日任务
        </button>
      </div>

      {toast && (
        <div className="mx-4 mt-3 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-xs text-center">
          {toast}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {agentKeys.map(key => {
          const agent = AGENTS[key] || { name: key, icon: '🎯', color: '#7f8c8d' };
          const def = KAOYAN_AGENT_GOALS[key] || {};
          const stat = summary.find(s => s.key === key) || { hasGoal: false, progress: 0 };
          const today = todayStatsOf(key, date);
          const isOpen = expanded === key;
          const tasks = isOpen ? todayTasksOf(key, date) : [];

          return (
            <div key={key} className={`rounded-xl border ${borderClass} overflow-hidden`}>
              <button
                onClick={() => {
                  if (!stat.hasGoal) ensureGoal(key);
                  setExpanded(isOpen ? null : key);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
              >
                <span className="text-lg flex-shrink-0">{agent.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${textPrimary} truncate`}>
                    {def.title || agent.name}
                  </div>
                  <div className={`text-[10px] ${textSecondary}`}>
                    {stat.hasGoal
                      ? `今日 ${today.done}/${today.total} · 累计 ${pct(progressOf(key))}%`
                      : '点击生成目标'}
                  </div>
                </div>
                <div className="w-14 flex-shrink-0">
                  <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct(stat.progress)}%`, backgroundColor: agent.color }}
                    />
                  </div>
                </div>
                <ChevronDown
                  size={14}
                  className={`${textSecondary} flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isOpen && (
                <div className={`px-3 pb-3 pt-1 border-t ${borderClass}`}>
                  {tasks.length === 0 ? (
                    <button
                      onClick={() => {
                        const n = importDaily(key, date);
                        flash(n > 0 ? `已导入 ${n} 条任务` : '今日任务已导入过');
                      }}
                      className="w-full py-2 text-xs text-emerald-600 dark:text-emerald-400"
                    >
                      导入今日任务模板
                    </button>
                  ) : (
                    <div className="space-y-1">
                      {tasks.map(t => (
                        <button
                          key={t.id}
                          onClick={() => toggleTask(t.id)}
                          className="w-full flex items-center gap-2 py-1.5 text-left"
                        >
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                              t.completed
                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                : 'border-gray-300 dark:border-gray-600'
                            }`}
                          >
                            {t.completed && <Check size={11} />}
                          </span>
                          <span
                            className={`text-xs flex-1 ${
                              t.completed
                                ? 'line-through text-gray-400'
                                : darkMode ? 'text-gray-100' : 'text-gray-800'
                            }`}
                          >
                            {t.title}
                          </span>
                          <span className={`text-[10px] ${textSecondary} flex-shrink-0`}>
                            {t.duration || 30}m
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={`px-4 py-2 text-[10px] text-center ${textSecondary} border-t ${borderClass}`}>
        目标与任务存在本地，Goals 页和时间轴同步可见
      </div>
    </div>
  );
};

export default KaoyanGoalsPanel;
