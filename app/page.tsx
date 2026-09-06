'use client';

/* eslint-disable @next/next/no-img-element -- This shared component also ships through Vite/Capacitor, where next/image is unavailable. */

import type { CSSProperties } from 'react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import {
  deletePlanFromSnapshot,
  changeHabitValue,
  emptyRecord,
  everyDay,
  fromDateKey,
  getCompanionState,
  getMonthKeys,
  getMonthToDateKeys,
  getPreviousMonthToDateKeys,
  getWeekKeys,
  habitProgress,
  isHabitScheduled,
  habitValueFor,
  habitPeriodStart,
  habitScheduleCopy,
  normalizeHabitSchedule,
  type HabitSchedule,
  habitRevisionFor,
  moveTaskCompletion,
  nextMilestoneCopy,
  normalizeSnapshot,
  parseSnapshot,
  planDeadlineCopy,
  planProgress,
  recommendedHabitStep,
  sanitizeHabitStep,
  shiftDate,
  shortWeekday,
  stamp,
  timeGreeting,
  toDateKey,
  upsertHabitRevision,
  type AppSnapshot,
  type CompanionMood,
  type DailyRecord,
  type Habit,
  type LocalReadResult,
  type Plan,
  type Task,
} from '@/lib/weiguang-core';

type View = 'today' | 'plans' | 'habits' | 'review';
type AddKind = 'task' | 'habit' | 'plan';
type ReviewRange = 'week' | 'month';
type SyncState = 'loading' | 'saving' | 'saved' | 'error';
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const weekDayOptions = [{ value: 1, label: '一' }, { value: 2, label: '二' }, { value: 3, label: '三' }, { value: 4, label: '四' }, { value: 5, label: '五' }, { value: 6, label: '六' }, { value: 0, label: '日' }];
const snapshotKey = 'weiguang.snapshot.v4';
const rollbackKey = 'weiguang.snapshot.before-import.v4';

const initialHabits: Habit[] = [
  { id: 1, icon: '水', title: '喝水', target: 8, step: 1, unit: '杯', color: 'blue', days: everyDay, paused: false, reminder: '09:00', revisions: [{ effectiveFrom: '0001-01-01', target: 8, step: 1, unit: '杯', days: everyDay, paused: false }] },
  { id: 2, icon: '读', title: '每日阅读', target: 20, step: 5, unit: '分钟', color: 'violet', days: everyDay, paused: false, reminder: '20:30', revisions: [{ effectiveFrom: '0001-01-01', target: 20, step: 5, unit: '分钟', days: everyDay, paused: false }] },
  { id: 3, icon: '步', title: '散步', target: 1, step: 1, unit: '次', color: 'orange', days: [1, 2, 3, 4, 5, 6], paused: false, reminder: '18:30', revisions: [{ effectiveFrom: '0001-01-01', target: 1, step: 1, unit: '次', days: [1, 2, 3, 4, 5, 6], paused: false }] },
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

async function readLocal(today: string): Promise<LocalReadResult> {
  try {
    const stored = Capacitor.isNativePlatform()
      ? (await Preferences.get({ key: snapshotKey })).value || (await Preferences.get({ key: 'weiguang.snapshot.v3' })).value
      : window.localStorage.getItem(snapshotKey) || window.localStorage.getItem('weiguang.snapshot.v3') || window.localStorage.getItem('weiguang.snapshot.v2');
    const current = parseSnapshot(JSON.parse(stored || 'null'));
    if (current) return { snapshot: normalizeSnapshot(current, today), firstRun: false };
  } catch { /* Invalid local cache enters the safe first-run flow. */ }
  return { snapshot: createEmptySnapshot(today), firstRun: true };
}

function nativeNotificationId(habitId: number, weekday: number) {
  return 100000 + ((Math.abs(habitId) % 100000) * 7 + weekday) % 900000;
}

async function syncHabitReminder(habit: Habit, requestPermission = true) {
  if (!Capacitor.isNativePlatform()) return true;
  const notificationIds = everyDay.map((weekday) => ({ id: nativeNotificationId(habit.id, weekday) }));
  if (habit.paused || !habit.reminder || (habit.frequency === 'weekdays' && habit.days.length === 0)) {
    await LocalNotifications.cancel({ notifications: notificationIds });
    return true;
  }
  let permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted' && requestPermission) permission = await LocalNotifications.requestPermissions();
  if (permission.display !== 'granted') return false;
  await LocalNotifications.cancel({ notifications: notificationIds });
  const [hour, minute] = habit.reminder.split(':').map(Number);
  const schedule = normalizeHabitSchedule(habit);
  if (schedule.frequency === 'interval') {
    const dates: Date[] = [];
    const today = toDateKey(new Date());
    for (let offset = 0; offset <= schedule.intervalDays * 7; offset += 1) {
      const key = shiftDate(today, offset);
      const at = fromDateKey(key); at.setHours(hour, minute, 0, 0);
      if (isHabitScheduled(habit, key) && at.getTime() > Date.now()) dates.push(at);
      if (dates.length === 7) break;
    }
    await LocalNotifications.schedule({ notifications: dates.map((at, index) => ({ id: nativeNotificationId(habit.id, everyDay[index]), title: `微光 · ${habit.title}`, body: '今天是执行日，记得给自己留一点时间。', schedule: { at }, extra: { habitId: habit.id } })) });
  } else {
    const days = schedule.frequency === 'weekly' ? [1] : schedule.frequency === 'daily' ? everyDay : habit.days;
    await LocalNotifications.schedule({ notifications: days.map((weekday) => ({
      id: nativeNotificationId(habit.id, weekday), title: `微光 · ${habit.title}`,
      body: schedule.frequency === 'weekly' ? '新的一周开始了，本周找时间完成这个习惯吧。' : `到了记录“${habit.title}”的时间。慢慢来，也是在前进。`,
      schedule: { on: { weekday: weekday + 1, hour, minute }, repeats: true }, extra: { habitId: habit.id },
    })) });
  }
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

async function registerOfflineApp() {
  if (!('serviceWorker' in navigator)) return;
  try {
    if (window.location.hostname === '127.0.0.1' && window.location.port === '17895') {
      // Windows carries its own offline bundle. Old web caches must not mask a native update.
      await Promise.all((await navigator.serviceWorker.getRegistrations()).map((registration) => registration.unregister()));
      await Promise.all((await caches.keys()).filter((key) => key.startsWith('weiguang-')).map((key) => caches.delete(key)));
      return;
    }
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const urls = [window.location.href, ...performance.getEntriesByType('resource').map((entry) => entry.name)];
    (registration.active || registration.waiting || registration.installing)?.postMessage({ type: 'CACHE_ASSETS', urls });
  } catch { /* The browser app remains usable online when offline setup is unavailable. */ }
}

function HabitScheduleFields({ value, onChange, today }: { value: HabitSchedule & { days: number[] }; onChange: (value: HabitSchedule & { days: number[] }) => void; today: string }) {
  const schedule = normalizeHabitSchedule(value);
  return <div className="editor-group">
    <label>执行周期<select value={schedule.frequency} onChange={(event) => onChange({ ...value, frequency: event.target.value as HabitSchedule['frequency'], startDate: schedule.startDate === '0001-01-01' ? today : schedule.startDate })}>
      <option value="daily">每天</option><option value="weekly">每周累计</option><option value="interval">每隔几天</option><option value="weekdays">指定星期</option>
    </select></label>
    {schedule.frequency === 'weekly' && <p className="habit-step-hint">周一至周日累计完成目标，周一重新开始。例如：每周打扫房间 1 次。</p>}
    {schedule.frequency === 'interval' && <><div className="editor-row"><label>每几天执行一次<input type="number" min="2" max="365" step="1" value={value.intervalDays ?? 2} onChange={(event) => onChange({ ...value, intervalDays: Number(event.target.value) })} /></label><label>开始日期<input type="date" value={value.startDate || today} onChange={(event) => onChange({ ...value, startDate: event.target.value })} /></label></div><p className="habit-step-hint">填 2 表示隔天一次，从开始日期起计算。系统提醒预排接下来 7 次，每次打开应用时续排。</p></>}
    {schedule.frequency === 'weekdays' && <><label>执行星期</label><div className="day-picker">{weekDayOptions.map((day) => <button type="button" key={day.value} className={value.days.includes(day.value) ? 'active' : ''} onClick={() => onChange({ ...value, days: value.days.includes(day.value) ? value.days.filter((item) => item !== day.value) : [...value.days, day.value] })}>{day.label}</button>)}</div></>}
  </div>;
}
function validHabitSchedule(value: HabitSchedule & { days: number[] }) {
  if (value.frequency === 'weekdays') return value.days.length > 0;
  if (value.frequency !== 'interval') return true;
  return Number.isInteger(value.intervalDays) && value.intervalDays! >= 2 && value.intervalDays! <= 365 && !!value.startDate && toDateKey(fromDateKey(value.startDate)) === value.startDate;
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
  const [addSchedule, setAddSchedule] = useState<HabitSchedule & { days: number[] }>({ frequency: 'daily', intervalDays: 2, days: everyDay });
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
  const [companionReaction, setCompanionReaction] = useState('');
  const [companionPulse, setCompanionPulse] = useState(0);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [rollbackAvailable, setRollbackAvailable] = useState(false);
  const dialogReturnFocus = useRef<HTMLElement | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveSequence = useRef(0);
  const isNative = Capacitor.isNativePlatform();
  const taskEditorOpen = taskEditor !== null;
  const habitEditorOpen = habitEditor !== null;

  useEffect(() => {
    const now = new Date();
    const today = toDateKey(now);
    const isWindowsApp = window.location.hostname === '127.0.0.1' && window.location.port === '17895';
    void (async () => {
      const local = await readLocal(today);
      setTodayKey(today); setSelectedDate(today); setGreeting(timeGreeting(now.getHours()));
      setSnapshot(local.snapshot); setWelcome(local.firstRun); setReady(true);
       const rollback = isNative ? (await Preferences.get({ key: rollbackKey })).value : window.localStorage.getItem(rollbackKey);
       setRollbackAvailable(Boolean(rollback)); setSyncState('saved');
      if (isNative) void syncAllHabitReminders(local.snapshot.habits);
    })();
    if (isNative) document.body.classList.add('native-app');
    else void registerOfflineApp();
    const captureInstall = (event: Event) => { event.preventDefault(); if (!isWindowsApp) setInstallPrompt(event as InstallPromptEvent); };
    if (!isWindowsApp) window.addEventListener('beforeinstallprompt', captureInstall);
    return () => { if (!isWindowsApp) window.removeEventListener('beforeinstallprompt', captureInstall); document.body.classList.remove('native-app'); };
  }, [isNative]);

  useEffect(() => {
    if (!isNative) return;
    const listener = App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      const now = new Date();
      const nextToday = toDateKey(now);
      setGreeting(timeGreeting(now.getHours()));
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
    const payload = JSON.stringify(snapshot);
    const sequence = ++saveSequence.current;
    const operation = saveQueue.current.catch(() => undefined).then(async () => {
      if (saveSequence.current === sequence) setSyncState('saving');
      if (isNative) await Preferences.set({ key: snapshotKey, value: payload });
      else window.localStorage.setItem(snapshotKey, payload);
    });
    saveQueue.current = operation;
    void operation.then(() => { if (saveSequence.current === sequence) setSyncState('saved'); }).catch(() => { if (saveSequence.current === sequence) setSyncState('error'); });
  }, [snapshot, ready, isNative, welcome]);

  useEffect(() => {
    document.documentElement.dataset.weiguangUpdateReady = String(ready && syncState === 'saved');
    return () => { delete document.documentElement.dataset.weiguangUpdateReady; };
  }, [ready, syncState]);

  useEffect(() => {
    if (!welcome && !modal && !dataModal && selectedPlanId === null && !taskEditorOpen && !habitEditorOpen) return;
    const previousOverflow = document.body.style.overflow;
    const returnFocus = dialogReturnFocus.current;
    const dialog = document.querySelector<HTMLElement>('.modal-layer [role="dialog"]');
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [href]';
    const focusableElements = () => dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => element.getClientRects().length > 0) : [];
    document.body.style.overflow = 'hidden';
    if (dialog && !dialog.contains(document.activeElement)) (dialog.querySelector<HTMLElement>('[autofocus]') ?? focusableElements()[0])?.focus();
    const handleDialogKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !welcome) { setModal(false); setDataModal(false); setSelectedPlanId(null); setTaskEditor(null); setHabitEditor(null); return; }
      if (event.key !== 'Tab') return;
      if (!dialog) return;
      const focusable = focusableElements();
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handleDialogKey);
    return () => { window.removeEventListener('keydown', handleDialogKey); document.body.style.overflow = previousOverflow; if (returnFocus?.isConnected) returnFocus.focus(); dialogReturnFocus.current = null; };
  }, [welcome, modal, dataModal, selectedPlanId, taskEditorOpen, habitEditorOpen]);

  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2200); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => { if (!companionReaction) return; const timer = window.setTimeout(() => setCompanionReaction(''), 3200); return () => window.clearTimeout(timer); }, [companionReaction, companionPulse]);

  const { tasks, habits, plans } = snapshot;
  const activePlans = plans.filter((plan) => !plan.archived);
  const archivedPlans = plans.filter((plan) => plan.archived);
  const visiblePlans = showArchivedPlans ? archivedPlans : activePlans;
  const recordFor = (key: string) => snapshot.records[key] || emptyRecord();
  const habitStateFor = (habit: Habit, key: string) => habitRevisionFor(habit, key);
  const isScheduled = isHabitScheduled;
  const valueFor = (habit: Habit, key: string) => habitValueFor(habit, key, snapshot.records);
  const selectedRecord = recordFor(selectedDate);
  const selectedTasks = tasks.filter((task) => task.date === selectedDate);
  const selectedHabits = habits.filter((habit) => isScheduled(habit, selectedDate));
  const taskDone = selectedTasks.filter((task) => selectedRecord.taskDone.includes(task.id)).length;
  const habitDone = selectedHabits.filter((habit) => (valueFor(habit, selectedDate)) >= habitStateFor(habit, selectedDate).target).length;
  const habitPartial = selectedHabits.filter((habit) => { const value = valueFor(habit, selectedDate); const target = habitStateFor(habit, selectedDate).target; return value > 0 && value < target; }).length;
  const habitContribution = selectedHabits.reduce((sum, habit) => sum + habitProgress(valueFor(habit, selectedDate), habitStateFor(habit, selectedDate).target).cappedPercent / 100, 0);
  const todayTotal = selectedTasks.length + selectedHabits.length;
  const todayDone = taskDone + habitDone;
  const progress = todayTotal ? Math.round(((taskDone + habitContribution) / todayTotal) * 100) : 0;
  const averagePlan = activePlans.length ? Math.round(activePlans.reduce((sum, plan) => sum + planProgress(plan), 0) / activePlans.length) : 0;
  const weekDays = useMemo(() => getWeekKeys(todayKey), [todayKey]);
  const monthDays = useMemo(() => getMonthKeys(todayKey), [todayKey]);
  const monthToDateDays = useMemo(() => getMonthToDateKeys(todayKey), [todayKey]);
  const rangeDays = reviewRange === 'week' ? weekDays : monthToDateDays;
  const previousDays = reviewRange === 'week' ? weekDays.map((key) => shiftDate(key, -7)) : getPreviousMonthToDateKeys(todayKey);

  function completionForDate(key: string) {
    const dayTasks = tasks.filter((task) => task.date === key);
    const scheduled = habits.filter((habit) => isScheduled(habit, key));
    const record = recordFor(key);
    const doneTasks = dayTasks.filter((task) => record.taskDone.includes(task.id)).length;
    const habitContribution = scheduled.reduce((sum, habit) => sum + habitProgress(valueFor(habit, key), habitStateFor(habit, key).target).cappedPercent / 100, 0);
    const total = dayTasks.length + scheduled.length;
    return total ? Math.round(((doneTasks + habitContribution) / total) * 100) : 0;
  }

  const rangeBars = rangeDays.map(completionForDate);
  const previousBars = previousDays.map(completionForDate);
  const rangeAverage = rangeBars.length ? Math.round(rangeBars.reduce((sum, value) => sum + value, 0) / rangeBars.length) : 0;
  const previousAverage = previousBars.length ? Math.round(previousBars.reduce((sum, value) => sum + value, 0) / previousBars.length) : 0;
  const trend = rangeAverage - previousAverage;
  const rangeTaskDone = tasks.filter((task) => rangeDays.includes(task.date) && recordFor(task.date).taskDone.includes(task.id)).length;
  const rangeTaskTotal = tasks.filter((task) => rangeDays.includes(task.date)).length;
  const rangeHabitPeriods = habits.flatMap((habit) => {
    const periods = new Map<string, string>();
    rangeDays.filter((key) => isScheduled(habit, key)).forEach((key) => periods.set(habitPeriodStart(habit, key), key));
    return [...periods.values()].map((key) => ({ habit, key }));
  });
  const rangeHabitPossible = rangeHabitPeriods.length;
  const rangeHabitDone = rangeHabitPeriods.filter(({ habit, key }) => valueFor(habit, key) >= habitStateFor(habit, key).target).length;
  const todayHabitStates = habits.filter((habit) => isScheduled(habit, todayKey)).map((habit) => habitProgress(valueFor(habit, todayKey), habitStateFor(habit, todayKey).target));
  const todayHabitExceeded = todayHabitStates.filter((state) => state.status === 'exceeded').length;
  const todayHabitComplete = todayHabitStates.filter((state) => state.status === 'complete').length;
  const todayHabitInProgress = todayHabitStates.filter((state) => state.status === 'in-progress').length;
  const bestDayIndex = rangeBars.indexOf(Math.max(...rangeBars));
  const bestDate = rangeDays[Math.max(0, bestDayIndex)] || todayKey;
  const isToday = selectedDate === todayKey;
  const selectedLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(fromDateKey(selectedDate));
  const header = copy[view];
  const syncCopy = syncState === 'loading' ? '正在读取' : syncState === 'saving' ? '正在保存' : syncState === 'error' ? '保存失败' : isNative ? '已保存在此 iPhone' : '已保存在本机';
  const syncDescription = syncState === 'error' ? '本次更改未能写入存储，请先导出备份，再检查设备空间或浏览器权限。' : syncState === 'saving' ? '正在将最新更改写入当前设备。' : '无需注册账号；计划、习惯、待办和记录仅保存在当前设备。';
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) || null;
  const companion = getCompanionState(progress, todayTotal, new Date().getHours());
  const companionViewMessage = view === 'plans' ? '大目标也会被一小步一小步照亮。' : view === 'habits' ? '重复的小事，会悄悄长成你的力量。' : view === 'review' ? '这些微小的痕迹，我都替你记得。' : !isToday ? '这一天留下的努力，我也记得。' : companion.message;
  const companionMessage = companionReaction || companionViewMessage;
  const companionMood: CompanionMood = companionReaction ? 'bright' : companion.mood;
  const companionNote = view === 'today' ? (todayTotal ? `${isToday ? '今天' : selectedLabel} ${todayDone} / ${todayTotal} 项被小光看见` : `${isToday ? '今天' : '这一天'}可以从任何一件小事开始`) : '摸摸小光，让自己停一小会儿';

  function updateSnapshot(change: (current: AppSnapshot) => AppSnapshot) { setSnapshot((current) => stamp(change(current))); }
  function updateRecord(key: string, change: (record: DailyRecord) => DailyRecord) { updateSnapshot((current) => ({ ...current, records: { ...current.records, [key]: change(current.records[key] || emptyRecord()) } })); }
  function navigate(next: View) { setView(next); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function rememberDialogTrigger() { dialogReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }
  function openDataModal() { rememberDialogTrigger(); setDataModal(true); }
  function openAdd(kind: AddKind) { rememberDialogTrigger(); setAddKind(kind); setTitle(''); setDetail(''); setTaskNote(''); setPlanChoice(''); setPlanDeadline(''); setAddSchedule({ frequency: 'daily', intervalDays: 2, startDate: todayKey, days: everyDay }); setModal(true); }
  function openPlan(plan: Plan) { rememberDialogTrigger(); setSelectedPlanId(plan.id); setPlanTitleDraft(plan.title); setPlanDetailDraft(plan.detail); setPlanDeadlineDraft(plan.deadline); }
  function openTaskEditor(task: Task) { rememberDialogTrigger(); setTaskEditor({ ...task }); }
  function openHabitEditor(habit: Habit) { rememberDialogTrigger(); setHabitEditor({ ...habit }); }
  function changeHabitTarget(target: number) {
    setHabitEditor((current) => {
      if (!current) return current;
      const nextTarget = Number.isFinite(target) && target > 0 ? target : 1;
      const followsRecommendation = current.step === recommendedHabitStep(current.target, current.unit);
      return { ...current, target: nextTarget, step: followsRecommendation ? recommendedHabitStep(nextTarget, current.unit) : sanitizeHabitStep(current.step, nextTarget, current.unit) };
    });
  }
  function changeHabitUnit(unit: string) {
    setHabitEditor((current) => {
      if (!current) return current;
      const followsRecommendation = current.step === recommendedHabitStep(current.target, current.unit);
      return { ...current, unit, step: followsRecommendation ? recommendedHabitStep(current.target, unit) : current.step };
    });
  }
  function wakeCompanion(message: string) { setCompanionReaction(message); setCompanionPulse((current) => current + 1); }
  function petCompanion() {
    const messages = ['嗯，我在这里。', '今天也辛苦啦。', '慢一点也没有关系。'];
    wakeCompanion(messages[companionPulse % messages.length]);
    nativeImpact();
  }

  function submitAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const cleanTitle = title.trim(); if (!cleanTitle) return; const id = Date.now();
    if (addKind === 'task') {
      updateSnapshot((current) => ({ ...current, tasks: [...current.tasks, { id, title: cleanTitle, time: detail.trim() || '未设时间', note: taskNote.trim(), tag: '新建', date: selectedDate, ...(planChoice ? { planId: Number(planChoice) } : {}) }] }));
      setToast(`待办已加入${isToday ? '今天' : selectedLabel}`);
    } else if (addKind === 'habit') {
      if (!validHabitSchedule(addSchedule)) { setToast('请选择执行星期，或填写 2–365 的整数间隔和有效开始日期'); return; }
      const target = Math.max(1, Number(detail) || 1);
      if (!Number.isFinite(target)) { setToast('请填写有效目标'); return; }
      const step = recommendedHabitStep(target, '次');
      updateSnapshot((current) => ({ ...current, habits: [...current.habits, { ...addSchedule, id, icon: cleanTitle.slice(0, 1), title: cleanTitle, target, step, unit: '次', color: 'violet', days: addSchedule.days, paused: false, reminder: '', revisions: [{ ...addSchedule, effectiveFrom: todayKey, target, step, unit: '次', days: addSchedule.days, paused: false }] }] })); setToast('新习惯已创建');
    } else {
      updateSnapshot((current) => ({ ...current, plans: [...current.plans, { id, title: cleanTitle, detail: detail.trim() || '个人计划', progress: 0, color: 'blue', next: '下一步：添加第一个里程碑', milestones: [], deadline: planDeadline, archived: false }] })); setToast('计划已开始');
    }
    setModal(false);
  }

  function toggleTask(id: number, key = selectedDate) { const completing = !recordFor(key).taskDone.includes(id); updateRecord(key, (record) => ({ ...record, taskDone: record.taskDone.includes(id) ? record.taskDone.filter((taskId) => taskId !== id) : [...record.taskDone, id] })); if (completing) { nativeSuccess(); wakeCompanion('又完成一件，我都看见啦。'); } else nativeImpact(); }
  function removeTask(id: number) { const task = tasks.find((item) => item.id === id); if (!task || !window.confirm(`删除待办“${task.title}”吗？相关完成记录也会一并删除。`)) return; updateSnapshot((current) => ({ ...current, tasks: current.tasks.filter((item) => item.id !== id), records: Object.fromEntries(Object.entries(current.records).map(([key, record]) => [key, { ...record, taskDone: record.taskDone.filter((taskId) => taskId !== id) }])) })); setToast('待办已移除'); }
  function saveTaskEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taskEditor) return;
    const original = tasks.find((task) => task.id === taskEditor.id);
    const cleanTitle = taskEditor.title.trim();
    if (!original || !cleanTitle || !taskEditor.date) return;
    const edited: Task = { ...taskEditor, title: cleanTitle, time: taskEditor.time.trim() || '未设时间', note: taskEditor.note.trim() };
    updateSnapshot((current) => {
      const records = moveTaskCompletion(current.records, edited.id, original.date, edited.date);
      return { ...current, tasks: current.tasks.map((task) => task.id === edited.id ? edited : task), records };
    });
    if (original.date !== edited.date) setSelectedDate(edited.date);
    setTaskEditor(null); nativeImpact(ImpactStyle.Medium); setToast(original.date === edited.date ? '待办已更新' : '待办已移动，完成状态已保留');
  }
  function changeHabitProgress(id: number, amount: number, key = view === 'today' ? selectedDate : todayKey) {
    const habit = habits.find((item) => item.id === id);
    if (!habit || !isScheduled(habit, key) || key > todayKey) return;
    const habitState = habitStateFor(habit, key);
    const appliedAmount = amount < 0 ? -habitState.step : habitState.step;
    const currentValue = recordFor(key).habits[String(id)] || 0;
    const nextValue = changeHabitValue(currentValue, appliedAmount);
    if (nextValue === currentValue) return;
    updateRecord(key, (record) => ({ ...record, habits: { ...record.habits, [String(id)]: nextValue } }));
    const totalBefore = valueFor(habit, key);
    const totalAfter = changeHabitValue(totalBefore, nextValue - currentValue);
    const nextProgress = habitProgress(totalAfter, habitState.target);
    const crossedTarget = appliedAmount > 0 && totalBefore < habitState.target && totalAfter >= habitState.target;
    if (crossedTarget) { nativeSuccess(); wakeCompanion(`“${habit.title}”完成啦，尾巴都翘起来了。`); } else nativeImpact();
    if (key < todayKey) setToast(nextProgress.status === 'exceeded' ? `${habit.title} 已补记至 ${nextProgress.percent}%` : totalAfter >= habitState.target ? `${habit.title} 已补记完成` : `${habit.title} 的历史进度已更新`);
    else setToast(nextProgress.status === 'exceeded' ? `${habit.title} 超额完成 ${nextProgress.percent}%` : totalAfter >= habitState.target ? `${habit.title} 已完成` : appliedAmount > 0 ? `已记录 ${Math.abs(appliedAmount)} ${habitState.unit}` : `已减少 ${Math.abs(appliedAmount)} ${habitState.unit}`);
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
    }) })); if (completing) { nativeSuccess(); wakeCompanion('又向计划靠近了一步，真好。'); } else nativeImpact();
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
  function deleteSelectedPlan() {
    if (!selectedPlan) return;
    const linkedCount = tasks.filter((task) => task.planId === selectedPlan.id).length;
    const linkedCopy = linkedCount ? `${linkedCount} 项关联待办会保留，但会解除计划关联；` : '';
    if (!window.confirm(`删除计划“${selectedPlan.title}”吗？${linkedCopy}里程碑将一并删除。此操作无法撤销。`)) return;
    const planId = selectedPlan.id;
    updateSnapshot((current) => deletePlanFromSnapshot(current, planId));
    setSelectedPlanId(null);
    nativeImpact(ImpactStyle.Medium);
    setToast(linkedCount ? `计划已删除，${linkedCount} 项待办已保留` : '计划已删除');
  }

  async function saveHabitSettings() {
    if (!habitEditor) return;
    const cleanTitle = habitEditor.title.trim();
    if (!cleanTitle) { setToast('请为习惯填写名称'); return; }
    if (!validHabitSchedule(habitEditor)) { setToast('请选择执行星期，或填写 2–365 的整数间隔和有效开始日期'); return; }
    const unit = habitEditor.unit.trim() || '次';
    const target = Number.isFinite(habitEditor.target) && habitEditor.target > 0 ? habitEditor.target : 1;
    const savedHabit = upsertHabitRevision({ ...habitEditor, title: cleanTitle, icon: habitEditor.icon.trim() || cleanTitle.slice(0, 1), target, step: sanitizeHabitStep(habitEditor.step, target, unit), unit, days: habitEditor.days.length ? habitEditor.days : everyDay }, todayKey);
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
  function habitStreak(habit: Habit) { if (habit.paused) return 0; let streak = 0; for (let offset = 0; offset < 366; offset += 1) { const key = shiftDate(todayKey, -offset); const state = habitStateFor(habit, key); if (!isScheduled(habit, key)) continue; if (state.frequency === 'weekly' && offset > 0 && habitPeriodStart(habit, key) === habitPeriodStart(habit, shiftDate(key, 1))) continue; if ((valueFor(habit, key)) < state.target) break; streak += 1; } return streak; }

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
  async function writeImportRollback(value: AppSnapshot) {
    const payload = JSON.stringify(value);
    if (isNative) await Preferences.set({ key: rollbackKey, value: payload });
    else window.localStorage.setItem(rollbackKey, payload);
    setRollbackAvailable(true);
  }
  async function importData(file: File | undefined) {
    if (!file) return;
    try {
      const imported = parseSnapshot(JSON.parse(await file.text()));
      if (!imported) throw new Error('Invalid backup');
      const restored = stamp(normalizeSnapshot(imported, todayKey));
      const summary = `${restored.tasks.length} 项待办、${restored.habits.length} 个习惯、${restored.plans.length} 个计划`;
      if (!window.confirm(`这个备份包含 ${summary}。\n\n继续后将替换当前数据，微光会先保留一份恢复点。`)) return;
      try { await writeImportRollback(snapshot); } catch { setToast('无法创建恢复点，已取消导入'); return; }
      setSnapshot(restored);
      if (isNative) void syncAllHabitReminders(restored.habits);
      setDataModal(false); setToast('备份已恢复，原数据已保留');
    } catch { setToast('无法读取这个备份文件'); }
  }
  async function restoreImportRollback() {
    if (!window.confirm('恢复到上次导入之前吗？当前数据将被替换。')) return;
    try {
      const stored = isNative ? (await Preferences.get({ key: rollbackKey })).value : window.localStorage.getItem(rollbackKey);
      const rollback = parseSnapshot(JSON.parse(stored || 'null'));
      if (!rollback) throw new Error('Invalid rollback');
      const restored = stamp(normalizeSnapshot(rollback, todayKey));
      setSnapshot(restored);
      if (isNative) { await Preferences.remove({ key: rollbackKey }); void syncAllHabitReminders(restored.habits); }
      else window.localStorage.removeItem(rollbackKey);
      setRollbackAvailable(false); setDataModal(false); setToast('已恢复到导入前的状态');
    } catch { setRollbackAvailable(false); setToast('上次的恢复点已不可用'); }
  }
  function clearData() { if (!window.confirm('确定清空全部计划、习惯、待办和记录吗？此操作无法撤销，建议先导出备份。')) return; const empty = createEmptySnapshot(todayKey); setSnapshot(empty); if (isNative) void syncAllHabitReminders(empty.habits); setSelectedDate(todayKey); setDataModal(false); setToast('全部数据已清空'); }
  function restoreDemoData() { if (!window.confirm('用示例内容替换当前数据吗？现有计划、习惯、待办和记录会被覆盖，建议先导出备份。')) return; const seed = createSeedSnapshot(todayKey); setSnapshot(seed); if (isNative) void syncAllHabitReminders(seed.habits); setSelectedDate(todayKey); setDataModal(false); setToast('示例数据已恢复'); }
  async function installApp() { if (!installPrompt) return; await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); }
  function startBlank() { setWelcome(false); nativeImpact(ImpactStyle.Medium); setToast('欢迎来到微光，从一件小事开始吧'); }
  function loadDemo() { const seed = createSeedSnapshot(todayKey); setSnapshot(seed); setWelcome(false); if (isNative) void syncAllHabitReminders(seed.habits); nativeImpact(ImpactStyle.Medium); setToast('示例内容已载入，可以随时修改'); }

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <aside className="sidebar glass-panel"><button className="brand" onClick={() => navigate('today')} aria-label="微光首页"><span className="brand-mark">微</span><span>微光</span></button><nav className="nav-list" aria-label="主导航">{navItems.map((item) => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}><span>{item.short}</span>{item.label}</button>)}</nav><div className="sidebar-foot"><div className="streak-orb">{Math.max(0, ...habits.map(habitStreak))}</div><div><strong>最长连续记录</strong><small>今天也向前一点</small></div></div></aside>

      <section className="content">
        <header className="topbar"><div><p className="eyebrow">{view === 'today' ? selectedLabel : header.eyebrow}</p><h1>{view === 'today' ? (isToday ? `${greeting}，${header.title}` : '这一天，安排了什么？') : header.title}</h1></div><div className="top-actions"><button className={`sync-pill ${syncState}`} onClick={openDataModal} aria-label="打开数据管理"><i />{syncCopy}</button><button className="avatar" onClick={openDataModal} aria-label="打开微光信息">微</button></div></header>

        {view === 'today' && <><div className="date-controls glass-panel"><button onClick={() => setSelectedDate(shiftDate(selectedDate, -1))} aria-label="前一天">‹</button><div><strong>{isToday ? '今天' : selectedLabel}</strong><span>{selectedTasks.length} 项待办 · {habitDone}/{selectedHabits.length} 项习惯达标{habitPartial ? ` · ${habitPartial} 项进行中` : ''}</span></div>{!isToday && <button className="back-today" onClick={() => setSelectedDate(todayKey)}>回到今天</button>}<button onClick={() => setSelectedDate(shiftDate(selectedDate, 1))} aria-label="后一天">›</button></div><section className="overview glass-panel" aria-label="所选日期进度"><div><span className="section-label">{isToday ? '今日进度' : '当日进度'}</span><strong>{progress === 100 ? '这一天的约定，都完成了。' : '慢慢来，也是在前进。'}</strong><p>{habitPartial ? `${habitPartial} 项习惯正在进行；` : ''}已达标 {todayDone} 项，还有 {todayTotal - todayDone} 项未达标。</p></div><div className="progress-ring" style={{ '--progress': `${progress}%` } as CSSProperties}><span>{progress}<small>%</small></span></div></section><CompanionCard className="companion-mobile" mood={companionMood} message={companionMessage} note={companionNote} pulse={companionPulse} onPet={petCompanion} /><section className="task-section" aria-labelledby="today-tasks"><div className="section-head"><div><span className="section-label">待办</span><h2 id="today-tasks">{isToday ? '今天' : selectedLabel}</h2></div><button className="add-button" onClick={() => openAdd('task')}><span>＋</span> 添加待办</button></div><div className="task-list glass-panel">{selectedTasks.length === 0 && <EmptyState text="这一天还没有待办，给自己安排一件小事吧。" onAdd={() => openAdd('task')} />}{selectedTasks.map((task) => { const done = selectedRecord.taskDone.includes(task.id); const linkedPlan = plans.find((plan) => plan.id === task.planId); const meta = [task.time !== '未设时间' ? task.time : '', task.note].filter(Boolean).join(' · ') || '未设时间'; return <article className={`task-row ${done ? 'is-done' : ''}`} key={task.id}><button className="check" onClick={() => toggleTask(task.id)} aria-label={`${done ? '取消完成' : '完成'} ${task.title}`}>{done ? '✓' : ''}</button><button className="task-copy task-edit" onClick={() => openTaskEditor(task)} aria-label={`编辑 ${task.title}`}><strong>{task.title}</strong><span>{meta}</span></button><span className={`tag ${linkedPlan ? 'linked' : ''}`}>{linkedPlan ? linkedPlan.title : task.tag}</span><button className="remove" onClick={() => removeTask(task.id)} aria-label={`删除 ${task.title}`}>×</button></article>; })}</div></section><section className={`task-section day-habit-section ${isToday ? '' : 'historical'}`} aria-labelledby="day-habits"><div className="section-head"><div><span className="section-label">习惯记录</span><h2 id="day-habits">{selectedDate > todayKey ? '未来日期暂不能记录' : isToday ? '今天的习惯' : '补记或减少'}</h2></div><button className="add-button" onClick={() => navigate('habits')}>管理习惯</button></div><div className="day-habit-list glass-panel">{selectedHabits.length === 0 && <div className="day-habit-empty">这一天没有安排习惯，好好休息也是计划的一部分。</div>}{selectedHabits.map((habit) => { const state = habitStateFor(habit, selectedDate); const value = valueFor(habit, selectedDate); const habitProgressState = habitProgress(value, state.target); const locked = selectedDate > todayKey; return <article className={`day-habit-row ${habitProgressState.status}`} key={habit.id}><div className={`habit-icon ${habit.color}`}>{habit.icon}</div><div className="day-habit-copy"><strong>{habit.title}</strong><span>{locked ? '到那一天再来记录' : `${habitScheduleCopy(state)} · ${habitProgressState.label} · ${value} / ${state.target} ${state.unit} · 每次 ${state.step}`}</span><i><b style={{ width: `${habitProgressState.cappedPercent}%` }} /></i></div><div className="habit-stepper"><button onClick={() => changeHabitProgress(habit.id, -state.step, selectedDate)} disabled={locked || !(recordFor(selectedDate).habits[String(habit.id)] || 0)} aria-label={`减少 ${state.step} ${state.unit}：${habit.title}`}>−</button><button onClick={() => changeHabitProgress(habit.id, state.step, selectedDate)} disabled={locked} aria-label={`增加 ${state.step} ${state.unit}：${habit.title}`}>＋</button></div></article>; })}</div></section></>}

        {view === 'plans' && <section className="view-section"><div className="section-head"><div><span className="section-label">{activePlans.length} 个进行中 · {archivedPlans.length} 个已归档</span><h2>{showArchivedPlans ? '完成过的，也值得被看见' : '把大目标拆成下一步'}</h2></div><div className="plan-head-actions"><button className={`archive-filter ${showArchivedPlans ? 'active' : ''}`} onClick={() => setShowArchivedPlans((current) => !current)}>{showArchivedPlans ? '返回进行中' : `查看归档 ${archivedPlans.length || ''}`}</button><button className="add-button" onClick={() => openAdd('plan')}><span>＋</span> 新建计划</button></div></div>{visiblePlans.length === 0 ? <div className="plan-empty glass-panel"><EmptyState text={showArchivedPlans ? '还没有归档计划，完成后再把它温柔地收好。' : '还没有进行中的计划，从一个清晰的小目标开始。'} onAdd={() => showArchivedPlans ? setShowArchivedPlans(false) : openAdd('plan')} /></div> : <div className="plan-grid">{visiblePlans.map((plan) => { const calculated = planProgress(plan); const linkedCount = tasks.filter((task) => task.planId === plan.id).length; return <article className={`plan-card glass-panel ${plan.archived ? 'archived' : ''}`} key={plan.id}><div className={`plan-accent ${plan.color}`} /><div className="plan-title"><span>{plan.detail}</span><strong>{plan.title}</strong></div><div className={`plan-deadline ${plan.deadline && plan.deadline < todayKey ? 'overdue' : ''}`}>{plan.archived ? '已归档' : planDeadlineCopy(plan.deadline, todayKey)}</div><div className="plan-percent"><b>{calculated}%</b><span>{plan.milestones.filter((item) => item.done).length}/{plan.milestones.length} 里程碑</span></div><div className="plan-progress"><i style={{ width: `${calculated}%` }} /></div><p>{nextMilestoneCopy(plan.milestones)} · {linkedCount} 项关联待办</p><button onClick={() => openPlan(plan)}>查看计划</button></article>; })}</div>}</section>}

        {view === 'habits' && <section className="view-section"><div className="section-head"><div><span className="section-label">自定义执行周期</span><h2>今日：{todayHabitExceeded} 超额 · {todayHabitComplete} 完成 · {todayHabitInProgress} 进行中</h2></div><button className="add-button" onClick={() => openAdd('habit')}><span>＋</span> 新建习惯</button></div><div className="habit-board glass-panel"><div className="habit-week-head"><span>习惯</span>{weekDays.map((key) => <small key={key}>{shortWeekday(key)}</small>)}</div>{habits.map((habit) => { const todayState = habitStateFor(habit, todayKey); const scheduledToday = isScheduled(habit, todayKey); const todayValue = valueFor(habit, todayKey); const todayProgress = habitProgress(todayValue, todayState.target); return <article className={`habit-board-row ${todayState.paused ? 'paused' : ''}`} key={habit.id}><button className="habit-name habit-name-button" onClick={() => openHabitEditor(habit)}><div className={`habit-icon ${habit.color}`}>{habit.icon}</div><div><strong>{habit.title}</strong><span>{todayState.paused ? '已暂停' : `${habitScheduleCopy(todayState)} · ${scheduledToday ? todayProgress.label : '休息日'} · 连续 ${habitStreak(habit)} ${todayState.frequency === 'weekly' ? '周' : '次'}`}</span></div></button>{weekDays.map((key) => { const state = habitStateFor(habit, key); const scheduled = isScheduled(habit, key); const value = valueFor(habit, key); const dayProgress = habitProgress(value, state.target); const shortLabel = dayProgress.status === 'exceeded' ? `+${dayProgress.percent - 100}%` : dayProgress.status === 'complete' ? '✓' : dayProgress.status === 'in-progress' ? `${dayProgress.percent}%` : ''; return <i key={key} className={scheduled ? dayProgress.status : 'skipped'} title={scheduled ? dayProgress.label : '休息日'} aria-label={scheduled ? `${key} ${dayProgress.label}` : `${key} 休息日`}>{scheduled ? shortLabel : '·'}</i>; })}<button onClick={() => changeHabitProgress(habit.id, todayState.step, todayKey)} disabled={!scheduledToday}>{todayState.paused ? '暂停' : !scheduledToday ? '休息日' : `+${todayState.step} ${todayState.unit}`}</button></article>; })}</div><div className="gentle-note glass-panel"><span>小提醒</span><p>进度会保留为具体百分比，也可以超过 100%；新的目标、单位与执行周期只从今天起生效。</p></div></section>}

        {view === 'review' && <section className="view-section"><div className="review-toolbar"><div className="range-switch"><button className={reviewRange === 'week' ? 'active' : ''} onClick={() => setReviewRange('week')}>本周</button><button className={reviewRange === 'month' ? 'active' : ''} onClick={() => setReviewRange('month')}>本月</button></div><span>{reviewRange === 'week' ? '最近 7 天' : `${new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(fromDateKey(todayKey))} · 截至今日`}</span></div><div className="metric-grid"><Metric label={`${reviewRange === 'week' ? '本周' : '本月至今'}待办`} value={`${rangeTaskDone}`} note={`共 ${rangeTaskTotal} 项`} tone="violet" /><Metric label="习惯达标周期" value={`${rangeHabitDone}`} note={`计划 ${rangeHabitPossible} 次`} tone="blue" /><Metric label="平均完成率" value={`${rangeAverage}%`} note={`计划均值 ${averagePlan}%`} tone="orange" /></div>{reviewRange === 'week' ? <article className="review-chart glass-panel"><div className="section-head"><div><span className="section-label">真实完成率</span><h2>最近 7 天</h2></div><span className={`trend ${trend < 0 ? 'down' : ''}`}>{trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% 较上周</span></div><div className="bars" aria-label="最近七天完成率柱状图">{rangeBars.map((height, index) => <div key={rangeDays[index]}><i style={{ height: `${Math.max(height, 4)}%` }} className={index === rangeBars.length - 1 ? 'today' : ''} /><small>{shortWeekday(rangeDays[index])}</small></div>)}</div></article> : <article className="month-card glass-panel"><div className="section-head"><div><span className="section-label">月度热力图</span><h2>每天都有痕迹</h2></div><span className={`trend ${trend < 0 ? 'down' : ''}`}>{trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% 较上月同期</span></div><div className="month-weekdays">{weekDayOptions.map((day) => <span key={day.value}>{day.label}</span>)}</div><div className="month-grid" style={{ '--offset': (fromDateKey(monthDays[0]).getDay() + 6) % 7 } as CSSProperties}>{monthDays.map((key) => { const value = completionForDate(key); return <div key={key} className={key === todayKey ? 'today' : ''} style={{ '--heat': `${Math.max(.06, value / 100)}` } as CSSProperties}><strong>{fromDateKey(key).getDate()}</strong><small>{key > todayKey ? '·' : `${value}%`}</small></div>; })}</div></article>}<article className="review-note glass-panel"><div className="quote-mark">“</div><div><span className="section-label">{reviewRange === 'week' ? '本周发现' : '本月至今'}</span><h2>{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(fromDateKey(bestDate))}状态最好</h2><p>{reviewRange === 'week' ? '本周' : '本月至今'}平均完成率为 {rangeAverage}%。报告由实际执行周期、待办和习惯记录生成。</p></div></article></section>}
      </section>

      <aside className="right-rail"><CompanionCard className="companion-desktop" mood={companionMood} message={companionMessage} note={companionNote} pulse={companionPulse} onPet={petCompanion} /><div className="rail-head"><div><span className="section-label">{view === 'today' && !isToday ? selectedLabel : '保持节奏'}</span><h2>{view === 'today' && !isToday ? '当日习惯' : '今日习惯'}</h2></div><button onClick={() => openAdd('habit')} aria-label="添加习惯">＋</button></div><div className="habit-stack">{habits.filter((habit) => !habitStateFor(habit, view === 'today' ? selectedDate : todayKey).paused).map((habit) => { const key = view === 'today' ? selectedDate : todayKey; const state = habitStateFor(habit, key); const scheduled = isScheduled(habit, key); const value = valueFor(habit, key); const progressState = habitProgress(value, state.target); const locked = key > todayKey; return <article className={`habit-card glass-panel ${scheduled ? progressState.status : 'resting'}`} key={habit.id}><button className={`habit-icon ${habit.color}`} onClick={() => openHabitEditor(habit)} aria-label={`编辑习惯 ${habit.title}`}>{habit.icon}</button><div className="habit-info"><strong>{habit.title}</strong><span>{scheduled ? locked ? '未来日期暂不能记录' : `${habitScheduleCopy(state)} · ${progressState.label} · ${value} / ${state.target} ${state.unit}` : '今天休息'}</span></div><div className="habit-quick-actions"><button onClick={() => changeHabitProgress(habit.id, -state.step, key)} disabled={!scheduled || locked || !(recordFor(key).habits[String(habit.id)] || 0)} aria-label={`减少 ${state.step} ${state.unit}：${habit.title}`}>−</button><button onClick={() => changeHabitProgress(habit.id, state.step, key)} disabled={!scheduled || locked} aria-label={`增加 ${state.step} ${state.unit}：${habit.title}`}>+</button></div><div className="mini-progress"><i style={{ width: `${progressState.cappedPercent}%` }} /></div></article>; })}</div><article className="reflection glass-panel"><span>今日一句</span><blockquote>“不需要很厉害才开始，开始了才会慢慢变厉害。”</blockquote><div className="week-dots">{weekDays.map((key) => <div key={key}><i className={completionForDate(key) >= 60 ? 'filled' : ''} /><small>{shortWeekday(key)}</small></div>)}</div></article></aside>

      <nav className="mobile-nav glass-panel" aria-label="移动端导航">{navItems.slice(0, 2).map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><span>{item.short}</span>{item.label}</button>)}<button className="mobile-add" onClick={() => openAdd('task')} aria-label="快速添加">＋</button>{navItems.slice(2).map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><span>{item.short}</span>{item.label}</button>)}</nav>

      {welcome && <div className="modal-layer welcome-layer"><section className="modal welcome-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="welcome-title"><div className="welcome-brand"><span className="brand-mark">微</span><span>微光</span></div><span className="section-label">第一次见面</span><h2 id="welcome-title">把每一点行动，慢慢变成生活</h2><p>这里没有必须完成的清单。先写下一件待办、一个想培养的习惯，或一段值得推进的计划。</p><div className="welcome-points"><div><b>今</b><span><strong>从今天开始</strong><small>待办、习惯和计划放在同一个节奏里</small></span></div><div><b>存</b><span><strong>由你保管</strong><small>无需登录，内容只保存在当前设备</small></span></div></div><button className="submit-button" onClick={startBlank} autoFocus>从空白开始</button><button className="welcome-demo" onClick={loadDemo}>先看看示例</button><small className="welcome-note">之后可在“数据与安装”中导出备份或恢复示例内容</small></section></div>}

      {modal && <div className="modal-layer" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setModal(false)}><section className="modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="add-title"><button className="modal-close" onClick={() => setModal(false)} aria-label="关闭">×</button><span className="section-label">快速记录</span><h2 id="add-title">把想法放进微光</h2><div className="kind-switch">{(['task', 'habit', 'plan'] as AddKind[]).map((kind) => <button key={kind} className={addKind === kind ? 'active' : ''} onClick={() => setAddKind(kind)}>{kind === 'task' ? '待办' : kind === 'habit' ? '习惯' : '计划'}</button>)}</div><form onSubmit={submitAdd}><label>名称<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder={addKind === 'task' ? '例如：回复重要邮件' : addKind === 'habit' ? '例如：拉伸 10 分钟' : '例如：完成个人作品集'} /></label>{addKind === 'task' ? <><label>时间（可选）<input type="time" value={detail} onChange={(event) => setDetail(event.target.value)} /></label><label>备注（可选）<textarea value={taskNote} onChange={(event) => setTaskNote(event.target.value)} placeholder="补充地点、准备事项或想法" rows={3} /></label></> : <label>{addKind === 'habit' ? (addSchedule.frequency === 'weekly' ? '每周目标次数' : '每个执行日的目标次数') : '计划分类'}<input value={detail} onChange={(event) => setDetail(event.target.value)} inputMode={addKind === 'habit' ? 'numeric' : 'text'} placeholder={addKind === 'habit' ? '例如：1' : '例如：个人成长'} /></label>}{addKind === 'habit' && <HabitScheduleFields value={addSchedule} onChange={setAddSchedule} today={todayKey} />}{addKind === 'plan' && <label>截止日期（可选）<input type="date" min={todayKey === 'today' ? undefined : todayKey} value={planDeadline} onChange={(event) => setPlanDeadline(event.target.value)} /></label>}{addKind === 'task' && activePlans.length > 0 && <label>关联计划（可选）<select value={planChoice} onChange={(event) => setPlanChoice(event.target.value)}><option value="">不关联计划</option>{activePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.title}</option>)}</select></label>}<button className="submit-button" type="submit">保存到微光</button></form></section></div>}

      {taskEditor && <div className="modal-layer" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setTaskEditor(null)}><section className="modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="task-edit-title"><button className="modal-close" onClick={() => setTaskEditor(null)} aria-label="关闭">×</button><span className="section-label">编辑待办</span><h2 id="task-edit-title">调整下一步</h2><form className="task-edit-form" onSubmit={saveTaskEdit}><label>名称<input autoFocus required value={taskEditor.title} onChange={(event) => setTaskEditor({ ...taskEditor, title: event.target.value })} /></label><label>时间（可选）<input type="time" value={taskEditor.time === '未设时间' || taskEditor.time === '今天' ? '' : taskEditor.time} onChange={(event) => setTaskEditor({ ...taskEditor, time: event.target.value })} /></label><label>备注（可选）<textarea value={taskEditor.note} onChange={(event) => setTaskEditor({ ...taskEditor, note: event.target.value })} placeholder="补充地点、准备事项或想法" rows={3} /></label><label>日期<input type="date" required value={taskEditor.date} onChange={(event) => setTaskEditor({ ...taskEditor, date: event.target.value })} /></label><label>关联计划<select value={taskEditor.planId ?? ''} onChange={(event) => setTaskEditor({ ...taskEditor, planId: event.target.value ? Number(event.target.value) : undefined })}><option value="">不关联计划</option>{plans.filter((plan) => !plan.archived || plan.id === taskEditor.planId).map((plan) => <option key={plan.id} value={plan.id}>{plan.title}{plan.archived ? '（已归档）' : ''}</option>)}</select></label><button className="submit-button" type="submit">保存修改</button></form></section></div>}

      {selectedPlan && (
        <div className="modal-layer" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setSelectedPlanId(null)}>
          <section className="modal detail-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="plan-detail-title">
            <button className="modal-close" onClick={() => setSelectedPlanId(null)} aria-label="关闭">×</button>
            <span className="section-label">{selectedPlan.detail} · {selectedPlan.archived ? '已归档' : planDeadlineCopy(selectedPlan.deadline, todayKey)}</span>
            <h2 id="plan-detail-title">{selectedPlan.title}</h2>
            <div className="detail-progress">
              <div><strong>{planProgress(selectedPlan)}%</strong><span>{selectedPlan.milestones.filter((item) => item.done).length}/{selectedPlan.milestones.length} 已完成</span></div>
              <i><b style={{ width: `${planProgress(selectedPlan)}%` }} /></i>
            </div>
            <div className="next-action"><span>当前下一步</span><strong>{nextMilestoneCopy(selectedPlan.milestones).replace('下一步：', '')}</strong></div>
            <div className="plan-settings">
              <label className="wide">计划名称<input value={planTitleDraft} onChange={(event) => setPlanTitleDraft(event.target.value)} /></label>
              <label>分类<input value={planDetailDraft} onChange={(event) => setPlanDetailDraft(event.target.value)} placeholder="个人计划" /></label>
              <label>截止日期<input type="date" value={planDeadlineDraft} onChange={(event) => setPlanDeadlineDraft(event.target.value)} /></label>
              <button onClick={savePlanDetails}>保存计划信息</button>
            </div>
            <div className="milestone-list">
              {selectedPlan.milestones.length === 0 && <p>还没有里程碑，先写下一个清晰的阶段目标。</p>}
              {selectedPlan.milestones.map((item) => (
                <div key={item.id} className={item.done ? 'done' : ''}>
                  <button onClick={() => toggleMilestone(selectedPlan.id, item.id)} aria-label={`${item.done ? '取消完成' : '完成'}里程碑 ${item.title}`}>{item.done ? '✓' : ''}</button>
                  <span>{item.title}</span>
                  <button className="mini-remove" onClick={() => removeMilestone(selectedPlan.id, item.id)} aria-label={`删除里程碑 ${item.title}`}>×</button>
                </div>
              ))}
            </div>
            <form className="milestone-form" onSubmit={addMilestone}>
              <input value={milestoneDraft} onChange={(event) => setMilestoneDraft(event.target.value)} placeholder="添加下一个里程碑" aria-label="新里程碑名称" />
              <button type="submit">添加</button>
            </form>
            <div className="linked-tasks">
              <span className="section-label">关联待办</span>
              {tasks.filter((task) => task.planId === selectedPlan.id).length === 0 && <p>创建待办时选择这个计划，它会显示在这里。</p>}
              {tasks.filter((task) => task.planId === selectedPlan.id).map((task) => {
                const done = recordFor(task.date).taskDone.includes(task.id);
                return <div key={task.id}><i className={done ? 'done' : ''}>{done ? '✓' : ''}</i><span>{task.title}</span><small>{new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(fromDateKey(task.date))}</small></div>;
              })}
            </div>
            <div className="plan-detail-actions">
              <button className={`archive-plan-button ${selectedPlan.archived ? 'restore' : ''}`} onClick={togglePlanArchive}>{selectedPlan.archived ? '恢复计划' : '归档计划'}</button>
              <button className="delete-plan-button" onClick={deleteSelectedPlan}>删除计划</button>
            </div>
          </section>
        </div>
      )}

      {habitEditor && <div className="modal-layer" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setHabitEditor(null)}><section className="modal detail-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="habit-detail-title"><button className="modal-close" onClick={() => setHabitEditor(null)} aria-label="关闭">×</button><span className="section-label">习惯设置</span><h2 id="habit-detail-title">{habitEditor.title || '未命名习惯'}</h2><div className="editor-row habit-identity"><label>名称<input autoFocus value={habitEditor.title} onChange={(event) => setHabitEditor({ ...habitEditor, title: event.target.value })} /></label><label>图标字<input maxLength={2} value={habitEditor.icon} onChange={(event) => setHabitEditor({ ...habitEditor, icon: event.target.value })} /></label></div><HabitScheduleFields value={habitEditor} onChange={(schedule) => setHabitEditor({ ...habitEditor, ...schedule })} today={todayKey} /><div className="editor-row habit-target-row"><label>提醒时间<input type="time" value={habitEditor.reminder} onChange={(event) => setHabitEditor({ ...habitEditor, reminder: event.target.value })} /></label><label>{habitEditor.frequency === 'weekly' ? '每周目标' : '执行日目标'}<input type="number" min="0.01" step="any" value={habitEditor.target} onChange={(event) => changeHabitTarget(Number(event.target.value))} /></label><label>单位<input value={habitEditor.unit} onChange={(event) => changeHabitUnit(event.target.value)} placeholder="次" /></label><label>每次记录<input type="number" min="0.01" max={habitEditor.target} step="any" value={habitEditor.step} onChange={(event) => setHabitEditor({ ...habitEditor, step: Number(event.target.value) })} /></label></div><p className="habit-step-hint">点一次加减按钮，记录 {habitEditor.step || 0} {habitEditor.unit || '单位'}。修改目标或单位时，默认步长会自动调整。</p><button type="button" className={`pause-switch ${habitEditor.paused ? 'active' : ''}`} onClick={() => setHabitEditor({ ...habitEditor, paused: !habitEditor.paused })}><i />{habitEditor.paused ? '已暂停，点击恢复' : '正在执行，点击暂停'}</button><button className="submit-button" onClick={() => void saveHabitSettings()}>保存设置</button><button type="button" className="delete-habit-button" onClick={() => void deleteHabit()}>删除习惯及历史记录</button></section></div>}

      {dataModal && (
        <div className="modal-layer" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setDataModal(false)}>
          <section className="modal data-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="data-title">
            <button className="modal-close" onClick={() => setDataModal(false)} aria-label="关闭">×</button>
            <span className="section-label">数据与安装</span>
            <h2 id="data-title">你的微光，由你保管</h2>
            <div className={`sync-card ${syncState}`}><i /><div><strong>{syncCopy}</strong><span>{syncDescription}</span></div></div>
            <div className="data-actions">
              <button onClick={() => void exportData()}><b>导</b><span><strong>导出备份</strong><small>{isNative ? '通过系统分享保存 JSON' : '下载完整 JSON 数据'}</small></span></button>
              <label><b>入</b><span><strong>恢复备份</strong><small>导入前会预览数量并保留恢复点</small></span><input type="file" accept="application/json" onChange={(event) => { const input = event.currentTarget; void importData(input.files?.[0]).finally(() => { input.value = ''; }); }} /></label>
              {rollbackAvailable && <button onClick={() => void restoreImportRollback()}><b>撤</b><span><strong>撤销上次导入</strong><small>恢复导入前的计划与记录</small></span></button>}
              {installPrompt && <button onClick={() => void installApp()}><b>装</b><span><strong>安装应用</strong><small>像普通 App 一样打开</small></span></button>}
            </div>
            <p className="ios-hint">{isNative ? '在习惯设置中选择提醒时间，微光会按执行周期发送系统通知。' : 'Windows 可运行安装程序完成安装；iPhone Safari 可点“分享”→“添加到主屏幕”。'}</p>
            <details className="privacy-details"><summary><span><strong>隐私与版本</strong><small>无账号 · 无广告 · 不追踪</small></span><b aria-hidden="true">⌄</b></summary><div><p><strong>{isNative ? 'iPhone App' : '浏览器版'}</strong>不会上传你的计划内容，也不包含广告或分析 SDK。</p><p>本地通知由 iOS 在设备上执行；只有你主动导出备份时，系统才会把所选文件交给你指定的位置或应用。</p><small>微光 0.1.0（1）</small></div></details>
            <div className="data-reset-actions">
              <button className="restore-demo-button" onClick={restoreDemoData}>恢复示例数据</button>
              <button className="clear-data-button" onClick={clearData}>清空全部数据</button>
            </div>
          </section>
        </div>
      )}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}

function EmptyState({ text, onAdd }: { text: string; onAdd: () => void }) { return <div className="empty"><div>＋</div><p>{text}</p><button onClick={onAdd}>添加第一项</button></div>; }
function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) { return <article className="metric glass-panel"><i className={tone} /><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function CompanionCard({ className, mood, message, note, pulse, onPet }: { className: string; mood: CompanionMood; message: string; note: string; pulse: number; onPet: () => void }) {
  return <article className={`companion-card glass-panel ${className} mood-${mood}`}><div className="companion-glow" /><div className="companion-copy"><span className="companion-kicker"><i />微光伙伴</span><h2>小光</h2><p aria-live="polite">{message}</p><small>{note}</small></div><button className="companion-cat" onClick={onPet} aria-label="摸摸小光"><span className="cat-shadow" /><img key={pulse} src="/companion-xiaoguang.png" alt="小光，一只站着的橘色幼猫" /><span key={`spark-${pulse}`} className="cat-sparks" aria-hidden="true"><i>✦</i><i>·</i><i>✧</i></span></button></article>;
}
