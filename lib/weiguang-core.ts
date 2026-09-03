export type Milestone = { id: number; title: string; done: boolean };
export type Task = { id: number; title: string; time: string; note: string; tag: string; date: string; planId?: number };
export type Habit = { id: number; icon: string; title: string; target: number; unit: string; color: string; days: number[]; paused: boolean; reminder: string };
export type Plan = { id: number; title: string; detail: string; progress: number; color: string; next: string; milestones: Milestone[]; deadline: string; archived: boolean };
export type DailyRecord = { taskDone: number[]; habits: Record<string, number> };
export type AppSnapshot = { version: 4; tasks: Task[]; habits: Habit[]; plans: Plan[]; records: Record<string, DailyRecord>; updatedAt: string };
export type LocalReadResult = { snapshot: AppSnapshot; firstRun: boolean };

export const everyDay = [1, 2, 3, 4, 5, 6, 0];

function pad(value: number) { return String(value).padStart(2, '0'); }

export function toDateKey(date: Date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
export function fromDateKey(key: string) { if (key === 'today') return new Date(); const [year, month, day] = key.split('-').map(Number); return new Date(year, month - 1, day, 12); }
export function shiftDate(key: string, amount: number) { const date = fromDateKey(key); date.setDate(date.getDate() + amount); return toDateKey(date); }
export function getWeekKeys(endKey: string) { return Array.from({ length: 7 }, (_, index) => shiftDate(endKey, index - 6)); }
export function getMonthKeys(referenceKey: string) { const date = fromDateKey(referenceKey); const total = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate(); return Array.from({ length: total }, (_, index) => toDateKey(new Date(date.getFullYear(), date.getMonth(), index + 1, 12))); }
export function getPreviousMonthKeys(referenceKey: string) { const date = fromDateKey(referenceKey); date.setMonth(date.getMonth() - 1, 1); return getMonthKeys(toDateKey(date)); }
export function shortWeekday(key: string) { return new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(fromDateKey(key)).replace('周', ''); }
export function emptyRecord(): DailyRecord { return { taskDone: [], habits: {} }; }
export function stamp(snapshot: Omit<AppSnapshot, 'updatedAt'> | AppSnapshot): AppSnapshot { return { ...snapshot, version: 4, updatedAt: new Date().toISOString() }; }
export function planProgress(plan: Plan) { return plan.milestones.length ? Math.round((plan.milestones.filter((item) => item.done).length / plan.milestones.length) * 100) : plan.progress; }
export function nextMilestoneCopy(milestones: Milestone[]) { const next = milestones.find((item) => !item.done); return next ? `下一步：${next.title}` : milestones.length ? '所有里程碑均已完成' : '下一步：添加第一个里程碑'; }
export function planDeadlineCopy(deadline: string, today: string) { if (!deadline) return '未设置截止日期'; const days = Math.round((fromDateKey(deadline).getTime() - fromDateKey(today).getTime()) / 86400000); const date = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(fromDateKey(deadline)); return days < 0 ? `${date} · 已过期 ${Math.abs(days)} 天` : days === 0 ? `${date} · 今天截止` : `${date} · 还有 ${days} 天`; }

export function normalizeSnapshot(snapshot: AppSnapshot, today: string): AppSnapshot {
  const records: Record<string, DailyRecord> = {};
  Object.entries(snapshot.records || {}).forEach(([key, record]) => { records[key === 'today' ? today : key] = { taskDone: Array.isArray(record?.taskDone) ? record.taskDone : [], habits: record?.habits && typeof record.habits === 'object' ? record.habits : {} }; });
  return {
    version: 4,
    tasks: snapshot.tasks.map((task) => ({ id: task.id, title: task.title, time: task.time, note: typeof task.note === 'string' ? task.note : '', tag: task.tag, date: task.date === 'today' || !task.date ? today : task.date, ...(typeof task.planId === 'number' ? { planId: task.planId } : {}) })),
    habits: snapshot.habits.map((habit) => ({ ...habit, days: Array.isArray(habit.days) && habit.days.length ? habit.days : everyDay, paused: Boolean(habit.paused), reminder: typeof habit.reminder === 'string' ? habit.reminder : '' })),
    plans: snapshot.plans.map((plan) => { const milestones = Array.isArray(plan.milestones) ? plan.milestones : []; return { ...plan, milestones, next: nextMilestoneCopy(milestones), deadline: typeof plan.deadline === 'string' ? plan.deadline : '', archived: Boolean(plan.archived) }; }),
    records,
    updatedAt: snapshot.updatedAt || new Date(0).toISOString(),
  };
}

export function parseSnapshot(value: unknown): AppSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<AppSnapshot>;
  if (!Array.isArray(item.tasks) || !Array.isArray(item.habits) || !Array.isArray(item.plans) || !item.records || typeof item.records !== 'object' || Array.isArray(item.records)) return null;
  return { version: 4, tasks: item.tasks as Task[], habits: item.habits as Habit[], plans: item.plans as Plan[], records: item.records as Record<string, DailyRecord>, updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date(0).toISOString() };
}

export function moveTaskCompletion(records: Record<string, DailyRecord>, taskId: number, from: string, to: string) {
  if (from === to) return records;
  const oldRecord = records[from] || emptyRecord();
  const newRecord = records[to] || emptyRecord();
  const wasDone = oldRecord.taskDone.includes(taskId);
  return {
    ...records,
    [from]: { ...oldRecord, taskDone: oldRecord.taskDone.filter((id) => id !== taskId) },
    [to]: { ...newRecord, taskDone: wasDone ? Array.from(new Set([...newRecord.taskDone, taskId])) : newRecord.taskDone.filter((id) => id !== taskId) },
  };
}

export function deletePlanFromSnapshot(snapshot: AppSnapshot, planIdToDelete: number): AppSnapshot {
  return {
    ...snapshot,
    plans: snapshot.plans.filter((plan) => plan.id !== planIdToDelete),
    tasks: snapshot.tasks.map((task) => {
      const { planId, ...unlinkedTask } = task;
      return planId === planIdToDelete ? unlinkedTask : task;
    }),
  };
}
