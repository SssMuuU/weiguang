'use client';

import type { CSSProperties } from 'react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';

type View = 'today' | 'plans' | 'habits' | 'review';
type AddKind = 'task' | 'habit' | 'plan';
type ReviewRange = 'week' | 'month';
type SyncState = 'loading' | 'device';
type Milestone = { id: number; title: string; done: boolean };
type Task = { id: number; title: string; time: string; note: string; tag: string; date: string; planId?: number };
type Habit = { id: number; icon: string; title: string; target: number; unit: string; color: string; days: number[]; paused: boolean; reminder: string };
type Plan = { id: number; title: string; detail: string; progress: number; color: string; next: string; milestones: Milestone[]; deadline: string; archived: boolean };
type DailyRecord = { taskDone: number[]; habits: Record<string, number> };
type AppSnapshot = { version: 4; tasks: Task[]; habits: Habit[]; plans: Plan[]; records: Record<string, DailyRecord>; updatedAt: string };
type LocalReadResult = { snapshot: AppSnapshot; firstRun: boolean };
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const everyDay = [1, 2, 3, 4, 5, 6, 0];
const weekDayOptions = [{ value: 1, label: '一' }, { value: 2, label: '二' }, { value: 3, label: '三' }, { value: 4, label: '四' }, { value: 5, label: '五' }, { value: 6, label: '六' }, { value: 0, label: '日' }];

const initialHabits: Habit[] = [
  { id: 1, icon: '水', title: '喝水', target: 8, unit: '杯', color: 'blue', days: everyDay, paused: false, reminder: '09:00' },
  { id: 2, icon: '读', title: '每日阅读', target: 20, unit: '分钟', color: 'violet', days: everyDay, paused: false, reminder: '20:30' },
  { id: 3, icon: '步', title: '散步', target: 1, unit: '次', color: 'orange', days: [1, 2, 3, 4, 5, 6], paused: false, reminder: '18:30' },
];

const initialPlans: Plan[] = [
  { id: 1, title: '完成微光 App 1.0', detail: '产品与设计', progress: 33, color: 'violet', next: '下一步：完成核心功能', deadline: '2026-09-30', archived: false, milestones: [{ id: 101, title: '确定产品方向', done: true }, { id: 102, title: '完成浏览器 MVP', done: false }, { id: 103, title: '准备 iOS 测试版', done: false }] },
  { id: 2, title: '建立稳定阅读节奏', detail: '个人成长', progress: 67, color: 'blue', next: '本周还需阅读 80 页', deadline: '2026-09-21', archived: false, milestones: [{ id: 201, title: '选定阅读清单', done: true }, { id: 202, title: '连续阅读 7 天', done: true }, { id: 203, title: '完成本月第一本书', done: false }] },
  { id: 3, title: '九月健康计划', detail: '健康生活', progress: 25, color: 'orange', next: '今晚散步 30 分钟', deadline: '2026-09-30', archived: false, milestones: [{ id: 301, title: '记录初始状态', done: true }, { id: 302, title: '每周散步 4 次', done: false }, { id: 303, title: '保持规律睡眠', done: false }, { id: 304, title: '完成月末复盘', done: false }] },
];

const navItems: { id: View; label: string; short: string }[] = [
  { id: 'today', label: '今天', short: '今' }, { id: 'plans', label: '计划', short: '计' }, { id: 'habits', label: '习惯', short: '习' }, { id: 'review', label: '回顾', short: '记' },
];

const copy: Record<View, { eyebrow: string; title: string }> = {
  today: { eyebrow: '把注意力放在此刻', title: '今天想完成什么？' }, plans: { eyebrow: '从愿望到行动', title: '正在推进的计划' }, habits: { eyebrow: '微小重复，长期复利', title: '让好习惯自然发生' }, review: { eyebrow: '看见每一点进步', title: '你的行动回顾' },
};

function pad(value: number) { return String(value).padStart(2, '0'); }
function toDateKey(date: Date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function fromDateKey(key: string) { if (key === 'today') return new Date(); const [year, month, day] = key.split('-').map(Number); return new Date(year, month - 1, day, 12); }
function shiftDate(key: string, amount: number) { const date = fromDateKey(key); date.setDate(date.getDate() + amount); return toDateKey(date); }
function getWeekKeys(endKey: string) { return Array.from({ length: 7 }, (_, index) => shiftDate(endKey, index - 6)); }
function getMonthKeys(referenceKey: string) { const date = fromDateKey(referenceKey); const total = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate(); return Array.from({ length: total }, (_, index) => toDateKey(new Date(date.getFullYear(), date.getMonth(), index + 1, 12))); }
function getPreviousMonthKeys(referenceKey: string) { const date = fromDateKey(referenceKey); date.setMonth(date.getMonth() - 1, 1); return getMonthKeys(toDateKey(date)); }
function shortWeekday(key: string) { return new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(fromDateKey(key)).replace('周', ''); }
function emptyRecord(): DailyRecord { return { taskDone: [], habits: {} }; }
function stamp(snapshot: Omit<AppSnapshot, 'updatedAt'> | AppSnapshot): AppSnapshot { return { ...snapshot, version: 4, updatedAt: new Date().toISOString() }; }
function planProgress(plan: Plan) { return plan.milestones.length ? Math.round((plan.milestones.filter((item) => item.done).length / plan.milestones.length) * 100) : plan.progress; }
function nextMilestoneCopy(milestones: Milestone[]) { const next = milestones.find((item) => !item.done); return next ? `下一步：${next.title}` : milestones.length ? '所有里程碑均已完成' : '下一步：添加第一个里程碑'; }
function planDeadlineCopy(deadline: string, today: string) { if (!deadline) return '未设置截止日期'; const days = Math.round((fromDateKey(deadline).getTime() - fromDateKey(today).getTime()) / 86400000); const date = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(fromDateKey(deadline)); return days < 0 ? `${date} · 已过期 ${Math.abs(days)} 天` : days === 0 ? `${date} · 今天截止` : `${date} · 还有 ${days} 天`; }

function createSeedSnapshot(today: string): AppSnapshot {
  const tasks: Task[] = [
    { id: 1, title: '完成产品首页线框', time: '09:30', note: '确认手机端信息层级', tag: '专注', date: today, planId: 1 },
    { id: 2, title: '阅读 20 页', time: '18:30', note: '', tag: '成长', date: today, planId: 2 },
    { id: 3, title: '整理本周计划', time: '20:00', note: '', tag: '生活', date: today },
  ];
  const records: Record<string, DailyRecord> = {};
  getWeekKeys(today).forEach((key, index) => {
    records[key] = { taskDone: key === today ? [1] : [], habits: { '1': index === 2 ? 5 : index === 6 ? 6 : 8, '2': index === 1 ? 8 : index === 5 ? 15 : index === 6 ? 12 : 20, '3': index === 3 || index === 6 ? 0 : 1 } };
  });
  return { version: 4, tasks, habits: initialHabits, plans: initialPlans, records, updatedAt: new Date().toISOString() };
}

function createEmptySnapshot(today: string): AppSnapshot {
  return { version: 4, tasks: [], habits: [], plans: [], records: { [today]: emptyRecord() }, updatedAt: new Date().toISOString() };
}

function normalizeSnapshot(snapshot: AppSnapshot, today: string): AppSnapshot {
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

function parseSnapshot(value: unknown): AppSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<AppSnapshot>;
  if (!Array.isArray(item.tasks) || !Array.isArray(item.habits) || !Array.isArray(item.plans) || !item.records || typeof item.records !== 'object') return null;
  return { version: 4, tasks: item.tasks as Task[], habits: item.habits as Habit[], plans: item.plans as Plan[], records: item.records as Record<string, DailyRecord>, updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date(0).toISOString() };
}

async function readLocal(today: string): Promise<LocalReadResult> {
  try {
    const stored = Capacitor.isNativePlatform()
      ? (await Preferences.get({ key: 'weiguang.snapshot.v4' })).value || (await Preferences.get({ key: 'weiguang.snapshot.v3' })).value
      : window.localStorage.getItem('weiguang.snapshot.v4') || window.localStorage.getItem('weiguang.snapshot.v3') || window.localStorage.getItem('weiguang.snapshot.v2');
    const current = parseSnapshot(JSON.parse(stored || 'null'));
    if (current) return { snapshot: normalizeSnapshot(current, today), firstRun: false };
  } catch { /* Invalid local cache enters the safe first-run flow. */ }
  return { snapshot: createEmptySnapshot(today), firstRun: true };
}

function nativeNotificationId(habitId: number, weekday: number) {
  return 100000 + ((Math.abs(habitId) % 100000) * 7 + weekday) % 900000;
}

function nextReminderDate(weekday: number, hour: number, minute: number) {
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  let offset = (weekday - next.getDay() + 7) % 7;
  if (offset === 0 && next.getTime() <= Date.now()) offset = 7;
  next.setDate(next.getDate() + offset);
  return next;
}

async function syncHabitReminder(habit: Habit, requestPermission = true) {
  if (!Capacitor.isNativePlatform()) return true;
  const notificationIds = everyDay.map((weekday) => ({ id: nativeNotificationId(habit.id, weekday) }));
  if (habit.paused || !habit.reminder || habit.days.length === 0) {
    await LocalNotifications.cancel({ notifications: notificationIds });
    return true;
  }
  let permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted' && requestPermission) permission = await LocalNotifications.requestPermissions();
  if (permission.display !== 'granted') return false;
  await LocalNotifications.cancel({ notifications: notificationIds });
  const [hour, minute] = habit.reminder.split(':').map(Number);
  await LocalNotifications.schedule({
    notifications: habit.days.map((weekday) => ({
      id: nativeNotificationId(habit.id, weekday),
      title: `微光 · ${habit.title}`,
      body: `到了记录“${habit.title}”的时间。慢慢来，也是在前进。`,
      schedule: { at: nextReminderDate(weekday, hour, minute), repeats: true, every: 'week' },
      extra: { habitId: habit.id },
    })),
  });
  return true;
}

async function syncAllHabitReminders(habits: Habit[]) {
  if (!Capacitor.isNativePlatform()) return;
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') return;
  const pending = await LocalNotifications.getPending();
  const managed = pending.notifications.filter((notification) => notification.id >= 100000 && notification.id < 1000000).map(({ id }) => ({ id }));
  if (managed.length) await LocalNotifications.cancel({ notifications: managed });
  await Promise.allSettled(habits.map((habit) => syncHabitReminder(habit, false)));
}

function nativeImpact(style = ImpactStyle.Light) {
  if (Capacitor.isNativePlatform()) void Haptics.impact({ style });
}

function nativeSuccess() {
  if (Capacitor.isNativePlatform()) void Haptics.notification({ type: NotificationType.Success });
}

export default function Home() {
  const [view, setView] = useState<View>('today');
  const [snapshot, setSnapshot] = useState<AppSnapshot>(() => createEmptySnapshot('today'));
  const [todayKey, setTodayKey] = useState('today');
  const [selectedDate, setSelectedDate] = useState('today');
  const [ready, setReady] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>('loading');
  const [greeting, setGreeting] = useState('早上好');
  const [modal, setModal] = useState(false);
  const [dataModal, setDataModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [taskEditor, setTaskEditor] = useState<Task | null>(null);
  const [habitEditor, setHabitEditor] = useState<Habit | null>(null);
  const [addKind, setAddKind] = useState<AddKind>('task');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [taskNote, setTaskNote] = useState('');
  const [planChoice, setPlanChoice] = useState('');
  const [planDeadline, setPlanDeadline] = useState('');
  const [planTitleDraft, setPlanTitleDraft] = useState('');
  const [planDetailDraft, setPlanDetailDraft] = useState('');
  const [planDeadlineDraft, setPlanDeadlineDraft] = useState('');
  const [showArchivedPlans, setShowArchivedPlans] = useState(false);
  const [milestoneDraft, setMilestoneDraft] = useState('');
  const [reviewRange, setReviewRange] = useState<ReviewRange>('week');
  const [toast, setToast] = useState('');
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    const now = new Date();
    const today = toDateKey(now);
    void (async () => {
      const local = await readLocal(today);
      setTodayKey(today); setSelectedDate(today); setGreeting(now.getHours() < 11 ? '早上好' : now.getHours() < 18 ? '下午好' : '晚上好');
      setSnapshot(local.snapshot); setWelcome(local.firstRun); setReady(true);
      setSyncState('device');
      if (isNative) void syncAllHabitReminders(local.snapshot.habits);
    })();
    if (isNative) document.body.classList.add('native-app');
    else if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');
    const captureInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    window.addEventListener('beforeinstallprompt', captureInstall);
    return () => { window.removeEventListener('beforeinstallprompt', captureInstall); document.body.classList.remove('native-app'); };
  }, [isNative]);

  useEffect(() => {
    if (!isNative) return;
    const listener = App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      const now = new Date();
      const nextToday = toDateKey(now);
      setGreeting(now.getHours() < 11 ? '早上好' : now.getHours() < 18 ? '下午好' : '晚上好');
      setTodayKey((currentToday) => {
        if (currentToday === nextToday) return currentToday;
        setSelectedDate((currentSelected) => currentSelected === currentToday ? nextToday : currentSelected);
        return nextToday;
      });
    });
    return () => { void listener.then((handle) => handle.remove()); };
  }, [isNative]);

  useEffect(() => {
    if (!ready || welcome) return;
    if (isNative) void Preferences.set({ key: 'weiguang.snapshot.v4', value: JSON.stringify(snapshot) });
    else window.localStorage.setItem('weiguang.snapshot.v4', JSON.stringify(snapshot));
  }, [snapshot, ready, isNative, welcome]);

  useEffect(() => {
    if (!modal && !dataModal && selectedPlanId === null && !taskEditor && !habitEditor) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setModal(false); setDataModal(false); setSelectedPlanId(null); setTaskEditor(null); setHabitEditor(null); } };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, [modal, dataModal, selectedPlanId, taskEditor, habitEditor]);

  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2200); return () => window.clearTimeout(timer); }, [toast]);

  const { tasks, habits, plans } = snapshot;
  const activePlans = plans.filter((plan) => !plan.archived);
  const archivedPlans = plans.filter((plan) => plan.archived);
  const visiblePlans = showArchivedPlans ? archivedPlans : activePlans;
  const recordFor = (key: string) => snapshot.records[key] || emptyRecord();
  const isScheduled = (habit: Habit, key: string) => !habit.paused && habit.days.includes(fromDateKey(key).getDay());
  const selectedRecord = recordFor(selectedDate);
  const selectedTasks = tasks.filter((task) => task.date === selectedDate);
  const selectedHabits = habits.filter((habit) => isScheduled(habit, selectedDate));
  const taskDone = selectedTasks.filter((task) => selectedRecord.taskDone.includes(task.id)).length;
  const habitDone = selectedHabits.filter((habit) => (selectedRecord.habits[String(habit.id)] || 0) >= habit.target).length;
  const todayTotal = selectedTasks.length + selectedHabits.length;
  const todayDone = taskDone + habitDone;
  const progress = todayTotal ? Math.round((todayDone / todayTotal) * 100) : 0;
  const averagePlan = activePlans.length ? Math.round(activePlans.reduce((sum, plan) => sum + planProgress(plan), 0) / activePlans.length) : 0;
  const weekDays = useMemo(() => getWeekKeys(todayKey), [todayKey]);
  const monthDays = useMemo(() => getMonthKeys(todayKey), [todayKey]);
  const rangeDays = reviewRange === 'week' ? weekDays : monthDays;
  const previousDays = reviewRange === 'week' ? weekDays.map((key) => shiftDate(key, -7)) : getPreviousMonthKeys(todayKey);

  function completionForDate(key: string) {
    const dayTasks = tasks.filter((task) => task.date === key);
    const scheduled = habits.filter((habit) => isScheduled(habit, key));
    const record = recordFor(key);
    const doneTasks = dayTasks.filter((task) => record.taskDone.includes(task.id)).length;
    const doneHabits = scheduled.filter((habit) => (record.habits[String(habit.id)] || 0) >= habit.target).length;
    const total = dayTasks.length + scheduled.length;
    return total ? Math.round(((doneTasks + doneHabits) / total) * 100) : 0;
  }

  const rangeBars = rangeDays.map(completionForDate);
  const previousBars = previousDays.map(completionForDate);
  const rangeAverage = rangeBars.length ? Math.round(rangeBars.reduce((sum, value) => sum + value, 0) / rangeBars.length) : 0;
  const previousAverage = previousBars.length ? Math.round(previousBars.reduce((sum, value) => sum + value, 0) / previousBars.length) : 0;
  const trend = rangeAverage - previousAverage;
  const rangeTaskDone = tasks.filter((task) => rangeDays.includes(task.date) && recordFor(task.date).taskDone.includes(task.id)).length;
  const rangeTaskTotal = tasks.filter((task) => rangeDays.includes(task.date)).length;
  const rangeHabitPossible = rangeDays.reduce((sum, key) => sum + habits.filter((habit) => isScheduled(habit, key)).length, 0);
  const rangeHabitDone = rangeDays.reduce((sum, key) => sum + habits.filter((habit) => isScheduled(habit, key) && (recordFor(key).habits[String(habit.id)] || 0) >= habit.target).length, 0);
  const bestDayIndex = rangeBars.indexOf(Math.max(...rangeBars));
  const bestDate = rangeDays[Math.max(0, bestDayIndex)] || todayKey;
  const isToday = selectedDate === todayKey;
  const selectedLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(fromDateKey(selectedDate));
  const header = copy[view];
  const syncCopy = syncState === 'loading' ? '正在读取' : isNative ? '已保存在此 iPhone' : '已保存在本机';
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) || null;

  function updateSnapshot(change: (current: AppSnapshot) => AppSnapshot) { setSnapshot((current) => stamp(change(current))); }
  function updateRecord(key: string, change: (record: DailyRecord) => DailyRecord) { updateSnapshot((current) => ({ ...current, records: { ...current.records, [key]: change(current.records[key] || emptyRecord()) } })); }
  function navigate(next: View) { setView(next); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function openAdd(kind: AddKind) { setAddKind(kind); setTitle(''); setDetail(''); setTaskNote(''); setPlanChoice(''); setPlanDeadline(''); setModal(true); }
  function openPlan(plan: Plan) { setSelectedPlanId(plan.id); setPlanTitleDraft(plan.title); setPlanDetailDraft(plan.detail); setPlanDeadlineDraft(plan.deadline); }

  function submitAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const cleanTitle = title.trim(); if (!cleanTitle) return; const id = Date.now();
    if (addKind === 'task') {
      updateSnapshot((current) => ({ ...current, tasks: [...current.tasks, { id, title: cleanTitle, time: detail.trim() || '未设时间', note: taskNote.trim(), tag: '新建', date: selectedDate, ...(planChoice ? { planId: Number(planChoice) } : {}) }] }));
      setToast(`待办已加入${isToday ? '今天' : selectedLabel}`);
    } else if (addKind === 'habit') {
      updateSnapshot((current) => ({ ...current, habits: [...current.habits, { id, icon: cleanTitle.slice(0, 1), title: cleanTitle, target: Math.max(1, Number(detail) || 1), unit: '次', color: 'violet', days: everyDay, paused: false, reminder: '' }] })); setToast('新习惯已创建');
    } else {
      updateSnapshot((current) => ({ ...current, plans: [...current.plans, { id, title: cleanTitle, detail: detail.trim() || '个人计划', progress: 0, color: 'blue', next: '下一步：添加第一个里程碑', milestones: [], deadline: planDeadline, archived: false }] })); setToast('计划已开始');
    }
    setModal(false);
  }

  function toggleTask(id: number, key = selectedDate) { const completing = !recordFor(key).taskDone.includes(id); updateRecord(key, (record) => ({ ...record, taskDone: record.taskDone.includes(id) ? record.taskDone.filter((taskId) => taskId !== id) : [...record.taskDone, id] })); if (completing) nativeSuccess(); else nativeImpact(); }
  function removeTask(id: number) { const task = tasks.find((item) => item.id === id); if (!task || !window.confirm(`删除待办“${task.title}”吗？相关完成记录也会一并删除。`)) return; updateSnapshot((current) => ({ ...current, tasks: current.tasks.filter((item) => item.id !== id), records: Object.fromEntries(Object.entries(current.records).map(([key, record]) => [key, { ...record, taskDone: record.taskDone.filter((taskId) => taskId !== id) }])) })); setToast('待办已移除'); }
  function saveTaskEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taskEditor) return;
    const original = tasks.find((task) => task.id === taskEditor.id);
    const cleanTitle = taskEditor.title.trim();
    if (!original || !cleanTitle || !taskEditor.date) return;
    const edited: Task = { ...taskEditor, title: cleanTitle, time: taskEditor.time.trim() || '未设时间', note: taskEditor.note.trim() };
    const wasDone = recordFor(original.date).taskDone.includes(original.id);
    updateSnapshot((current) => {
      const records = { ...current.records };
      if (original.date !== edited.date) {
        const oldRecord = records[original.date] || emptyRecord();
        const newRecord = records[edited.date] || emptyRecord();
        records[original.date] = { ...oldRecord, taskDone: oldRecord.taskDone.filter((taskId) => taskId !== edited.id) };
        records[edited.date] = { ...newRecord, taskDone: wasDone ? Array.from(new Set([...newRecord.taskDone, edited.id])) : newRecord.taskDone.filter((taskId) => taskId !== edited.id) };
      }
      return { ...current, tasks: current.tasks.map((task) => task.id === edited.id ? edited : task), records };
    });
    if (original.date !== edited.date) setSelectedDate(edited.date);
    setTaskEditor(null); nativeImpact(ImpactStyle.Medium); setToast(original.date === edited.date ? '待办已更新' : '待办已移动，完成状态已保留');
  }
  function changeHabitProgress(id: number, amount: number, key = view === 'today' ? selectedDate : todayKey) {
    const habit = habits.find((item) => item.id === id);
    if (!habit || !isScheduled(habit, key) || key > todayKey) return;
    const currentValue = recordFor(key).habits[String(id)] || 0;
    const nextValue = Math.max(0, Math.min(habit.target, currentValue + amount));
    if (nextValue === currentValue) return;
    updateRecord(key, (record) => ({ ...record, habits: { ...record.habits, [String(id)]: nextValue } }));
    if (amount > 0 && nextValue >= habit.target) nativeSuccess(); else nativeImpact();
    if (key < todayKey) setToast(nextValue >= habit.target ? `${habit.title} 已补记完成` : `${habit.title} 的历史进度已更新`);
    else setToast(nextValue >= habit.target ? `${habit.title} 已完成` : amount > 0 ? '已记录一次，继续保持' : '已撤销一次记录');
  }

  function addMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedPlan || !milestoneDraft.trim()) return;
    updateSnapshot((current) => ({ ...current, plans: current.plans.map((plan) => {
      if (plan.id !== selectedPlan.id) return plan;
      const baseline = plan.milestones.length === 0 && plan.progress > 0 ? [{ id: Date.now() - 1, title: '已有进展', done: true }] : plan.milestones;
      const milestones = [...baseline, { id: Date.now(), title: milestoneDraft.trim(), done: false }];
      return { ...plan, milestones, progress: Math.round((milestones.filter((item) => item.done).length / milestones.length) * 100), next: nextMilestoneCopy(milestones) };
    }) })); setMilestoneDraft(''); setToast('里程碑已添加');
  }

  function toggleMilestone(planId: number, milestoneId: number) {
    const completing = !plans.find((plan) => plan.id === planId)?.milestones.find((item) => item.id === milestoneId)?.done;
    updateSnapshot((current) => ({ ...current, plans: current.plans.map((plan) => {
      if (plan.id !== planId) return plan; const milestones = plan.milestones.map((item) => item.id === milestoneId ? { ...item, done: !item.done } : item);
      return { ...plan, milestones, progress: Math.round((milestones.filter((item) => item.done).length / Math.max(1, milestones.length)) * 100), next: nextMilestoneCopy(milestones) };
    }) })); if (completing) nativeSuccess(); else nativeImpact();
  }

  function removeMilestone(planId: number, milestoneId: number) {
    const milestone = plans.find((plan) => plan.id === planId)?.milestones.find((item) => item.id === milestoneId);
    if (!milestone || !window.confirm(`删除里程碑“${milestone.title}”吗？`)) return;
    updateSnapshot((current) => ({ ...current, plans: current.plans.map((plan) => {
      if (plan.id !== planId) return plan; const milestones = plan.milestones.filter((item) => item.id !== milestoneId);
      return { ...plan, milestones, progress: milestones.length ? Math.round((milestones.filter((item) => item.done).length / milestones.length) * 100) : 0, next: nextMilestoneCopy(milestones) };
    }) })); setToast('里程碑已移除');
  }

  function savePlanDetails() {
    if (!selectedPlan) return;
    const cleanTitle = planTitleDraft.trim();
    if (!cleanTitle) { setToast('请为计划填写名称'); return; }
    updateSnapshot((current) => ({ ...current, plans: current.plans.map((plan) => plan.id === selectedPlan.id ? { ...plan, title: cleanTitle, detail: planDetailDraft.trim() || '个人计划', deadline: planDeadlineDraft } : plan) }));
    nativeImpact(ImpactStyle.Medium); setToast('计划信息已更新');
  }
  function togglePlanArchive() { if (!selectedPlan) return; const nextArchived = !selectedPlan.archived; updateSnapshot((current) => ({ ...current, plans: current.plans.map((plan) => plan.id === selectedPlan.id ? { ...plan, archived: nextArchived } : plan) })); setSelectedPlanId(null); nativeImpact(ImpactStyle.Medium); setToast(nextArchived ? '计划已归档' : '计划已恢复'); }

  async function saveHabitSettings() {
    if (!habitEditor) return;
    const cleanTitle = habitEditor.title.trim();
    if (!cleanTitle) { setToast('请为习惯填写名称'); return; }
    const savedHabit: Habit = { ...habitEditor, title: cleanTitle, icon: habitEditor.icon.trim() || cleanTitle.slice(0, 1), unit: habitEditor.unit.trim() || '次', days: habitEditor.days.length ? habitEditor.days : everyDay };
    try {
      const remindersReady = await syncHabitReminder(savedHabit);
      updateSnapshot((current) => ({ ...current, habits: current.habits.map((habit) => habit.id === savedHabit.id ? savedHabit : habit) }));
      setHabitEditor(null); nativeImpact(ImpactStyle.Medium); setToast(remindersReady ? '习惯设置已保存' : '设置已保存，请在系统设置中允许通知');
    } catch {
      setToast('设置已保存，但系统提醒未能更新');
      updateSnapshot((current) => ({ ...current, habits: current.habits.map((habit) => habit.id === savedHabit.id ? savedHabit : habit) })); setHabitEditor(null);
    }
  }
  async function deleteHabit() {
    if (!habitEditor || !window.confirm(`确定删除“${habitEditor.title}”吗？相关历史记录也会删除，且无法撤销。`)) return;
    const deletedHabit = habitEditor;
    let remindersCleared = true;
    try { await syncHabitReminder({ ...deletedHabit, paused: true, reminder: '' }, false); } catch { remindersCleared = false; }
    updateSnapshot((current) => ({
      ...current,
      habits: current.habits.filter((habit) => habit.id !== deletedHabit.id),
      records: Object.fromEntries(Object.entries(current.records).map(([key, record]) => [key, { ...record, habits: Object.fromEntries(Object.entries(record.habits).filter(([habitId]) => habitId !== String(deletedHabit.id))) }])),
    }));
    setHabitEditor(null); nativeImpact(ImpactStyle.Medium); setToast(remindersCleared ? '习惯及其历史记录已删除' : '习惯已删除，请检查系统中的待处理提醒');
  }
  function habitStreak(habit: Habit) { if (habit.paused) return 0; let streak = 0; for (let offset = 0; offset < 366; offset += 1) { const key = shiftDate(todayKey, -offset); if (!habit.days.includes(fromDateKey(key).getDay())) continue; if ((recordFor(key).habits[String(habit.id)] || 0) < habit.target) break; streak += 1; } return streak; }

  async function exportData() {
    const fileName = `weiguang-backup-${todayKey}.json`;
    const data = JSON.stringify(snapshot, null, 2);
    if (isNative) {
      try {
        const file = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache, encoding: Encoding.UTF8 });
        await Share.share({ title: '微光数据备份', text: '保存或分享你的微光 JSON 备份。', url: file.uri, dialogTitle: '导出微光备份' });
        nativeSuccess(); setToast('备份已交给系统分享');
      } catch { setToast('备份导出未完成，请再试一次'); }
      return;
    }
    const blob = new Blob([data], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url); setToast('备份文件已导出');
  }
  async function importData(file: File | undefined) { if (!file) return; try { const imported = parseSnapshot(JSON.parse(await file.text())); if (!imported) throw new Error('Invalid backup'); const restored = stamp(normalizeSnapshot(imported, todayKey)); setSnapshot(restored); if (isNative) void syncAllHabitReminders(restored.habits); setDataModal(false); setToast('备份数据已恢复'); } catch { setToast('无法读取这个备份文件'); } }
  function resetData() { if (!window.confirm('确定清空当前数据并恢复示例内容吗？建议先导出备份。')) return; const seed = createSeedSnapshot(todayKey); setSnapshot(seed); if (isNative) void syncAllHabitReminders(seed.habits); setSelectedDate(todayKey); setDataModal(false); setToast('数据已恢复为初始状态'); }
  async function installApp() { if (!installPrompt) return; await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); }
  function startBlank() { setWelcome(false); nativeImpact(ImpactStyle.Medium); setToast('欢迎来到微光，从一件小事开始吧'); }
  function loadDemo() { const seed = createSeedSnapshot(todayKey); setSnapshot(seed); setWelcome(false); if (isNative) void syncAllHabitReminders(seed.habits); nativeImpact(ImpactStyle.Medium); setToast('示例内容已载入，可以随时修改'); }

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <aside className="sidebar glass-panel"><button className="brand" onClick={() => navigate('today')} aria-label="微光首页"><span className="brand-mark">微</span><span>微光</span></button><nav className="nav-list" aria-label="主导航">{navItems.map((item) => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}><span>{item.short}</span>{item.label}</button>)}</nav><div className="sidebar-foot"><div className="streak-orb">{Math.max(0, ...habits.map(habitStreak))}</div><div><strong>最长连续记录</strong><small>今天也向前一点</small></div></div></aside>

      <section className="content">
        <header className="topbar"><div><p className="eyebrow">{view === 'today' ? selectedLabel : header.eyebrow}</p><h1>{view === 'today' ? (isToday ? `${greeting}，${header.title}` : '这一天，安排了什么？') : header.title}</h1></div><div className="top-actions"><button className={`sync-pill ${syncState}`} onClick={() => setDataModal(true)} aria-label="打开数据管理"><i />{syncCopy}</button><button className="avatar" aria-label="个人资料">SU</button></div></header>

        {view === 'today' && <><div className="date-controls glass-panel"><button onClick={() => setSelectedDate(shiftDate(selectedDate, -1))} aria-label="前一天">‹</button><div><strong>{isToday ? '今天' : selectedLabel}</strong><span>{selectedTasks.length} 项待办 · {habitDone}/{selectedHabits.length} 项习惯</span></div>{!isToday && <button className="back-today" onClick={() => setSelectedDate(todayKey)}>回到今天</button>}<button onClick={() => setSelectedDate(shiftDate(selectedDate, 1))} aria-label="后一天">›</button></div><section className="overview glass-panel" aria-label="所选日期进度"><div><span className="section-label">{isToday ? '今日进度' : '当日进度'}</span><strong>{progress === 100 ? '这一天的约定，都完成了。' : '慢慢来，也是在前进。'}</strong><p>已完成 {todayDone} 项，还有 {todayTotal - todayDone} 项等你。</p></div><div className="progress-ring" style={{ '--progress': `${progress}%` } as CSSProperties}><span>{progress}<small>%</small></span></div></section><section className="task-section" aria-labelledby="today-tasks"><div className="section-head"><div><span className="section-label">待办</span><h2 id="today-tasks">{isToday ? '今天' : selectedLabel}</h2></div><button className="add-button" onClick={() => openAdd('task')}><span>＋</span> 添加待办</button></div><div className="task-list glass-panel">{selectedTasks.length === 0 && <EmptyState text="这一天还没有待办，给自己安排一件小事吧。" onAdd={() => openAdd('task')} />}{selectedTasks.map((task) => { const done = selectedRecord.taskDone.includes(task.id); const linkedPlan = plans.find((plan) => plan.id === task.planId); const meta = [task.time !== '未设时间' ? task.time : '', task.note].filter(Boolean).join(' · ') || '未设时间'; return <article className={`task-row ${done ? 'is-done' : ''}`} key={task.id}><button className="check" onClick={() => toggleTask(task.id)} aria-label={`${done ? '取消完成' : '完成'} ${task.title}`}>{done ? '✓' : ''}</button><button className="task-copy task-edit" onClick={() => setTaskEditor({ ...task })} aria-label={`编辑 ${task.title}`}><strong>{task.title}</strong><span>{meta}</span></button><span className={`tag ${linkedPlan ? 'linked' : ''}`}>{linkedPlan ? linkedPlan.title : task.tag}</span><button className="remove" onClick={() => removeTask(task.id)} aria-label={`删除 ${task.title}`}>×</button></article>; })}</div></section><section className={`task-section day-habit-section ${isToday ? '' : 'historical'}`} aria-labelledby="day-habits"><div className="section-head"><div><span className="section-label">习惯记录</span><h2 id="day-habits">{selectedDate > todayKey ? '未来日期暂不能记录' : isToday ? '今天的习惯' : '补记或撤销'}</h2></div><button className="add-button" onClick={() => navigate('habits')}>管理习惯</button></div><div className="day-habit-list glass-panel">{selectedHabits.length === 0 && <div className="day-habit-empty">这一天没有安排习惯，好好休息也是计划的一部分。</div>}{selectedHabits.map((habit) => { const value = selectedRecord.habits[String(habit.id)] || 0; const complete = value >= habit.target; const locked = selectedDate > todayKey; return <article className={`day-habit-row ${complete ? 'complete' : ''}`} key={habit.id}><div className={`habit-icon ${habit.color}`}>{habit.icon}</div><div className="day-habit-copy"><strong>{habit.title}</strong><span>{locked ? '到那一天再来记录' : `${value} / ${habit.target} ${habit.unit}`}</span><i><b style={{ width: `${Math.min(100, Math.round((value / habit.target) * 100))}%` }} /></i></div><div className="habit-stepper"><button onClick={() => changeHabitProgress(habit.id, -1, selectedDate)} disabled={locked || value === 0} aria-label={`撤销一次 ${habit.title}`}>−</button><button onClick={() => changeHabitProgress(habit.id, 1, selectedDate)} disabled={locked || complete} aria-label={`记录一次 ${habit.title}`}>＋</button></div></article>; })}</div></section></>}

        {view === 'plans' && <section className="view-section"><div className="section-head"><div><span className="section-label">{activePlans.length} 个进行中 · {archivedPlans.length} 个已归档</span><h2>{showArchivedPlans ? '完成过的，也值得被看见' : '把大目标拆成下一步'}</h2></div><div className="plan-head-actions"><button className={`archive-filter ${showArchivedPlans ? 'active' : ''}`} onClick={() => setShowArchivedPlans((current) => !current)}>{showArchivedPlans ? '返回进行中' : `查看归档 ${archivedPlans.length || ''}`}</button><button className="add-button" onClick={() => openAdd('plan')}><span>＋</span> 新建计划</button></div></div>{visiblePlans.length === 0 ? <div className="plan-empty glass-panel"><EmptyState text={showArchivedPlans ? '还没有归档计划，完成后再把它温柔地收好。' : '还没有进行中的计划，从一个清晰的小目标开始。'} onAdd={() => showArchivedPlans ? setShowArchivedPlans(false) : openAdd('plan')} /></div> : <div className="plan-grid">{visiblePlans.map((plan) => { const calculated = planProgress(plan); const linkedCount = tasks.filter((task) => task.planId === plan.id).length; return <article className={`plan-card glass-panel ${plan.archived ? 'archived' : ''}`} key={plan.id}><div className={`plan-accent ${plan.color}`} /><div className="plan-title"><span>{plan.detail}</span><strong>{plan.title}</strong></div><div className={`plan-deadline ${plan.deadline && plan.deadline < todayKey ? 'overdue' : ''}`}>{plan.archived ? '已归档' : planDeadlineCopy(plan.deadline, todayKey)}</div><div className="plan-percent"><b>{calculated}%</b><span>{plan.milestones.filter((item) => item.done).length}/{plan.milestones.length} 里程碑</span></div><div className="plan-progress"><i style={{ width: `${calculated}%` }} /></div><p>{nextMilestoneCopy(plan.milestones)} · {linkedCount} 项关联待办</p><button onClick={() => openPlan(plan)}>查看计划</button></article>; })}</div>}</section>}

        {view === 'habits' && <section className="view-section"><div className="section-head"><div><span className="section-label">自定义执行周期</span><h2>{habits.filter((habit) => isScheduled(habit, todayKey) && (recordFor(todayKey).habits[String(habit.id)] || 0) >= habit.target).length} / {habits.filter((habit) => isScheduled(habit, todayKey)).length} 今日已完成</h2></div><button className="add-button" onClick={() => openAdd('habit')}><span>＋</span> 新建习惯</button></div><div className="habit-board glass-panel"><div className="habit-week-head"><span>习惯</span>{weekDays.map((key) => <small key={key}>{shortWeekday(key)}</small>)}</div>{habits.map((habit) => { const scheduledToday = isScheduled(habit, todayKey); const done = scheduledToday && (recordFor(todayKey).habits[String(habit.id)] || 0) >= habit.target; return <article className={`habit-board-row ${habit.paused ? 'paused' : ''}`} key={habit.id}><button className="habit-name habit-name-button" onClick={() => setHabitEditor({ ...habit })}><div className={`habit-icon ${habit.color}`}>{habit.icon}</div><div><strong>{habit.title}</strong><span>{habit.paused ? '已暂停' : `连续 ${habitStreak(habit)} 天 · ${habit.reminder || '未设提醒'}`}</span></div></button>{weekDays.map((key) => { const scheduled = isScheduled(habit, key); const complete = scheduled && (recordFor(key).habits[String(habit.id)] || 0) >= habit.target; return <i key={key} className={complete ? 'complete' : scheduled ? '' : 'skipped'}>{complete ? '✓' : scheduled ? '' : '·'}</i>; })}<button onClick={() => changeHabitProgress(habit.id, 1, todayKey)} disabled={!scheduledToday || done}>{habit.paused ? '暂停' : !scheduledToday ? '休息日' : done ? '完成' : `+1 ${habit.unit}`}</button></article>; })}</div><div className="gentle-note glass-panel"><span>小提醒</span><p>点击习惯名称可设置周期与提醒；在“今天”切换到历史日期，可补记或撤销具体次数。</p></div></section>}

        {view === 'review' && <section className="view-section"><div className="review-toolbar"><div className="range-switch"><button className={reviewRange === 'week' ? 'active' : ''} onClick={() => setReviewRange('week')}>本周</button><button className={reviewRange === 'month' ? 'active' : ''} onClick={() => setReviewRange('month')}>本月</button></div><span>{reviewRange === 'week' ? '最近 7 天' : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(fromDateKey(todayKey))}</span></div><div className="metric-grid"><Metric label={`${reviewRange === 'week' ? '本周' : '本月'}待办`} value={`${rangeTaskDone}`} note={`共 ${rangeTaskTotal} 项`} tone="violet" /><Metric label="习惯打卡" value={`${rangeHabitDone}`} note={`计划 ${rangeHabitPossible} 次`} tone="blue" /><Metric label="平均完成率" value={`${rangeAverage}%`} note={`计划均值 ${averagePlan}%`} tone="orange" /></div>{reviewRange === 'week' ? <article className="review-chart glass-panel"><div className="section-head"><div><span className="section-label">真实完成率</span><h2>最近 7 天</h2></div><span className={`trend ${trend < 0 ? 'down' : ''}`}>{trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% 较上周</span></div><div className="bars" aria-label="最近七天完成率柱状图">{rangeBars.map((height, index) => <div key={rangeDays[index]}><i style={{ height: `${Math.max(height, 4)}%` }} className={index === rangeBars.length - 1 ? 'today' : ''} /><small>{shortWeekday(rangeDays[index])}</small></div>)}</div></article> : <article className="month-card glass-panel"><div className="section-head"><div><span className="section-label">月度热力图</span><h2>每天都有痕迹</h2></div><span className={`trend ${trend < 0 ? 'down' : ''}`}>{trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% 较上月</span></div><div className="month-weekdays">{weekDayOptions.map((day) => <span key={day.value}>{day.label}</span>)}</div><div className="month-grid" style={{ '--offset': (fromDateKey(monthDays[0]).getDay() + 6) % 7 } as CSSProperties}>{monthDays.map((key) => { const value = completionForDate(key); return <div key={key} className={key === todayKey ? 'today' : ''} style={{ '--heat': `${Math.max(.06, value / 100)}` } as CSSProperties}><strong>{fromDateKey(key).getDate()}</strong><small>{value}%</small></div>; })}</div></article>}<article className="review-note glass-panel"><div className="quote-mark">“</div><div><span className="section-label">{reviewRange === 'week' ? '本周发现' : '本月发现'}</span><h2>{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(fromDateKey(bestDate))}状态最好</h2><p>{reviewRange === 'week' ? '本周' : '本月'}平均完成率为 {rangeAverage}%。报告由实际执行周期、待办和习惯记录生成。</p></div></article></section>}
      </section>

      <aside className="right-rail"><div className="rail-head"><div><span className="section-label">{view === 'today' && !isToday ? selectedLabel : '保持节奏'}</span><h2>{view === 'today' && !isToday ? '当日习惯' : '今日习惯'}</h2></div><button onClick={() => openAdd('habit')} aria-label="添加习惯">＋</button></div><div className="habit-stack">{habits.filter((habit) => !habit.paused).slice(0, 4).map((habit) => { const key = view === 'today' ? selectedDate : todayKey; const scheduled = isScheduled(habit, key); const value = recordFor(key).habits[String(habit.id)] || 0; const percent = scheduled ? Math.min(100, Math.round((value / habit.target) * 100)) : 0; const locked = key > todayKey; return <article className={`habit-card glass-panel ${scheduled ? '' : 'resting'}`} key={habit.id}><button className={`habit-icon ${habit.color}`} onClick={() => setHabitEditor({ ...habit })}>{habit.icon}</button><div className="habit-info"><strong>{habit.title}</strong><span>{scheduled ? locked ? '未来日期暂不能记录' : `${value} / ${habit.target} ${habit.unit}` : '今天休息'}</span></div><button className="habit-plus" onClick={() => changeHabitProgress(habit.id, percent === 100 ? -habit.target : 1, key)} disabled={!scheduled || locked} aria-label={percent === 100 ? `撤销 ${habit.title}` : `记录一次 ${habit.title}`}>{!scheduled ? '·' : percent === 100 ? '↶' : '+'}</button><div className="mini-progress"><i style={{ width: `${percent}%` }} /></div></article>; })}</div><article className="reflection glass-panel"><span>今日一句</span><blockquote>“不需要很厉害才开始，开始了才会慢慢变厉害。”</blockquote><div className="week-dots">{weekDays.map((key) => <div key={key}><i className={completionForDate(key) >= 60 ? 'filled' : ''} /><small>{shortWeekday(key)}</small></div>)}</div></article></aside>

      <nav className="mobile-nav glass-panel" aria-label="移动端导航">{navItems.slice(0, 2).map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><span>{item.short}</span>{item.label}</button>)}<button className="mobile-add" onClick={() => openAdd('task')} aria-label="快速添加">＋</button>{navItems.slice(2).map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><span>{item.short}</span>{item.label}</button>)}</nav>

      {welcome && <div className="modal-layer welcome-layer"><section className="modal welcome-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="welcome-title"><div className="welcome-brand"><span className="brand-mark">微</span><span>微光</span></div><span className="section-label">第一次见面</span><h2 id="welcome-title">把每一点行动，慢慢变成生活</h2><p>这里没有必须完成的清单。先写下一件待办、一个想培养的习惯，或一段值得推进的计划。</p><div className="welcome-points"><div><b>今</b><span><strong>从今天开始</strong><small>待办、习惯和计划放在同一个节奏里</small></span></div><div><b>存</b><span><strong>由你保管</strong><small>无需登录，内容只保存在当前设备</small></span></div></div><button className="submit-button" onClick={startBlank}>从空白开始</button><button className="welcome-demo" onClick={loadDemo}>先看看示例</button><small className="welcome-note">之后可在“数据与安装”中导出备份或恢复示例内容</small></section></div>}

      {modal && <div className="modal-layer" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setModal(false)}><section className="modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="add-title"><button className="modal-close" onClick={() => setModal(false)} aria-label="关闭">×</button><span className="section-label">快速记录</span><h2 id="add-title">把想法放进微光</h2><div className="kind-switch">{(['task', 'habit', 'plan'] as AddKind[]).map((kind) => <button key={kind} className={addKind === kind ? 'active' : ''} onClick={() => setAddKind(kind)}>{kind === 'task' ? '待办' : kind === 'habit' ? '习惯' : '计划'}</button>)}</div><form onSubmit={submitAdd}><label>名称<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder={addKind === 'task' ? '例如：回复重要邮件' : addKind === 'habit' ? '例如：拉伸 10 分钟' : '例如：完成个人作品集'} /></label>{addKind === 'task' ? <><label>时间（可选）<input type="time" value={detail} onChange={(event) => setDetail(event.target.value)} /></label><label>备注（可选）<textarea value={taskNote} onChange={(event) => setTaskNote(event.target.value)} placeholder="补充地点、准备事项或想法" rows={3} /></label></> : <label>{addKind === 'habit' ? '每日目标次数' : '计划分类'}<input value={detail} onChange={(event) => setDetail(event.target.value)} inputMode={addKind === 'habit' ? 'numeric' : 'text'} placeholder={addKind === 'habit' ? '例如：1' : '例如：个人成长'} /></label>}{addKind === 'plan' && <label>截止日期（可选）<input type="date" min={todayKey === 'today' ? undefined : todayKey} value={planDeadline} onChange={(event) => setPlanDeadline(event.target.value)} /></label>}{addKind === 'task' && activePlans.length > 0 && <label>关联计划（可选）<select value={planChoice} onChange={(event) => setPlanChoice(event.target.value)}><option value="">不关联计划</option>{activePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.title}</option>)}</select></label>}<button className="submit-button" type="submit">保存到微光</button></form></section></div>}

      {taskEditor && <div className="modal-layer" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setTaskEditor(null)}><section className="modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="task-edit-title"><button className="modal-close" onClick={() => setTaskEditor(null)} aria-label="关闭">×</button><span className="section-label">编辑待办</span><h2 id="task-edit-title">调整下一步</h2><form className="task-edit-form" onSubmit={saveTaskEdit}><label>名称<input autoFocus required value={taskEditor.title} onChange={(event) => setTaskEditor({ ...taskEditor, title: event.target.value })} /></label><label>时间（可选）<input type="time" value={taskEditor.time === '未设时间' || taskEditor.time === '今天' ? '' : taskEditor.time} onChange={(event) => setTaskEditor({ ...taskEditor, time: event.target.value })} /></label><label>备注（可选）<textarea value={taskEditor.note} onChange={(event) => setTaskEditor({ ...taskEditor, note: event.target.value })} placeholder="补充地点、准备事项或想法" rows={3} /></label><label>日期<input type="date" required value={taskEditor.date} onChange={(event) => setTaskEditor({ ...taskEditor, date: event.target.value })} /></label><label>关联计划<select value={taskEditor.planId ?? ''} onChange={(event) => setTaskEditor({ ...taskEditor, planId: event.target.value ? Number(event.target.value) : undefined })}><option value="">不关联计划</option>{plans.filter((plan) => !plan.archived || plan.id === taskEditor.planId).map((plan) => <option key={plan.id} value={plan.id}>{plan.title}{plan.archived ? '（已归档）' : ''}</option>)}</select></label><button className="submit-button" type="submit">保存修改</button></form></section></div>}

      {selectedPlan && <div className="modal-layer" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setSelectedPlanId(null)}><section className="modal detail-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="plan-detail-title"><button className="modal-close" onClick={() => setSelectedPlanId(null)} aria-label="关闭">×</button><span className="section-label">{selectedPlan.detail} · {selectedPlan.archived ? '已归档' : planDeadlineCopy(selectedPlan.deadline, todayKey)}</span><h2 id="plan-detail-title">{selectedPlan.title}</h2><div className="detail-progress"><div><strong>{planProgress(selectedPlan)}%</strong><span>{selectedPlan.milestones.filter((item) => item.done).length}/{selectedPlan.milestones.length} 已完成</span></div><i><b style={{ width: `${planProgress(selectedPlan)}%` }} /></i></div><div className="next-action"><span>当前下一步</span><strong>{nextMilestoneCopy(selectedPlan.milestones).replace('下一步：', '')}</strong></div><div className="plan-settings"><label className="wide">计划名称<input value={planTitleDraft} onChange={(event) => setPlanTitleDraft(event.target.value)} /></label><label>分类<input value={planDetailDraft} onChange={(event) => setPlanDetailDraft(event.target.value)} placeholder="个人计划" /></label><label>截止日期<input type="date" value={planDeadlineDraft} onChange={(event) => setPlanDeadlineDraft(event.target.value)} /></label><button onClick={savePlanDetails}>保存计划信息</button></div><div className="milestone-list">{selectedPlan.milestones.length === 0 && <p>还没有里程碑，先写下一个清晰的阶段目标。</p>}{selectedPlan.milestones.map((item) => <div key={item.id} className={item.done ? 'done' : ''}><button onClick={() => toggleMilestone(selectedPlan.id, item.id)}>{item.done ? '✓' : ''}</button><span>{item.title}</span><button className="mini-remove" onClick={() => removeMilestone(selectedPlan.id, item.id)} aria-label={`删除里程碑 ${item.title}`}>×</button></div>)}</div><form className="milestone-form" onSubmit={addMilestone}><input value={milestoneDraft} onChange={(event) => setMilestoneDraft(event.target.value)} placeholder="添加下一个里程碑" /><button type="submit">添加</button></form><div className="linked-tasks"><span className="section-label">关联待办</span>{tasks.filter((task) => task.planId === selectedPlan.id).length === 0 && <p>创建待办时选择这个计划，它会显示在这里。</p>}{tasks.filter((task) => task.planId === selectedPlan.id).map((task) => { const done = recordFor(task.date).taskDone.includes(task.id); return <div key={task.id}><i className={done ? 'done' : ''}>{done ? '✓' : ''}</i><span>{task.title}</span><small>{new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(fromDateKey(task.date))}</small></div>; })}</div><button className={`archive-plan-button ${selectedPlan.archived ? 'restore' : ''}`} onClick={togglePlanArchive}>{selectedPlan.archived ? '恢复为进行中计划' : '归档这个计划'}</button></section></div>}

      {habitEditor && <div className="modal-layer" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setHabitEditor(null)}><section className="modal detail-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="habit-detail-title"><button className="modal-close" onClick={() => setHabitEditor(null)} aria-label="关闭">×</button><span className="section-label">习惯设置</span><h2 id="habit-detail-title">{habitEditor.title || '未命名习惯'}</h2><div className="editor-row habit-identity"><label>名称<input autoFocus value={habitEditor.title} onChange={(event) => setHabitEditor({ ...habitEditor, title: event.target.value })} /></label><label>图标字<input maxLength={2} value={habitEditor.icon} onChange={(event) => setHabitEditor({ ...habitEditor, icon: event.target.value })} /></label></div><div className="editor-group"><label>执行星期</label><div className="day-picker">{weekDayOptions.map((day) => <button type="button" key={day.value} className={habitEditor.days.includes(day.value) ? 'active' : ''} onClick={() => setHabitEditor((current) => current ? { ...current, days: current.days.includes(day.value) ? current.days.filter((value) => value !== day.value) : [...current.days, day.value] } : current)}>{day.label}</button>)}</div></div><div className="editor-row habit-target-row"><label>提醒时间<input type="time" value={habitEditor.reminder} onChange={(event) => setHabitEditor({ ...habitEditor, reminder: event.target.value })} /></label><label>每日目标<input type="number" min="1" value={habitEditor.target} onChange={(event) => setHabitEditor({ ...habitEditor, target: Math.max(1, Number(event.target.value) || 1) })} /></label><label>单位<input value={habitEditor.unit} onChange={(event) => setHabitEditor({ ...habitEditor, unit: event.target.value })} placeholder="次" /></label></div><button type="button" className={`pause-switch ${habitEditor.paused ? 'active' : ''}`} onClick={() => setHabitEditor({ ...habitEditor, paused: !habitEditor.paused })}><i />{habitEditor.paused ? '已暂停，点击恢复' : '正在执行，点击暂停'}</button><button className="submit-button" onClick={() => void saveHabitSettings()}>保存设置</button><button type="button" className="delete-habit-button" onClick={() => void deleteHabit()}>删除习惯及历史记录</button></section></div>}

      {dataModal && <div className="modal-layer" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setDataModal(false)}><section className="modal data-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="data-title"><button className="modal-close" onClick={() => setDataModal(false)} aria-label="关闭">×</button><span className="section-label">数据与安装</span><h2 id="data-title">你的微光，由你保管</h2><div className={`sync-card ${syncState}`}><i /><div><strong>{syncCopy}</strong><span>无需注册账号；计划、习惯、待办和记录仅保存在当前设备。</span></div></div><div className="data-actions"><button onClick={() => void exportData()}><b>导</b><span><strong>导出备份</strong><small>{isNative ? '通过系统分享保存 JSON' : '下载完整 JSON 数据'}</small></span></button><label><b>入</b><span><strong>恢复备份</strong><small>从此前文件恢复</small></span><input type="file" accept="application/json" onChange={(event) => void importData(event.target.files?.[0])} /></label>{installPrompt && <button onClick={() => void installApp()}><b>装</b><span><strong>安装应用</strong><small>像普通 App 一样打开</small></span></button>}</div><p className="ios-hint">{isNative ? '在习惯设置中选择提醒时间，微光会按执行星期发送系统通知。' : '在 iPhone Safari 中打开后，点“分享”→“添加到主屏幕”，即可安装当前版本。'}</p><details className="privacy-details"><summary><span><strong>隐私与版本</strong><small>无账号 · 无广告 · 不追踪</small></span><b aria-hidden="true">⌄</b></summary><div><p><strong>{isNative ? 'iPhone App' : '浏览器版'}</strong>不会上传你的计划内容，也不包含广告或分析 SDK。</p><p>本地通知由 iOS 在设备上执行；只有你主动导出备份时，系统才会把所选文件交给你指定的位置或应用。</p><small>微光 0.1.0（1）</small></div></details><button className="reset-button" onClick={resetData}>清空并恢复示例数据</button></section></div>}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}

function EmptyState({ text, onAdd }: { text: string; onAdd: () => void }) { return <div className="empty"><div>＋</div><p>{text}</p><button onClick={onAdd}>添加第一项</button></div>; }
function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) { return <article className="metric glass-panel"><i className={tone} /><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
