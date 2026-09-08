// Compute localStorage usage with per-key breakdown
export const getStorageUsage = () => {
  const entries = [];
  let totalBytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const val = localStorage.getItem(key) || '';
      const bytes = (key.length + val.length) * 2; // UTF-16
      // Split day-planner-tasks into user tasks vs imported calendar events
      if (key === 'day-planner-tasks') {
        try {
          const tasks = JSON.parse(val);
          const userTasks = tasks.filter(t => !t.imported);
          const importedTasks = tasks.filter(t => t.imported);
          const userBytes = (key.length + JSON.stringify(userTasks).length) * 2;
          const importedBytes = bytes - userBytes;
          if (userTasks.length > 0) entries.push({ key: 'day-planner-tasks:user', bytes: userBytes, count: userTasks.length });
          if (importedTasks.length > 0) entries.push({ key: 'day-planner-tasks:imported', bytes: importedBytes, count: importedTasks.length });
        } catch {
          entries.push({ key, bytes });
        }
      } else {
        entries.push({ key, bytes });
      }
      totalBytes += bytes;
    }
  } catch {}
  entries.sort((a, b) => b.bytes - a.bytes);
  return { totalBytes, entries };
};

export const formatBytes = (bytes) => {
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
};
