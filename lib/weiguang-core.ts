export type Milestone = { id: number; title: string; done: boolean };
export type Task = { id: number; title: string; time: string; note: string; tag: string; date: string; planId?: number };
export type HabitSchedule = { frequency?: 'daily' | 'weekly' | 'interval' | 'weekdays'; intervalDays?: number; startDate?: string };
export type HabitRevision = HabitSchedule & { effectiveFrom: string; target: number; step: number; unit: string; days: number[]; paused: boolean };
export type Habit = HabitSchedule & { id: number; icon: string; title: string; target: number; step: number; unit: string; color: string; days: number[]; paused: boolean; reminder: string; revisions: HabitRevision[] };
export type Plan = { id: number; title: string; detail: string; progress: number; color: string; next: string; milestones: Milestone[]; deadline: string; archived: boolean };
export type DailyRecord = { taskDone: number[]; habits: Record<string, number> };
export type AppSnapshot = { version: 4; tasks: Task[]; habits: Habit[]; plans: Plan[]; records: Record<string, DailyRecord>; updatedAt: string };
export type LocalReadResult = { snapshot: AppSnapshot; firstRun: boolean };
export type CompanionMood = 'sleepy' | 'waiting' | 'curious' | 'bright' | 'celebrate';
export type CompanionState = { mood: CompanionMood; message: string };
export type HabitProgressStatus = 'not-started' | 'in-progress' | 'complete' | 'exceeded';
export type HabitProgress = { percent: number; cappedPercent: number; status: HabitProgressStatus; label: string };

export const everyDay = [1, 2, 3, 4, 5, 6, 0];

function pad(value: number) { return String(value).padStart(2, '0'); }

export function toDateKey(date: Date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
export function fromDateKey(key: string) { if (key === 'today') return new Date(); const [year, month, day] = key.split('-').map(Number); return new Date(year, month - 1, day, 12); }
export function shiftDate(key: string, amount: number) { const date = fromDateKey(key); date.setDate(date.getDate() + amount); return toDateKey(date); }
export function getWeekKeys(endKey: string) { return Array.from({ length: 7 }, (_, index) => shiftDate(endKey, index - 6)); }
export function getMonthKeys(referenceKey: string) { const date = fromDateKey(referenceKey); const total = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate(); return Array.from({ length: total }, (_, index) => toDateKey(new Date(date.getFullYear(), date.getMonth(), index + 1, 12))); }
export function getMonthToDateKeys(referenceKey: string) { return getMonthKeys(referenceKey).filter((key) => key <= referenceKey); }
export function getPreviousMonthKeys(referenceKey: string) { const date = fromDateKey(referenceKey); date.setMonth(date.getMonth() - 1, 1); return getMonthKeys(toDateKey(date)); }
export function getPreviousMonthToDateKeys(referenceKey: string) { return getPreviousMonthKeys(referenceKey).slice(0, getMonthToDateKeys(referenceKey).length); }
export function shortWeekday(key: string) { return new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(fromDateKey(key)).replace('周', ''); }
export function emptyRecord(): DailyRecord { return { taskDone: [], habits: {} }; }
export function recommendedHabitStep(target: number, unit: string) {
  const safeTarget = Number.isFinite(target) && target > 0 ? target : 1;
  const normalizedUnit = unit.trim().toLowerCase();
  if (['次', '杯', '颗', '粒', '片', '组', '遍', '回'].includes(normalizedUnit)) return 1;
  if (['ml', '毫升'].includes(normalizedUnit)) return safeTarget >= 1000 ? 250 : safeTarget >= 500 ? 100 : safeTarget >= 100 ? 50 : safeTarget >= 20 ? 5 : 1;
  if (['分钟', '分'].includes(normalizedUnit)) return safeTarget >= 60 ? 15 : safeTarget >= 20 ? 5 : 1;
  if (['小时', '时'].includes(normalizedUnit)) return safeTarget >= 4 ? 1 : 0.5;
  if (['步'].includes(normalizedUnit)) return safeTarget >= 5000 ? 1000 : safeTarget >= 1000 ? 500 : safeTarget >= 100 ? 50 : 10;
  if (safeTarget <= 10) return 1;
  if (safeTarget <= 30) return 5;
  if (safeTarget <= 100) return 10;
  if (safeTarget <= 300) return 25;
  if (safeTarget <= 1000) return 100;
  if (safeTarget <= 3000) return 250;
  return 1000;
}
export function sanitizeHabitStep(step: number, target: number, unit: string) {
  const safeTarget = Number.isFinite(target) && target > 0 ? target : 1;
  const safeStep = Number.isFinite(step) && step > 0 ? step : recommendedHabitStep(safeTarget, unit);
  return Math.min(safeTarget, safeStep);
}
export function changeHabitValue(current: number, amount: number) {
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const nextValue = safeCurrent + safeAmount;
  if (!Number.isFinite(nextValue)) return safeCurrent;
  return Math.round(Math.max(0, nextValue) * 10000) / 10000;
}
export function habitProgress(value: number, target: number): HabitProgress {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const safeTarget = Number.isFinite(target) && target > 0 ? target : 1;
  const percent = Math.max(0, Math.round((safeValue / safeTarget) * 100));
  if (percent === 0) return { percent, cappedPercent: 0, status: 'not-started', label: '未开始' };
  if (percent < 100) return { percent, cappedPercent: percent, status: 'in-progress', label: `进行中 ${percent}%` };
  if (percent === 100) return { percent, cappedPercent: 100, status: 'complete', label: '已完成 100%' };
  return { percent, cappedPercent: 100, status: 'exceeded', label: `超额完成 ${percent}%` };
}
export function habitRevisionFor(habit: Habit, dateKey: string): HabitRevision {
  const fallback = { ...normalizeHabitSchedule(habit), effectiveFrom: '0001-01-01', target: habit.target, step: habit.step, unit: habit.unit, days: habit.days, paused: habit.paused };
  return habit.revisions.filter((revision) => revision.effectiveFrom <= dateKey).at(-1) || habit.revisions[0] || fallback;
}
export function upsertHabitRevision(habit: Habit, effectiveFrom: string): Habit {
  const revision: HabitRevision = { ...normalizeHabitSchedule(habit), effectiveFrom, target: habit.target, step: habit.step, unit: habit.unit, days: [...habit.days], paused: habit.paused };
  const previous = habit.revisions.filter((item) => item.effectiveFrom <= effectiveFrom).at(-1);
  if (previous && previous.target === revision.target && previous.step === revision.step && previous.unit === revision.unit && previous.paused === revision.paused && [...previous.days].sort().join() === [...revision.days].sort().join() && JSON.stringify(normalizeHabitSchedule(previous)) === JSON.stringify(normalizeHabitSchedule(revision))) return habit;
  const revisions = [...habit.revisions.filter((item) => item.effectiveFrom !== effectiveFrom), revision].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return { ...habit, revisions };
}
export function timeGreeting(hour: number) { return hour < 6 ? '夜深了' : hour < 11 ? '早上好' : hour < 18 ? '下午好' : '晚上好'; }
export function getCompanionState(progress: number, total: number, hour: number): CompanionState {
  if (total > 0 && progress >= 100) return { mood: 'celebrate', message: '今天的约定都完成啦。现在可以安心休息了。' };
  if (total > 0 && progress >= 60) return { mood: 'bright', message: '已经走了很远，我陪你把剩下的慢慢做完。' };
  if (total > 0 && progress > 0) return { mood: 'curious', message: '第一点微光亮起来了，我一直有看见。' };
  if (hour < 6 || hour >= 22) return { mood: 'sleepy', message: '夜深啦。没做完也没关系，先好好休息。' };
  if (total === 0) return { mood: 'waiting', message: '今天没有安排也没关系，我陪你安静待一会儿。' };
  return { mood: 'waiting', message: '不用着急，我们从最小的一件事开始。' };
}
export function stamp(snapshot: Omit<AppSnapshot, 'updatedAt'> | AppSnapshot): AppSnapshot { return { ...snapshot, version: 4, updatedAt: new Date().toISOString() }; }
export function planProgress(plan: Plan) { return plan.milestones.length ? Math.round((plan.milestones.filter((item) => item.done).length / plan.milestones.length) * 100) : plan.progress; }
export function nextMilestoneCopy(milestones: Milestone[]) { const next = milestones.find((item) => !item.done); return next ? `下一步：${next.title}` : milestones.length ? '所有里程碑均已完成' : '下一步：添加第一个里程碑'; }
export function planDeadlineCopy(deadline: string, today: string) { if (!deadline) return '未设置截止日期'; const days = Math.round((fromDateKey(deadline).getTime() - fromDateKey(today).getTime()) / 86400000); const date = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(fromDateKey(deadline)); return days < 0 ? `${date} · 已过期 ${Math.abs(days)} 天` : days === 0 ? `${date} · 今天截止` : `${date} · 还有 ${days} 天`; }

export function normalizeSnapshot(snapshot: AppSnapshot, today: string): AppSnapshot {
  const records: Record<string, DailyRecord> = {};
  Object.entries(snapshot.records || {}).forEach(([key, record]) => { records[key === 'today' ? today : key] = { taskDone: Array.isArray(record?.taskDone) ? record.taskDone : [], habits: record?.habits && typeof record.habits === 'object' ? record.habits : {} }; });
  return carryOverTasks({
    version: 4,
    tasks: snapshot.tasks.map((task) => ({ id: task.id, title: task.title, time: task.time, note: typeof task.note === 'string' ? task.note : '', tag: task.tag, date: task.date === 'today' || !task.date ? today : task.date, ...(typeof task.planId === 'number' ? { planId: task.planId } : {}) })),
    habits: snapshot.habits.map((habit) => {
      const target = Number.isFinite(habit.target) && habit.target > 0 ? habit.target : 1;
      const unit = typeof habit.unit === 'string' && habit.unit.trim() ? habit.unit.trim() : '次';
      const step = sanitizeHabitStep(habit.step, target, unit);
      const days = Array.isArray(habit.days) && habit.days.length ? habit.days : everyDay;
      const paused = Boolean(habit.paused);
      const rawRevisions = Array.isArray(habit.revisions) && habit.revisions.length ? habit.revisions : [{ effectiveFrom: '0001-01-01', target, step, unit, days, paused }];
      const revisions = rawRevisions.map((revision) => {
        const revisionTarget = Number.isFinite(revision.target) && revision.target > 0 ? revision.target : target;
        const revisionUnit = typeof revision.unit === 'string' && revision.unit.trim() ? revision.unit.trim() : unit;
        return { ...normalizeHabitSchedule(revision), effectiveFrom: typeof revision.effectiveFrom === 'string' && revision.effectiveFrom ? revision.effectiveFrom : '0001-01-01', target: revisionTarget, step: sanitizeHabitStep(revision.step, revisionTarget, revisionUnit), unit: revisionUnit, days: Array.isArray(revision.days) && revision.days.length ? revision.days : days, paused: Boolean(revision.paused) };
      }).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
      return { ...habit, ...normalizeHabitSchedule(habit), target, step, unit, days, paused, reminder: typeof habit.reminder === 'string' ? habit.reminder : '', revisions };
    }),
    plans: snapshot.plans.map((plan) => { const milestones = Array.isArray(plan.milestones) ? plan.milestones : []; return { ...plan, milestones, next: nextMilestoneCopy(milestones), deadline: typeof plan.deadline === 'string' ? plan.deadline : '', archived: Boolean(plan.archived) }; }),
    records,
    updatedAt: snapshot.updatedAt || new Date(0).toISOString(),
  }, today);
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

export function normalizeHabitSchedule(value: HabitSchedule): Required<HabitSchedule> {
  return { frequency: ['daily', 'weekly', 'interval', 'weekdays'].includes(value.frequency || '') ? value.frequency! : 'weekdays', intervalDays: Number.isInteger(value.intervalDays) && value.intervalDays! >= 2 && value.intervalDays! <= 365 ? value.intervalDays! : 2, startDate: typeof value.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.startDate) ? value.startDate : '0001-01-01' };
}
export function isHabitScheduled(habit: Habit, key: string) {
  const state = habitRevisionFor(habit, key);
  if (state.paused || key < state.effectiveFrom) return false;
  const schedule = normalizeHabitSchedule(state);
  if (key < schedule.startDate) return false;
  if (schedule.frequency === 'interval') {
    const serial = (date: string) => { const d = fromDateKey(date); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000; };
    return (serial(key) - serial(schedule.startDate)) % schedule.intervalDays === 0;
  }
  return schedule.frequency !== 'weekdays' || state.days.includes(fromDateKey(key).getDay());
}
export function countsTowardDailyProgress(habit: Habit, key: string) {
  return isHabitScheduled(habit, key) && habitRevisionFor(habit, key).frequency !== 'weekly';
}

export function carryOverTasks(snapshot: AppSnapshot, today: string): AppSnapshot {
  let changed = false;
  const tasks = snapshot.tasks.map((task) => {
    if (task.date >= today || snapshot.records[task.date]?.taskDone.includes(task.id)) return task;
    changed = true;
    return { ...task, date: today };
  });
  return changed ? { ...snapshot, tasks } : snapshot;
}

export function postponeTask(snapshot: AppSnapshot, taskId: number): AppSnapshot {
  const task = snapshot.tasks.find((item) => item.id === taskId);
  if (!task || snapshot.records[task.date]?.taskDone.includes(taskId)) return snapshot;
  const date = shiftDate(task.date, 1);
  return { ...snapshot, tasks: snapshot.tasks.map((item) => item.id === taskId ? { ...item, date } : item) };
}
export function renameMilestone(plan: Plan, milestoneId: number, title: string): Plan {
  const cleanTitle = title.trim();
  if (!cleanTitle || !plan.milestones.some((item) => item.id === milestoneId)) return plan;
  const milestones = plan.milestones.map((item) => item.id === milestoneId ? { ...item, title: cleanTitle } : item);
  return { ...plan, milestones, next: nextMilestoneCopy(milestones) };
}
export function habitPeriodStart(habit: Habit, key: string) {
  const state = habitRevisionFor(habit, key);
  if (state.frequency !== 'weekly') return key;
  return [shiftDate(key, -((fromDateKey(key).getDay() + 6) % 7)), state.effectiveFrom, state.startDate || '0001-01-01'].sort().at(-1)!;
}
export function habitValueFor(habit: Habit, key: string, records: Record<string, DailyRecord>) {
  const start = habitPeriodStart(habit, key);
  let value = 0;
  for (let date = start; date <= key; date = shiftDate(date, 1)) value += records[date]?.habits[String(habit.id)] || 0;
  return Math.round(value * 10000) / 10000;
}
export function habitScheduleCopy(habit: HabitSchedule & { days: number[] }) {
  const schedule = normalizeHabitSchedule(habit);
  if (schedule.frequency === 'weekly') return '每周累计';
  if (schedule.frequency === 'interval') return schedule.intervalDays === 2 ? '隔天一次' : `每 ${schedule.intervalDays} 天`;
  if (schedule.frequency === 'daily' || habit.days.length === 7) return '每天';
  return `每周${habit.days.map((day) => '日一二三四五六'[day]).join('、')}`;
}

// Follow the clock only when viewing today; keep an explicitly selected history date.
export function dateAfterClockChange(previousToday: string, selected: string, nextToday: string) {
  return selected === previousToday ? nextToday : selected;
}
export function nextClockCheckDelay(now: Date) {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(1, Math.min(60000, midnight.getTime() - now.getTime()));
}
