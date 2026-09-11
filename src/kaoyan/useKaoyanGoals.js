// 考研 fork: 把 6 Agent 接进 dayglance 原生目标 / 任务体系
//
// 设计原则：不新造一套数据，而是复用 dayglance 自己的 Goal / Project / Task，
// 这样 Goaldashboard、时间轴、云同步、Obsidian 插件全都天然可用，
// 进度也由 agenda-core 的 duration 加权算法自动累加。
import { useCallback, useMemo } from 'react';
import { useDayPlannerCtx } from '../context/DayPlannerContext.jsx';
import { calculateGoalProgress } from '../utils/goalProgress.js';
import {
  KAOYAN_AGENT_KEYS,
  KAOYAN_MARK,
  buildGoalFields,
  buildProjectFields,
  buildDailyTaskObjects,
  todayStr,
} from './agentGoals.js';

const uid = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function useKaoyanGoals() {
  const ctx = useDayPlannerCtx() || {};
  const { goals = [], projects = [], tasks = [], addGoal, addProject, updateGoal, setTasks } = ctx;

  const findGoal = useCallback(
    (key) => goals.find(g => g?.[KAOYAN_MARK] === key) || null,
    [goals]
  );
  const findProject = useCallback(
    (key) => projects.find(p => p?.[KAOYAN_MARK] === key) || null,
    [projects]
  );

  // 幂等：已存在就返回，缺失才创建。每个 agent = 1 个 Goal + 1 个「每日任务」Project
  // 另做「定义同步」：agentGoals.js 是唯一事实来源，改了标题/描述/截止日期要能传导到已建目标，
  // 否则修正 EXAM_DATE 之类的改动对老设备无效。
  const ensureGoal = useCallback((key) => {
    const fields = buildGoalFields(key);
    if (!fields) return null;
    let goal = goals.find(g => g?.[KAOYAN_MARK] === key) || null;
    if (!goal && typeof addGoal === 'function') {
      goal = addGoal(fields);
    }
    if (!goal) return null;

    if (typeof updateGoal === 'function') {
      const drift = {};
      for (const k of ['title', 'description', 'targetDate', 'color']) {
        if (fields[k] != null && goal[k] !== fields[k]) drift[k] = fields[k];
      }
      if (Object.keys(drift).length > 0) updateGoal(goal.id, drift);
    }

    let project = projects.find(p => p?.[KAOYAN_MARK] === key) || null;
    if (!project && typeof addProject === 'function') {
      project = addProject(buildProjectFields(key, goal.id));
    }
    return { goal, project: project || null };
  }, [goals, projects, addGoal, addProject, updateGoal]);

  const ensureAll = useCallback(() => {
    let created = 0;
    for (const key of KAOYAN_AGENT_KEYS) {
      const before = goals.some(g => g?.[KAOYAN_MARK] === key);
      ensureGoal(key);
      if (!before) created += 1;
    }
    return created;
  }, [goals, ensureGoal]);

  // 导入某个 agent 的今日任务；同项目 + 同日期 + 同标题视为重复，跳过
  const importDaily = useCallback((key, dateStr = todayStr()) => {
    const ensured = ensureGoal(key);
    const project = ensured?.project || projects.find(p => p?.[KAOYAN_MARK] === key);
    if (!project || typeof setTasks !== 'function') return 0;
    const existing = new Set(
      tasks.filter(t => t.projectId === project.id && t.date === dateStr).map(t => t.title)
    );
    const fresh = buildDailyTaskObjects(key, project.id, dateStr, uid)
      .filter(t => !existing.has(t.title));
    if (fresh.length > 0) setTasks(prev => [...prev, ...fresh]);
    return fresh.length;
  }, [ensureGoal, projects, tasks, setTasks]);

  const importAllToday = useCallback((dateStr = todayStr()) => {
    let n = 0;
    for (const key of KAOYAN_AGENT_KEYS) n += importDaily(key, dateStr);
    return n;
  }, [importDaily]);

  // 目标进度（0..1），来自 agenda-core 的 duration 加权计算
  const progressOf = useCallback((key) => {
    const goal = goals.find(g => g?.[KAOYAN_MARK] === key);
    if (!goal) return 0;
    return calculateGoalProgress(goal.id, projects, tasks);
  }, [goals, projects, tasks]);

  const todayStatsOf = useCallback((key, dateStr = todayStr()) => {
    const project = projects.find(p => p?.[KAOYAN_MARK] === key);
    if (!project) return { total: 0, done: 0 };
    const list = tasks.filter(t => t.projectId === project.id && t.date === dateStr);
    return { total: list.length, done: list.filter(t => t.completed).length };
  }, [projects, tasks]);

  const todayTasksOf = useCallback((key, dateStr = todayStr()) => {
    const project = projects.find(p => p?.[KAOYAN_MARK] === key);
    if (!project) return [];
    return tasks.filter(t => t.projectId === project.id && t.date === dateStr);
  }, [projects, tasks]);

  const toggleTask = useCallback((taskId) => {
    if (typeof setTasks !== 'function') return;
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const completed = !t.completed;
      return {
        ...t,
        completed,
        completedAt: completed ? new Date().toISOString() : null,
      };
    }));
  }, [setTasks]);

  // 6 个 agent 的汇总卡片数据
  const summary = useMemo(() => KAOYAN_AGENT_KEYS.map(key => {
    const goal = goals.find(g => g?.[KAOYAN_MARK] === key);
    const project = projects.find(p => p?.[KAOYAN_MARK] === key);
    const list = project ? tasks.filter(t => t.projectId === project.id) : [];
    return {
      key,
      hasGoal: !!goal,
      progress: goal ? calculateGoalProgress(goal.id, projects, tasks) : 0,
      total: list.length,
      done: list.filter(t => t.completed).length,
    };
  }), [goals, projects, tasks]);

  return {
    agentKeys: KAOYAN_AGENT_KEYS,
    findGoal,
    findProject,
    ensureGoal,
    ensureAll,
    importDaily,
    importAllToday,
    progressOf,
    todayStatsOf,
    todayTasksOf,
    toggleTask,
    summary,
    todayStr,
  };
}

export default useKaoyanGoals;
