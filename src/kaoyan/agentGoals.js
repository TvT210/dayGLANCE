// 考研 fork: 6 Agent → 目标 / 每日任务 的映射定义
//
// 这里只放纯数据与纯函数（不依赖 React / localStorage），方便单测。
// 目标与任务最终落到 dayglance 原生模型:
//   Goal    { id, title, description, color, status, targetDate }
//   Project { id, goalId, title, status }
//   Task    { id, projectId, title, date, startTime, duration, completed }
// 进度由 agenda-core 的 calculateGoalProgress 按 duration 加权自动累加。

// 打在自建对象上的标记，用于幂等重建（换设备/清数据后能重新生成，且不会重复）
export const KAOYAN_MARK = 'kaoyan-agent';

// 2027 考研初试：2026-12-19（12 月倒数第 2 周的周六）
export const EXAM_DATE = '2026-12-19';

// 6 个 agent 的目标定义。key 必须与 src/ai.js 的 AGENTS 对齐。
export const KAOYAN_AGENT_GOALS = {
  math: {
    title: '考研数学一 130+',
    description: '张宇基础 30 讲 + 1000 题 / 武忠祥严选题；真题 2005-2024 二刷；李林 6+4、张宇 8+4 模拟。',
    color: 'bg-green-500',
    targetDate: EXAM_DATE,
  },
  english: {
    title: '考研英语一 75+ / CET-6 425+',
    description: '5500 词 3 轮；真题阅读 2005-2024 二刷；2 套作文模板；完形 + 新题型 + 翻译后期补。',
    color: 'bg-blue-500',
    targetDate: EXAM_DATE,
  },
  politics: {
    title: '考研政治 75-80',
    description: '徐涛强化班 + 肖秀荣 1000 题二刷 + 肖四肖八 + 腿姐冲刺时政。',
    color: 'bg-red-500',
    targetDate: EXAM_DATE,
  },
  cs: {
    title: '408 专业课 120+',
    description: '王道四科单科书 + 课后题；408 真题 2010-2024 三刷；选择 / 大题分开练。',
    color: 'bg-amber-500',
    targetDate: EXAM_DATE,
  },
  fitness: {
    title: '体能保持 · 每周 4 练',
    description: '周一/二/四/五 17:30-19:00 健身房，部位轮换；睡眠不足 6h 跳过当日训练。',
    color: 'bg-purple-500',
    targetDate: EXAM_DATE,
  },
  health: {
    title: '健康红线 · 睡眠 7h+',
    description: '睡眠 7h+（底线 6h）；用眼 50/10；久坐 1h 活动 5min；三餐规律，早餐必吃。',
    color: 'bg-pink-500',
    targetDate: EXAM_DATE,
  },
};

// 每个 agent 的每日任务模板。duration 单位分钟，用于目标进度的加权计算。
export const KAOYAN_DAILY_TASKS = {
  math: [
    { title: '高数/线代/概率 视频 + 笔记 90min', duration: 90 },
    { title: '教材例题 20 题', duration: 60 },
    { title: '1000 题 / 严选题 20 题', duration: 60 },
    { title: '错题回顾 10 道', duration: 30 },
  ],
  english: [
    { title: '词汇 5500 40 词（新词 20 + 复习 20）', duration: 30 },
    { title: '长难句 1 篇（分析 + 翻译）', duration: 30 },
    { title: '阅读真题 1 篇 + 精读', duration: 45 },
    { title: '听力 30 min', duration: 30 },
  ],
  politics: [
    { title: '徐涛视频 30 min', duration: 30 },
    { title: '1000 题 30 题', duration: 30 },
    { title: '时政 10 min', duration: 10 },
  ],
  cs: [
    { title: '数据结构 / 计组 教材 + 笔记 60min', duration: 60 },
    { title: '王道课后题 15 题', duration: 45 },
    { title: '代码手写 1 题', duration: 30 },
  ],
  fitness: [
    { title: '力量训练 60 min（部位轮换）', duration: 60 },
    { title: '有氧 30 min', duration: 30 },
    { title: '训练后蛋白 + 碳水', duration: 10 },
  ],
  health: [
    { title: '今晚睡眠 7h+', duration: 5 },
    { title: '早餐', duration: 5 },
    { title: '用眼休息 50/10（≥3 次）', duration: 5 },
    { title: '起身活动 5 min/h（≥6 次）', duration: 5 },
  ],
};

// 6 个 agent 的展示顺序（通用助手不产生目标）
export const KAOYAN_AGENT_KEYS = ['math', 'english', 'politics', 'cs', 'fitness', 'health'];

/** 生成 dayglance Goal 的字段（addGoal 会补 id / createdAt / status） */
export function buildGoalFields(agentKey) {
  const def = KAOYAN_AGENT_GOALS[agentKey];
  if (!def) return null;
  return {
    title: def.title,
    description: def.description,
    color: def.color,
    targetDate: def.targetDate,
    status: 'active',
    [KAOYAN_MARK]: agentKey,
  };
}

/** 生成 dayglance Project 的字段（addProject 会补 id / createdAt / status） */
export function buildProjectFields(agentKey, goalId) {
  if (!KAOYAN_AGENT_GOALS[agentKey]) return null;
  return {
    title: `${KAOYAN_AGENT_GOALS[agentKey].title} · 每日任务`,
    goalId,
    status: 'active',
    color: KAOYAN_AGENT_GOALS[agentKey].color,
    [KAOYAN_MARK]: agentKey,
  };
}

/**
 * 生成一天的任务对象数组（调用方负责 setTasks）。
 * all-day：不占用时间轴，避免与已注入的 ICS 考研日程冲突。
 */
export function buildDailyTaskObjects(agentKey, projectId, dateStr, makeId) {
  const tpl = KAOYAN_DAILY_TASKS[agentKey];
  if (!tpl) return [];
  return tpl.map(item => ({
    id: makeId(),
    title: item.title,
    projectId,
    date: dateStr,
    startTime: '00:00',
    isAllDay: true,
    duration: item.duration,
    completed: false,
    notes: '',
    subtasks: [],
    color: KAOYAN_AGENT_GOALS[agentKey]?.color || 'bg-gray-500',
    [KAOYAN_MARK]: agentKey,
  }));
}

/** 本地时区的 YYYY-MM-DD（不要用 toISOString，会按 UTC 偏移一天） */
export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
