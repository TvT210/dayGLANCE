// 考研日历 PWA · 首次启动引导脚本
// 流程:
//   1. 如果 localStorage 'day-planner-seed-v1' 已标记 → 跳过
//   2. 如果用户已有日历任务 ('day-planner-tasks' 非空) → 只标记一次，不再覆盖
//   3. 否则 → 把 taskCalendarUrl 指向 /dayGLANCE/seed/kaoyan.ics，dayglance 自己 fetch & import
//   4. 标记完成，避免重复触发
//
// 这个脚本必须在 dayglance 主 JS 之前执行（已通过 index.html head 注入）

(function bootstrapKaoyanSeed() {
  try {
    var SEED_FLAG = 'day-planner-seed-v1';
    if (localStorage.getItem(SEED_FLAG)) {
      return; // 已经引导过
    }

    var existingTasks = localStorage.getItem('day-planner-tasks');
    if (existingTasks && existingTasks !== '[]' && existingTasks.length > 10) {
      // 用户已经有自己的数据，不覆盖。标记一下避免反复检查。
      localStorage.setItem(SEED_FLAG, 'has-existing-data');
      return;
    }

    // 第一次打开 → 设置 taskCalendarUrl 指向 seed .ics
    // dayglance 的 useCalendarSync 会自动 fetch + 解析 + 导入
    var seedUrl = '/dayGLANCE/seed/kaoyan.ics';
    localStorage.setItem('day-planner-task-calendar-url', seedUrl);
    localStorage.setItem('day-planner-task-calendar-auth', JSON.stringify({ username: '', appPassword: '', caldavBaseUrl: '' }));
    localStorage.setItem('day-planner-ics-calendars', JSON.stringify([{
      id: 'kaoyan-seed',
      url: seedUrl,
      name: '考研日历 · 邱松鑫',
      color: 'bg-teal-500',
      enabled: true,
    }]));
    // 把 syncRetentionDays 设为 600 天，覆盖一年半的考研周期
    localStorage.setItem('day-planner-sync-retention-days', '600');
    localStorage.setItem(SEED_FLAG, 'v1-imported');
  } catch (e) {
    // localStorage 可能因为隐私模式被禁用，安静失败
    console.warn('[kaoyan-seed] bootstrap skipped:', e);
  }
})();
