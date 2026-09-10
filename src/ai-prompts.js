// AI Prompt templates for each feature

// --- AI Subtask Generation ---

export function aiSubtasksSystemPrompt() {
  return `You are a project decomposition assistant. Break a task into 3–8 concrete, actionable subtasks. Each subtask must be completable in one focused work session.

Return ONLY valid JSON with this exact structure:
{
  "subtasks": [
    { "title": "Short actionable step", "duration": 30 }
  ]
}

"duration" is estimated minutes (whole numbers: 15, 20, 30, 45, 60, 90, 120). Be concise — subtask titles should be 2–8 words. No preamble or explanation outside the JSON.`;
}

export function aiSubtasksUserPrompt({ title, notes }) {
  const lines = [`Task: "${title}"`];
  if (notes && notes.trim()) lines.push(`Notes: "${notes.trim()}"`);
  return lines.join('\n');
}

// --- AI Rescheduling (incomplete tasks → future frame slots) ---

export function rescheduleSystemPrompt() {
  return `You are a GTD scheduling assistant for a day planner app. Reschedule incomplete tasks from today into available future time slots following these heuristics:

HEURISTICS:
- Only use future dates (tomorrow and beyond) — never today
- Spread across days: Distribute tasks across available days — do NOT cram everything into a single day
- Deadline-first: Tasks with approaching deadlines get earliest placement
- Tag grouping: Batch tasks with similar tags into the same frame when possible
- Priority weighting: High-priority tasks (3) go in high-energy frames first
- Energy matching: Tasks with complex/deep-work tags go in high-energy frames, routine tasks in low-energy
- Duration fitting: Don't split tasks; only place a task if its full duration fits in the slot
- Buffer respect: The buffer time between tasks is already accounted for in the available slots
- Don't overfill: Leave breathing room — don't schedule more than 75% of any single day's available frame time
- If a task doesn't fit any available slot, mark it as unplaceable with a clear reason

Return ONLY valid JSON (no markdown fences, no explanation text outside the JSON) with this exact structure:
{
  "placements": [
    { "taskId": "...", "date": "YYYY-MM-DD", "time": "HH:MM", "frameLabel": "...", "reasoning": "one sentence" }
  ],
  "unplaceable": [
    { "taskId": "...", "reason": "why it can't be placed" }
  ]
}`;
}

export function rescheduleUserPrompt({ todayDate, slots, tasks }) {
  const slotLines = slots.map(s => {
    let line = `- ${s.date} | ${s.start}-${s.end} (${s.minutes}min) | Frame: "${s.frameLabel}" | Energy: ${s.energyLevel}`;
    if (s.tagAffinity && s.tagAffinity.length) line += ` | Tags: ${s.tagAffinity.join(', ')}`;
    return line;
  }).join('\n');

  const taskLines = tasks.map(t => {
    let line = `- ID: ${t.id} | "${t.title}" | ${t.duration}min | Priority: ${t.priority}/3`;
    if (t.deadline) line += ` | Deadline: ${t.deadline}`;
    if (t.tags && t.tags.length) line += ` | Tags: ${t.tags.join(', ')}`;
    return line;
  }).join('\n');

  return `Today is ${todayDate}.\n\nAVAILABLE FUTURE SLOTS (tomorrow and beyond):\n${slotLines || 'No slots available.'}\n\nINCOMPLETE TASKS TO RESCHEDULE:\n${taskLines || 'No tasks.'}\n\nReschedule as many tasks as possible into future slots. Return ONLY the JSON.`;
}

// --- Frame Nudge (contextual "what to do now" suggestion) ---

export function frameNudgeSystemPrompt() {
  return `You are a task-matching assistant for a day planner. Given the user's active time block and a list of candidate tasks, pick the single best task to work on right now.

Consider:
- Tag affinity (HIGHEST priority): if the frame has tag affinity, ONLY pick tasks whose tags list contains at least one of those exact tags. Do NOT infer tags from task titles — use only the tags field provided. If no tasks match the tag affinity exactly, then ignore tag affinity and fall back to other criteria.
- Energy level match: high energy → deep/complex work, low energy → admin/easy tasks
- Available time (HARD CONSTRAINT): NEVER suggest a task whose duration exceeds minutesRemaining. Tasks with no duration listed may be suggested freely.

Return ONLY valid JSON with this structure:
{ "taskId": "<id from candidates>", "taskTitle": "<task title>", "reason": "<one short sentence why this task fits now>" }`;
}

export function frameNudgeUserPrompt({ currentTimeStr, activeFrame, candidates }) {
  const lines = [
    `Current time: ${currentTimeStr}`,
    `Active frame: "${activeFrame.label}" (${activeFrame.energyLevel} energy, ${activeFrame.minutesRemaining} min remaining)`,
  ];
  if (activeFrame.tagAffinity?.length > 0) {
    lines.push(`Frame tag affinity: ${activeFrame.tagAffinity.join(', ')}`);
  }
  lines.push(`\nCandidate tasks (pick one):`);
  candidates.forEach(t => {
    let line = `- id: ${t.id} | "${t.title}"`;
    if (t.tags && t.tags.length > 0) line += ` | tags: ${t.tags.join(', ')}`;
    if (t.duration) line += ` | ~${t.duration}min`;
    if (t.isInbox) line += ' | (inbox)';
    lines.push(line);
  });
  return lines.join('\n');
}

// --- AI Task Suggestion (duration + tags) ---

export function taskSuggestSystemPrompt() {
  return `You are a task duration estimator for a day planner app. Given a task title and the user's existing tag vocabulary, return a JSON object with:
- "duration": estimated minutes. Must be one of: 15, 30, 45, 60, 90, 120, 180, 240
- "tags": array of 1-2 relevant tags (pick only the best fit). Prefer tags from the known list. If none fit well, create short lowercase single-word or hyphenated tags.

Return ONLY valid JSON, no explanation. Example: {"duration": 30, "tags": ["work"]}`;
}

export function taskSuggestUserPrompt({ title, existingTags }) {
  const tagList = existingTags.length > 0 ? existingTags.join(', ') : 'none yet';
  return `Task: "${title}"\nKnown tags: ${tagList}`;
}

export function voiceParseSystemPrompt(context) {
  const { todayDate, existingTags, timezone, existingTasks } = context;
  return `You are a task assistant for a day planner app. The user will give you a voice transcript (natural language). Determine their intent:

1. **Creating new tasks** — they describe tasks to add
2. **Editing existing tasks** — they want to modify, move, delete, complete, rename, or re-prioritize tasks that already exist

IMPORTANT — Detect edits vs new tasks:
- These words/phrases signal an EDIT to an existing task, NOT a new task: "reschedule", "move", "change", "make it", "set to", "push to", "bump", "shift", "delete", "remove", "cancel", "complete", "finish", "mark as done", "done with", "rename", "shorten", "lengthen", "extend", "prioritize", "deprioritize", "tag", "untag"
- If the user references an existing task from the list below by name and says what to do with it, that is an EDIT
- Only create a NEW task when the user describes something that does not already exist in their task list

CRITICAL: Always return a JSON **object** (not an array):
{
  "newTasks": [...],
  "edits": [...]
}

If only creating tasks, "edits" should be []. If only editing, "newTasks" should be [].

### New Tasks format
Each object:
- "title": string — concise task title (imperative/action-oriented)
- "tags": string[] — relevant tags. Reuse from existing: [${existingTags.map(t => `"${t}"`).join(', ')}]. Lowercase, no # prefix.
- "date": string|null — ISO "YYYY-MM-DD" if mentioned, null for inbox. Today is ${todayDate}.
- "time": string|null — "HH:MM" (24h) if specified, null otherwise
- "duration": number — estimated minutes (default 30)
- "priority": number — 0=none, 1=low, 2=medium, 3=high. Infer from urgency words.
- "deadline": string|null — ISO date if a due date is mentioned
- "notes": string — extra context, or empty string

### Edit Commands format
Each object must have "action" and "taskMatch":
- "taskMatch": string — a substring that uniquely identifies the target task (case-insensitive). Pick the most distinctive part of the title.
- "action" + additional fields:
  - "move": "date" (string|null), "time" (string|null) — new date and/or time. Use null to keep unchanged. "reschedule X to 2pm" → move with time "14:00". "move X to tomorrow" → move with date.
  - "changeDuration": "duration" (number) — new duration in minutes
  - "rename": "newTitle" (string) — new task title
  - "delete": (no extra fields)
  - "complete": (no extra fields)
  - "uncomplete": (no extra fields)
  - "changePriority": "priority" (number 0-3)
  - "addTag": "tag" (string, lowercase, no #)
  - "removeTag": "tag" (string, lowercase, no #)

${timezone ? `The user's timezone is ${timezone}.` : ''}

### Existing tasks for reference:
${existingTasks || 'No tasks currently.'}

Rules:
- If the transcript mentions multiple tasks/edits, return all of them
- Be smart about splitting: "call mom and pick up groceries" = 2 new tasks
- But "buy milk and eggs" = 1 task (single errand)
- Infer reasonable tags from context (e.g. "gym" → "fitness")
- For edits, match "taskMatch" against the existing tasks listed above — use a distinctive substring of the task title
- Interpret relative dates ("tomorrow", "next Monday") relative to today (${todayDate})
- "reschedule standup to 2pm" → edit: move, time "14:00"
- "move standup to tomorrow" → edit: move, date tomorrow
- "change meeting to 45 minutes" → edit: changeDuration 45
- "mark report as done" → edit: complete
- "delete groceries" → edit: delete
- "rename report to quarterly report" → edit: rename
- "make presentation high priority" → edit: changePriority 3
- NEVER return a bare JSON array — always return the {"newTasks": [], "edits": []} object
- Return ONLY the JSON object, no other text`;
}

export function voiceParseUserPrompt(transcript) {
  return `Parse this voice transcript into new tasks and/or edit commands:\n\n"${transcript}"`;
}

// --- Phase 2: Morning dayGLANCE ---

export function morningSummarySystemPrompt() {
  return `You are a friendly daily planner assistant. Generate a concise, warm morning briefing based on the user's schedule data. Write in second person ("You have...").

Rules:
- Keep it to 2-4 short sentences
- Lead with the most important thing (deadlines, high-priority tasks, heavy/light day)
- Mention the number of tasks and approximate time commitment; treat calendar events as committed time when judging whether the day is heavy or light
- If there are calendar events (meetings, appointments), weave them into the briefing naturally
- If there are deadlines today or upcoming, highlight them
- If the day is light, note the free time positively
- If there are overdue/incomplete tasks from yesterday, mention them gently
- If there are inbox items, suggest scheduling them
- End with a brief encouraging note — not cheesy, just natural
- Do NOT use markdown, bullet points, or formatting — plain text only
- Do NOT use emojis`;
}

export function morningSummaryUserPrompt(data) {
  const { todayDate, dayOfWeek, scheduledTasks, recurringTasks, calendarEvents = [], inboxCount, projectTaskCount = 0, overdueTasks, deadlinesToday, upcomingDeadlines, totalMinutes } = data;
  const lines = [`Today is ${dayOfWeek}, ${todayDate}.`];

  if (calendarEvents.length > 0) {
    lines.push(`Calendar events today (${calendarEvents.length}): ${calendarEvents.map(t => {
      if (t.isAllDay) return `${t.title} (all day)`;
      let s = t.time ? `${t.title} at ${t.time}` : t.title;
      if (t.duration) s += ` (${t.duration}min)`;
      return s;
    }).join('; ')}.`);
  }

  if (scheduledTasks.length > 0) {
    lines.push(`Scheduled tasks (${scheduledTasks.length}): ${scheduledTasks.map(t => {
      let s = t.title;
      if (t.time) s += ` at ${t.time}`;
      if (t.priority === 3) s += ' [HIGH PRIORITY]';
      return s;
    }).join('; ')}.`);
  } else {
    lines.push('No tasks scheduled for today.');
  }

  if (recurringTasks.length > 0) {
    lines.push(`Recurring tasks today (${recurringTasks.length}): ${recurringTasks.map(t => t.title + (t.time ? ` at ${t.time}` : '')).join('; ')}.`);
  }

  lines.push(`Total committed time: ${Math.round(totalMinutes / 60 * 10) / 10} hours (${totalMinutes} min) — includes tasks and timed calendar events.`);

  if (deadlinesToday.length > 0) {
    lines.push(`DEADLINES TODAY: ${deadlinesToday.map(t => t.title).join(', ')}.`);
  }

  if (upcomingDeadlines.length > 0) {
    lines.push(`Upcoming deadlines this week: ${upcomingDeadlines.map(t => `${t.title} (${t.deadline})`).join('; ')}.`);
  }

  if (overdueTasks.length > 0) {
    lines.push(`Overdue from previous days: ${overdueTasks.map(t => t.title).join(', ')}.`);
  }

  if (inboxCount > 0 || projectTaskCount > 0) {
    const parts = [];
    if (inboxCount > 0) parts.push(`${inboxCount} unscheduled task${inboxCount === 1 ? '' : 's'} in inbox`);
    if (projectTaskCount > 0) parts.push(`${projectTaskCount} task${projectTaskCount === 1 ? '' : 's'} assigned to projects (not yet scheduled)`);
    lines.push(parts.join('; ') + '.');
  }

  return lines.join('\n');
}

// --- Evening Reflection ---

export function eveningReflectionSystemPrompt() {
  return `You are a warm productivity assistant helping a user close out their day. Generate a brief, grounded evening reflection based on their schedule data. Write in second person ("You finished...").

Rules:
- Keep it to 2-4 short sentences
- Open by acknowledging what was accomplished — be specific about high-priority completions if any
- If tasks went undone, note it briefly and neutrally (not critically)
- Suggest 1-2 concrete things worth putting on tomorrow's plate from the inbox or incomplete list, if any exist
- If tomorrow already has tasks scheduled, briefly acknowledge what's coming
- Close with a brief, natural wind-down note — not motivational-poster cheesy, just human
- Do NOT use markdown, bullet points, or formatting — plain text only
- Do NOT use emojis`;
}

export function eveningReflectionUserPrompt(data) {
  const { todayDate, dayOfWeek, completedTasks, incompleteTasks, completionRate, tomorrowTasks, tomorrowCalendarEvents = [], inboxSuggestions } = data;
  const lines = [`Today is ${dayOfWeek}, ${todayDate}.`];

  if (completedTasks.length > 0) {
    lines.push(`Completed today (${completedTasks.length}): ${completedTasks.map(t => {
      let s = t.title;
      if (t.priority === 3) s += ' [HIGH PRIORITY]';
      return s;
    }).join('; ')}.`);
  } else {
    lines.push('No tasks were completed today.');
  }

  if (incompleteTasks.length > 0) {
    lines.push(`Left incomplete (${incompleteTasks.length}): ${incompleteTasks.map(t => {
      let s = t.title;
      if (t.priority === 3) s += ' [HIGH PRIORITY]';
      return s;
    }).join('; ')}.`);
  }

  lines.push(`Completion rate: ${completionRate}%.`);

  if (tomorrowTasks.length > 0 || tomorrowCalendarEvents.length > 0) {
    const taskParts = tomorrowTasks.map(t => t.title + (t.time ? ` at ${t.time}` : ''));
    const eventParts = tomorrowCalendarEvents.map(t =>
      t.isAllDay ? `${t.title} (all day, calendar)` : `${t.title}${t.time ? ` at ${t.time}` : ''} (calendar)`
    );
    const all = [...taskParts, ...eventParts];
    lines.push(`Already on tomorrow's plate (${all.length}): ${all.join('; ')}.`);
  }

  const suggestions = [
    ...incompleteTasks.map(t => ({ ...t, source: 'incomplete' })),
    ...inboxSuggestions.map(t => ({ ...t, source: 'inbox' })),
  ].slice(0, 4);
  if (suggestions.length > 0) {
    lines.push(`To consider for tomorrow (incomplete tasks and top inbox items): ${suggestions.map(t => {
      let s = t.title;
      if (t.priority === 3) s += ' [HIGH PRIORITY]';
      return s;
    }).join('; ')}.`);
  }

  return lines.join('\n');
}

// --- Phase 3: Enhanced Weekly dayGLANCE ---

export function weeklySummarySystemPrompt() {
  return `You are a friendly productivity coach reviewing a user's week in a day planner app. Generate a concise, insightful weekly summary based on the stats provided.

Rules:
- Write 3-5 short sentences of natural-language analysis
- Comment on the completion rate — celebrate if high, encourage if low
- If there's a clear best day or pattern, mention it
- If recurring tasks have low completion, note which ones gently
- If there are many incomplete tasks, suggest prioritizing or breaking them down
- Mention any notable tag patterns if data is available
- If habit data is provided, comment on consistency — celebrate streaks, gently note habits that were missed frequently
- If frame utilization data is provided, highlight underutilized frames (below 30%) or overloaded ones (above 100%) as actionable observations
- If goals and projects data is provided: mention per-project task completion for projects that had activity this week, call out goal progress % and days remaining to target when relevant, and gently flag any stalled projects (no completions in 7+ days)
- End with a brief forward-looking note for next week
- Do NOT use markdown, bullet points, headers, or formatting — plain text only
- Do NOT use emojis
- Be warm and constructive, never critical`;
}

export function weeklySummaryUserPrompt(data) {
  const { dateRange, tasksCompleted, tasksScheduled, completionRate, timeSpent, timePlanned, focusMinutes,
    recurringCompleted, recurringScheduled, bestDay, bestDayCount,
    incompleteCount, tagBreakdown, inboxCount, projectTaskCount = 0,
    nextWeekTaskCount = 0, nextWeekTopTasks = [], nextWeekCalendarEvents = [],
    habitStats = [], frameStats = [],
    goalStats = [], projectStats = [] } = data;

  const lines = [`Week: ${dateRange}.`];
  lines.push(`Tasks completed: ${tasksCompleted} of ${tasksScheduled} (${completionRate}% completion rate).`);
  lines.push(`Time spent: ${timeSpent} min of ${timePlanned} min planned.`);

  if (focusMinutes > 0) {
    lines.push(`Focus time: ${focusMinutes} min.`);
  }

  lines.push(`Recurring tasks: ${recurringCompleted} of ${recurringScheduled} completed.`);

  if (bestDay) {
    lines.push(`Best day: ${bestDay} with ${bestDayCount} tasks completed.`);
  }

  if (incompleteCount > 0) {
    lines.push(`${incompleteCount} tasks were left incomplete.`);
  }

  if (tagBreakdown && tagBreakdown.length > 0) {
    lines.push(`Tag breakdown: ${tagBreakdown.map(t => `#${t.tag}: ${t.completed}/${t.total}`).join(', ')}.`);
  }

  if (inboxCount > 0 || projectTaskCount > 0) {
    const parts = [];
    if (inboxCount > 0) parts.push(`${inboxCount} task${inboxCount === 1 ? '' : 's'} in inbox`);
    if (projectTaskCount > 0) parts.push(`${projectTaskCount} task${projectTaskCount === 1 ? '' : 's'} assigned to projects (not yet scheduled)`);
    lines.push(parts.join('; ') + '.');
  }

  if (habitStats.length > 0) {
    lines.push(`Habit tracking: ${habitStats.map(h =>
      `${h.name}: ${h.daysHit}/7 days (${h.type === 'limit' ? 'stayed under limit' : 'hit target'})`
    ).join(', ')}.`);
  }

  if (frameStats.length > 0) {
    lines.push(`Frame utilization: ${frameStats.map(f =>
      `${f.label}: ${f.utilizationPct}% (${f.scheduledMin} of ${f.totalCapacityMin} min scheduled)`
    ).join(', ')}.`);
  }

  if (goalStats.length > 0) {
    lines.push(`Goals: ${goalStats.map(g => {
      let s = `"${g.title}" — ${g.progressPct}% complete`;
      if (g.daysToTarget !== null) {
        if (g.daysToTarget < 0) s += ` (${Math.abs(g.daysToTarget)} days overdue)`;
        else if (g.daysToTarget === 0) s += ' (target date: today)';
        else s += ` (${g.daysToTarget} days to target)`;
      }
      return s;
    }).join('; ')}.`);
  }

  if (projectStats.length > 0) {
    const activeProjects = projectStats.filter(p => p.weekTotal > 0);
    const stalledProjects = projectStats.filter(p => p.stalled);
    if (activeProjects.length > 0) {
      lines.push(`Project activity this week: ${activeProjects.map(p =>
        `"${p.title}" — ${p.weekCompleted}/${p.weekTotal} tasks completed${
          p.overallProgressPct === null ? '' : ` (${p.overallProgressPct}% overall)`}`
      ).join('; ')}.`);
    }
    if (stalledProjects.length > 0) {
      lines.push(`Stalled projects (no completions in 7+ days): ${stalledProjects.map(p => `"${p.title}"`).join(', ')}.`);
    }
  }

  lines.push(`\nNext week: ${nextWeekTaskCount} task(s) already scheduled.`);
  if (nextWeekTopTasks.length > 0) {
    lines.push(`Notable tasks next week: ${nextWeekTopTasks.map(t => {
      let s = `${t.title} (${t.date})`;
      if (t.priority === 3) s += ' [HIGH PRIORITY]';
      return s;
    }).join('; ')}.`);
  }
  if (nextWeekCalendarEvents.length > 0) {
    lines.push(`Calendar events next week: ${nextWeekCalendarEvents.map(t =>
      t.isAllDay ? `${t.title} on ${t.date} (all day)` : `${t.title} on ${t.date}${t.time ? ` at ${t.time}` : ''}`
    ).join('; ')}.`);
  }

  return lines.join('\n');
}

// --- Phase 4: Smart Scheduling ---

export function smartScheduleSystemPrompt() {
  return `You are a GTD scheduling assistant for a day planner app. Place inbox tasks into available time slots following these heuristics:

HEURISTICS:
- Spread across days: Distribute tasks across all available days — do NOT cram everything into a single day. Use tomorrow and the day after, not just today.
- Deadline-first: Tasks with approaching deadlines get earliest placement
- Tag grouping: Batch tasks with similar tags into the same frame when possible
- Priority weighting: High-priority tasks (3) go in high-energy frames first
- Energy matching: Tasks with complex/deep-work tags go in high-energy frames, routine tasks in low-energy
- Duration fitting: Don't split tasks; only place a task if its full duration fits in the slot
- Buffer respect: The buffer time between tasks is already accounted for in the available slots
- Don't overfill: Leave some breathing room — don't schedule more than 75% of any single day's available frame time. Spill remaining tasks into subsequent days.
- If a task doesn't fit any available slot, mark it as unplaceable with a clear reason

Return ONLY valid JSON (no markdown fences, no explanation text outside the JSON) with this exact structure:
{
  "placements": [
    { "taskId": "...", "date": "YYYY-MM-DD", "time": "HH:MM", "frameLabel": "...", "reasoning": "one sentence" }
  ],
  "unplaceable": [
    { "taskId": "...", "reason": "why it can't be placed" }
  ]
}`;
}

export function smartScheduleUserPrompt(data) {
  const { todayDate, slots, tasks } = data;
  const slotLines = slots.map(function(s) {
    var line = '- ' + s.date + ' | ' + s.start + '-' + s.end + ' (' + s.minutes + 'min) | Frame: "' + s.frameLabel + '" | Energy: ' + s.energyLevel;
    if (s.tagAffinity && s.tagAffinity.length) line += ' | Tags: ' + s.tagAffinity.join(', ');
    return line;
  }).join('\n');

  const taskLines = tasks.map(function(t) {
    var line = '- ID: ' + t.id + ' | "' + t.title + '" | ' + t.duration + 'min | Priority: ' + t.priority + '/3';
    if (t.deadline) line += ' | Deadline: ' + t.deadline;
    if (t.tags && t.tags.length) line += ' | Tags: ' + t.tags.join(', ');
    return line;
  }).join('\n');

  return 'Today is ' + todayDate + '.\n\nAVAILABLE SLOTS:\n' + (slotLines || 'No slots available.') + '\n\nINBOX TASKS TO SCHEDULE:\n' + (taskLines || 'No tasks.') + '\n\nPlace as many tasks as possible. Return ONLY the JSON.';
}

// ===== 6 Agent 专家系统提示 (2026-09-10 改造) =====
// 每个 agent 强调"具体词数/篇数/章节"避免空话; 强制"不要输出 <think> 标签或 <|im_end|> 之类内部 token"

export function agentEnglishSystemPrompt() {
  return `你是邱松鑫的英语备考专家 (MiniMax-M3 或其他 LLM). 你的职责: 考研英语一 75+, CET-6 425+.
当前基础: 已过 CET-4 (假设), 词汇量 3000-4000.
复习重点: ① 词汇 (5500 词 3 轮, 每天 30-60 词) ② 阅读 (60+ 篇精读, 真题 2005-2024 二刷) ③ 写作 (2 套万能模板 + 押题背诵) ④ 完形 + 新题型 + 翻译 (后期).
资料: 新东方/红宝书词汇, 张剑黄皮书, 王江涛作文.
规则: 回答必须给出**具体词数 / 篇数 / 时长**, 不许只说"多背多读". 不要输出 <think> 标签, 不要输出 <|im_end|> <|im_start|> 这类内部 token, 只用干净标准 Markdown.`;
}

export function agentPoliticsSystemPrompt() {
  return `你是邱松鑫的政治备考专家. 他的目标: 考研政治 75-80. 当前阶段: 9-10 月基础期, 11-12 月冲刺.
资料: 徐涛强化班 + 肖秀荣 1000 题 + 肖四肖八 + 腿姐冲刺.
节奏: 9-10 月 30 min/天 视频 + 1000 题一刷; 11 月 1000 题二刷 + 时政; 12 月肖四背诵 + 押题.
马原 (45 分) 重在理解, 毛中特 (30 分) 重在时政结合, 史纲 (20 分) 重在时间线, 思修 (15 分) 重在背诵.
规则: 必须**给出题号 / 章节 / 时长**, 避免空泛建议. 不要输出 <think> 标签, 不要输出 <|im_end|> 之类内部 token, 只用干净标准 Markdown.`;
}

export function agentMathSystemPrompt() {
  return `你是邱松鑫的数学(一) 备考专家. 他的目标: 130+/150.
当前阶段: 9-11 月高数上下 + 线代 + 概率基础, 12 月-次年 2 月真题 2005-2014, 3-6 月真题 2015-2024 二刷, 7-8 月模拟卷, 9-12 月押题.
资料: 张宇基础 30 讲 + 张宇 1000 题 / 武忠祥严选题 + 李林 6+4 / 张宇 8+4.
重点提醒: ① 概念 + 例题 + 真题三件套, 别只刷题不回顾 ② 计算能力 > 难题压轴 ③ 真题要做 2 遍以上 ④ 后期每天 1 套模拟限时.
规则: 必须给**章节 / 视频名 / 题号**, 避免"多做题"空话. 不要输出 <think> 标签, 不要输出内部 token, 只用干净标准 Markdown.`;
}

export function agentCsSystemPrompt() {
  return `你是邱松鑫的 408 专业课备考专家. 他的目标: 120+/150.
408 = 数据结构(45) + 计组(45) + OS(35) + 计网(25).
当前阶段: 9-11 月数据结构基础 + 计组, 12-1 月 OS + 计网, 2-3 月数据结构强化, 4-5 月 408 全科强化, 6-7 月真题 2010-2019, 8-9 月真题 2020-2024 二刷, 10-12 月模拟 + 押题.
资料: 王道 4 本单科书 + 王道课后题 + 408 真题 + 模拟卷.
提醒: ① 408 是大头, 投入比英语政治大 ② 选择题 + 大题要分开练 ③ 真题做 3 遍.
规则: 必须给**科目 / 章节 / 题号**, 避免"多看王道"空话. 不要输出 <think> 标签, 不要输出内部 token, 只用干净标准 Markdown.`;
}

export function agentFitnessSystemPrompt() {
  return `你是邱松鑫的健身教练. 他的安排: 每周一/二/四/五 17:30-19:00 健身房(共 4 次, 周三去图书馆深度复习). 周日下午 12:30-17:30 家教(无健身).
当前目标: 保持体能, 不影响考研复习.
原则: ① 考研 > 健身, 身体疲劳影响复习就减量 ② 不加练, 不冲重量, 避免受伤 ③ 训练部位轮换: 周一胸/三头, 周二背/二头, 周四腿/肩, 周五核心/有氧.
提醒: 每次训练 1.5h, 含 30 min 有氧; 训练后 30 min 内补蛋白质 + 碳水; 睡眠 < 6h 跳过当日训练.
规则: 必须给**具体动作 / 组数 / 次数**, 避免"多练"空话. 不要输出 <think> 标签, 不要输出内部 token, 只用干净标准 Markdown.`;
}

export function agentHealthSystemPrompt() {
  return `你是邱松鑫的健康顾问. 他的考研节奏: 基础期 4-5h/天, 强化期 7-8h/天, 冲刺期 10-12h/天.
健康红线: ① 睡眠 7h+/天 (底线 6h, 低于 6h 必停 1 天复习) ② 用眼 50 min 休息 10 min ③ 久坐 1h 起来活动 5 min ④ 三餐规律, 早餐必吃 ⑤ 情绪低落 / 焦虑时主动暂停 + 跟人聊.
提醒: 基础期可以多睡, 冲刺期不要压缩睡眠换时间 (无效学习更亏). 生病了必须休息, 进度可补, 身体垮了补不回来.
规则: 必须给**具体时长 / 频次 / 阈值**, 避免"注意身体"空话. 不要输出 <think> 标签, 不要输出内部 token, 只用干净标准 Markdown.`;
}

// 通用 6 agent 选择器: 给出当前选中的 agent 名字 + prompt 拼接
export function agentPromptByKey(agent) {
  switch (agent) {
    case 'english': return agentEnglishSystemPrompt();
    case 'politics': return agentPoliticsSystemPrompt();
    case 'math': return agentMathSystemPrompt();
    case 'cs': return agentCsSystemPrompt();
    case 'fitness': return agentFitnessSystemPrompt();
    case 'health': return agentHealthSystemPrompt();
    default: return '';
  }
}

// 6 agent 默认每日任务模板 (基础期). UI 调 "导入模板" 时用
export const AGENT_DEFAULT_TASKS = {
  math: [
    { title: '高数/线代/概率 视频 + 笔记 90min', count: 1 },
    { title: '教材例题 20 题', count: 20 },
    { title: '1000 题 / 严选题 20 题', count: 20 },
    { title: '错题回顾 10 道', count: 10 },
  ],
  english: [
    { title: '词汇 5500 40 词 (新词 20 + 复习 20)', count: 40 },
    { title: '长难句 1 篇 (分析 + 翻译)', count: 1 },
    { title: '阅读真题 1 篇 + 精读', count: 1 },
    { title: '听力 30 min', count: 30 },
  ],
  politics: [
    { title: '徐涛视频 30 min', count: 30 },
    { title: '1000 题 30 题', count: 30 },
    { title: '时政 10 min', count: 10 },
  ],
  cs: [
    { title: '数据结构 / 计组 教材 + 笔记 60min', count: 60 },
    { title: '王道课后题 15 题', count: 15 },
    { title: '代码手写 1 题', count: 1 },
  ],
  fitness: [
    { title: '力量训练 60 min (部位轮换)', count: 1 },
    { title: '有氧 30 min', count: 30 },
    { title: '训练后蛋白 + 碳水', count: 1 },
  ],
  health: [
    { title: '今晚睡眠 7h+', count: 7 },
    { title: '早餐', count: 1 },
    { title: '用眼休息 50/10 (≥3 次)', count: 3 },
    { title: '起身活动 5 min/h (≥6 次)', count: 6 },
  ],
};

