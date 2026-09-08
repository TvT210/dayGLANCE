import { getOccurrencesInRange } from '../utils/recurrenceEngine.js';
import useTaskMeasurement from './useTaskMeasurement.js';

const timeToMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

export default function useTaskDerived({ tasks, recurringTasks, visibleDays, mobileActiveTab }) {
  const { taskWidths, setTaskRef } = useTaskMeasurement({ tasks, visibleDays, mobileActiveTab });

  const getConflictingTasks = (task, allTasks) => {
    const start = timeToMinutes(task.startTime);
    const end = start + task.duration;

    return allTasks.filter(t => {
      if (t.id === task.id) return false;
      const tStart = timeToMinutes(t.startTime);
      const tEnd = tStart + t.duration;
      return start < tEnd && end > tStart;
    });
  };

  const calculateConflictPosition = (task, allTasks) => {
    // Imported events (not task calendar) are excluded from layout logic - always full width
    if (task.imported && !task.isTaskCalendar) return { left: 2, right: 2, width: null, totalColumns: 1 };

    // Filter out imported events from conflict calculations
    const nonImportedTasks = allTasks.filter(t => !t.imported || t.isTaskCalendar);
    const conflicting = getConflictingTasks(task, nonImportedTasks);
    if (conflicting.length === 0) return { left: 2, right: 2, width: null, totalColumns: 1 };

    // Build the full conflict cluster using transitive closure
    const buildConflictCluster = (startTask) => {
      const cluster = new Set([startTask.id]);
      const queue = [startTask];

      while (queue.length > 0) {
        const current = queue.shift();
        const currentConflicts = getConflictingTasks(current, nonImportedTasks);
        for (const t of currentConflicts) {
          if (!cluster.has(t.id)) {
            cluster.add(t.id);
            queue.push(t);
          }
        }
      }

      return nonImportedTasks.filter(t => cluster.has(t.id));
    };

    const cluster = buildConflictCluster(task);

    // Sort by start time, then by id for stable column assignment during resize
    const sorted = [...cluster].sort((a, b) => {
      const aStart = timeToMinutes(a.startTime);
      const bStart = timeToMinutes(b.startTime);
      if (aStart !== bStart) return aStart - bStart;
      return String(a.id).localeCompare(String(b.id));
    });

    // Greedy column assignment: place each task in the first column where it fits
    const columns = []; // Each column tracks the end time of the last task in it
    const taskColumns = new Map();

    for (const t of sorted) {
      const tStart = timeToMinutes(t.startTime);
      const tEnd = tStart + t.duration;

      // Find first column where this task fits (doesn't overlap)
      let placed = false;
      for (let col = 0; col < columns.length; col++) {
        if (columns[col] <= tStart) {
          columns[col] = tEnd;
          taskColumns.set(t.id, col);
          placed = true;
          break;
        }
      }

      // If no column fits, create a new one
      if (!placed) {
        taskColumns.set(t.id, columns.length);
        columns.push(tEnd);
      }
    }

    const totalColumns = columns.length;
    const column = taskColumns.get(task.id);

    const widthPercent = 100 / totalColumns;
    const leftPercent = widthPercent * column;

    const margin = '0.125rem';
    const totalMargin = '0.25rem';

    return {
      left: `calc(${leftPercent}% + ${margin})`,
      right: 'auto',
      width: `calc(${widthPercent}% - ${totalMargin})`,
      totalColumns
    };
  };

  const wouldExceedMaxColumns = (droppedTask, startTime, dropDateStr, maxColumns = 3) => {
    // Get existing tasks for this date, excluding the dropped task if it's already scheduled
    // Also exclude imported events (not task calendar) from conflict calculations
    const existingRegular = tasks.filter(t => t.date === dropDateStr && t.id !== droppedTask.id && !t.isAllDay && (!t.imported || t.isTaskCalendar));
    // Include recurring task instances for this date
    const recurringForDate = [];
    for (const template of recurringTasks) {
      if (template.isAllDay) continue;
      const occs = getOccurrencesInRange(template, dropDateStr, dropDateStr);
      for (const ds of occs) {
        const rid = `recurring-${template.id}-${ds}`;
        if (rid === droppedTask.id) continue;
        const exception = template.exceptions?.[ds];
        recurringForDate.push({
          id: rid,
          startTime: exception?.startTime ?? template.startTime,
          duration: exception?.duration ?? template.duration,
          isAllDay: false,
        });
      }
    }
    const existingTasks = [...existingRegular, ...recurringForDate];

    // Create a hypothetical task with the new position
    const hypotheticalTask = { ...droppedTask, startTime, date: dropDateStr };
    const allTasks = [...existingTasks, hypotheticalTask];

    // Check if this task would conflict with anything
    const conflicting = getConflictingTasks(hypotheticalTask, allTasks);
    if (conflicting.length === 0) return false;

    // Build conflict cluster and calculate columns (same logic as calculateConflictPosition)
    const buildCluster = (startTask) => {
      const cluster = new Set([startTask.id]);
      const queue = [startTask];
      while (queue.length > 0) {
        const current = queue.shift();
        const currentConflicts = getConflictingTasks(current, allTasks);
        for (const t of currentConflicts) {
          if (!cluster.has(t.id)) {
            cluster.add(t.id);
            queue.push(t);
          }
        }
      }
      return allTasks.filter(t => cluster.has(t.id));
    };

    const cluster = buildCluster(hypotheticalTask);
    const sorted = [...cluster].sort((a, b) => {
      const aStart = timeToMinutes(a.startTime);
      const bStart = timeToMinutes(b.startTime);
      if (aStart !== bStart) return aStart - bStart;
      if (a.duration !== b.duration) return b.duration - a.duration;
      return String(a.id).localeCompare(String(b.id));
    });

    // Greedy column assignment
    const columns = [];
    for (const t of sorted) {
      const tStart = timeToMinutes(t.startTime);
      const tEnd = tStart + t.duration;
      let placed = false;
      for (let col = 0; col < columns.length; col++) {
        if (columns[col] <= tStart) {
          columns[col] = tEnd;
          placed = true;
          break;
        }
      }
      if (!placed) {
        columns.push(tEnd);
      }
    }

    return columns.length > maxColumns;
  };

  return {
    taskWidths,
    setTaskRef,
    getConflictingTasks,
    calculateConflictPosition,
    wouldExceedMaxColumns,
  };
}
