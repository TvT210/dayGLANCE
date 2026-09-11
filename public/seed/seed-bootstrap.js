// 考研日历 PWA · 首次启动引导脚本
// 注册 10 个 calendar, 每个学科独立颜色, 全部从同源 PWA 静态资源 fetch
// 标记 'day-planner-seed-v3' 避免重复触发
//   v2 -> v3: 修正节次时间为广师大白云校区官方作息表
//   (08:30-09:55 / 10:05-11:30 / 13:30-14:55 / 15:05-16:30 / 18:40-20:50)
//
// 必须在 dayglance 主 JS 之前执行 (已通过 index.html head 注入)

(function bootstrapKaoyanSeed() {
  try {
    var SEED_FLAG = 'day-planner-seed-v3';
    var PREV_FLAG = 'day-planner-seed-v2';
    if (localStorage.getItem(SEED_FLAG)) {
      return; // 已经引导过
    }

    // v2 用户: 只是课表时间变了, 重新写一次 calendar 列表即可, 不动任务数据
    var hadPrev = !!localStorage.getItem(PREV_FLAG);
    if (!hadPrev) {
      var existingTasks = localStorage.getItem('day-planner-tasks');
      if (existingTasks && existingTasks !== '[]' && existingTasks.length > 10) {
        // 新用户且已有自己的数据, 不覆盖
        localStorage.setItem(SEED_FLAG, 'has-existing-data');
        return;
      }
    }

    // 10 个学科 calendar, 每个独立颜色
    var calendars = [
      { id: 'kaoyan-math',    url: '/dayGLANCE/seed/math.ics',    name: '考研·数学',          color: 'bg-rose-500' },
      { id: 'kaoyan-english', url: '/dayGLANCE/seed/english.ics', name: '考研·英语',          color: 'bg-emerald-500' },
      { id: 'kaoyan-politics',url: '/dayGLANCE/seed/politics.ics',name: '考研·政治',          color: 'bg-red-500' },
      { id: 'kaoyan-ds',      url: '/dayGLANCE/seed/ds.ics',      name: '408 数据结构',        color: 'bg-indigo-500' },
      { id: 'kaoyan-cn',      url: '/dayGLANCE/seed/cn.ics',      name: '408 计算机网络',      color: 'bg-sky-500' },
      { id: 'kaoyan-os',      url: '/dayGLANCE/seed/os.ics',      name: '408 操作系统',        color: 'bg-amber-500' },
      { id: 'kaoyan-co',      url: '/dayGLANCE/seed/co.ics',      name: '408 计算机组成原理',  color: 'bg-fuchsia-500' },
      { id: 'kaoyan-mock',    url: '/dayGLANCE/seed/mock.ics',    name: '考研·模考',          color: 'bg-purple-500' },
      { id: 'kaoyan-cet6',    url: '/dayGLANCE/seed/cet6.ics',    name: 'CET-6 专项',          color: 'bg-lime-500' },
      { id: 'kaoyan-life',    url: '/dayGLANCE/seed/life.ics',    name: '生活/课内/通勤',      color: 'bg-stone-500' },
    ];

    // dayglance 期望的字段: id, name, url, color, enabled
    var enabled = calendars.map(function(c) {
      return { id: c.id, name: c.name, url: c.url, color: c.color, enabled: true };
    });

    localStorage.setItem('day-planner-ics-calendars', JSON.stringify(enabled));
    // syncRetentionDays 600 天覆盖 2026-09 → 2028-04 考研周期
    localStorage.setItem('day-planner-sync-retention-days', '600');
    // 主 taskCalendarUrl 留空, 我们走 icsCalendars 多源模式
    localStorage.setItem('day-planner-task-calendar-url', '');
    localStorage.setItem(SEED_FLAG, 'v3-imported');
  } catch (e) {
    console.warn('[kaoyan-seed] bootstrap skipped:', e);
  }
})();
