'use client';

import type { CSSProperties } from 'react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type View = 'today' | 'plans' | 'habits' | 'review';
type AddKind = 'task' | 'habit' | 'plan';
type SyncState = 'loading' | 'syncing' | 'synced' | 'offline';
type Task = { id: number; title: string; time: string; tag: string; date: string };
type Habit = { id: number; icon: string; title: string; target: number; unit: string; color: string };
type Plan = { id: number; title: string; detail: string; progress: number; color: string; next: string };
type DailyRecord = { taskDone: number[]; habits: Record<string, number> };
type AppSnapshot = {
  version: 2;
  tasks: Task[];
  habits: Habit[];
  plans: Plan[];
  records: Record<string, DailyRecord>;
  updatedAt: string;
};
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const initialHabits: Habit[] = [
  { id: 1, icon: '水', title: '喝水', target: 8, unit: '杯', color: 'blue' },
  { id: 2, icon: '读', title: '每日阅读', target: 20, unit: '分钟', color: 'violet' },
  { id: 3, icon: '步', title: '散步', target: 1, unit: '次', color: 'orange' },
];

const initialPlans: Plan[] = [
  { id: 1, title: '完成微光 App 1.0', detail: '产品与设计', progress: 38, color: 'violet', next: '下一步：完成真实历史记录' },
  { id: 2, title: '建立稳定阅读节奏', detail: '个人成长', progress: 62, color: 'blue', next: '本周还需阅读 80 页' },
  { id: 3, title: '九月健康计划', detail: '健康生活', progress: 24, color: 'orange', next: '今晚散步 30 分钟' },
];

const navItems: { id: View; label: string; short: string }[] = [
  { id: 'today', label: '今天', short: '今' },
  { id: 'plans', label: '计划', short: '计' },
  { id: 'habits', label: '习惯', short: '习' },
  { id: 'review', label: '回顾', short: '记' },
];

const copy: Record<View, { eyebrow: string; title: string }> = {
  today: { eyebrow: '把注意力放在此刻', title: '今天想完成什么？' },
  plans: { eyebrow: '从愿望到行动', title: '正在推进的计划' },
  habits: { eyebrow: '微小重复，长期复利', title: '让好习惯自然发生' },
  review: { eyebrow: '看见每一点进步', title: '本周回顾' },
};

function pad(value: number) { return String(value).padStart(2, '0'); }
function toDateKey(date: Date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function fromDateKey(key: string) {
  if (key === 'today') return new Date();
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}
function shiftDate(key: string, amount: number) {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}
function getWeekKeys(endKey: string) { return Array.from({ length: 7 }, (_, index) => shiftDate(endKey, index - 6)); }
function emptyRecord(): DailyRecord { return { taskDone: [], habits: {} }; }
function stamp(snapshot: Omit<AppSnapshot, 'updatedAt'> | AppSnapshot): AppSnapshot {
  return { ...snapshot, version: 2, updatedAt: new Date().toISOString() };
}

function createSeedSnapshot(today: string): AppSnapshot {
  const tasks: Task[] = [
    { id: 1, title: '完成产品首页线框', time: '09:30', tag: '专注', date: today },
    { id: 2, title: '阅读 20 页', time: '18:30', tag: '成长', date: today },
    { id: 3, title: '整理本周计划', time: '20:00', tag: '生活', date: today },
  ];
  const records: Record<string, DailyRecord> = {};
  getWeekKeys(today).forEach((key, index) => {
    records[key] = {
      taskDone: key === today ? [1] : [],
      habits: {
        '1': index === 2 ? 5 : index === 6 ? 6 : 8,
        '2': index === 1 ? 8 : index === 5 ? 15 : index === 6 ? 12 : 20,
        '3': index === 3 || index === 6 ? 0 : 1,
      },
    };
  });
  return { version: 2, tasks, habits: initialHabits, plans: initialPlans, records, updatedAt: new Date().toISOString() };
}

function normalizeSnapshot(snapshot: AppSnapshot, today: string): AppSnapshot {
  const records: Record<string, DailyRecord> = {};
  Object.entries(snapshot.records || {}).forEach(([key, record]) => {
    records[key === 'today' ? today : key] = {
      taskDone: Array.isArray(record?.taskDone) ? record.taskDone : [],
      habits: record?.habits && typeof record.habits === 'object' ? record.habits : {},
    };
  });
  return {
    version: 2,
    tasks: snapshot.tasks.map((task) => ({ ...task, date: task.date === 'today' || !task.date ? today : task.date })),
    habits: snapshot.habits,
    plans: snapshot.plans,
    records,
    updatedAt: snapshot.updatedAt || new Date(0).toISOString(),
  };
}

function parseSnapshot(value: unknown): AppSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<AppSnapshot>;
  if (!Array.isArray(item.tasks) || !Array.isArray(item.habits) || !Array.isArray(item.plans) || !item.records || typeof item.records !== 'object') return null;
  return { version: 2, tasks: item.tasks as Task[], habits: item.habits as Habit[], plans: item.plans as Plan[], records: item.records as Record<string, DailyRecord>, updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date(0).toISOString() };
}

function readLocal(today: string): AppSnapshot {
  try {
    const current = parseSnapshot(JSON.parse(window.localStorage.getItem('weiguang.snapshot.v2') || 'null'));
    if (current) return normalizeSnapshot(current, today);

    const oldTasks = JSON.parse(window.localStorage.getItem('weiguang.tasks') || 'null') as Array<Task & { done?: boolean }> | null;
    const oldHabits = JSON.parse(window.localStorage.getItem('weiguang.habits') || 'null') as Array<Habit & { completed?: number }> | null;
    const oldPlans = JSON.parse(window.localStorage.getItem('weiguang.plans') || 'null') as Plan[] | null;
    if (oldTasks || oldHabits || oldPlans) {
      const seed = createSeedSnapshot(today);
      const tasks = (oldTasks || seed.tasks).map((task) => ({ id: task.id, title: task.title, time: task.time, tag: task.tag, date: task.date || today }));
      const habits = (oldHabits || seed.habits).map((habit) => ({ id: habit.id, icon: habit.icon, title: habit.title, target: habit.target, unit: habit.unit, color: habit.color }));
      const record = emptyRecord();
      record.taskDone = (oldTasks || []).filter((task) => task.done).map((task) => task.id);
      (oldHabits || []).forEach((habit) => { record.habits[String(habit.id)] = habit.completed || 0; });
      return stamp({ ...seed, tasks, habits, plans: oldPlans || seed.plans, records: { ...seed.records, [today]: record } });
    }
  } catch {
    // Corrupt local data falls back to a safe starter snapshot.
  }
  return createSeedSnapshot(today);
}

export default function Home() {
  const [view, setView] = useState<View>('today');
  const [snapshot, setSnapshot] = useState<AppSnapshot>(() => createSeedSnapshot('today'));
  const [todayKey, setTodayKey] = useState('today');
  const [selectedDate, setSelectedDate] = useState('today');
  const [ready, setReady] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>('loading');
  const [greeting, setGreeting] = useState('早上好');
  const [modal, setModal] = useState(false);
  const [dataModal, setDataModal] = useState(false);
  const [addKind, setAddKind] = useState<AddKind>('task');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [toast, setToast] = useState('');
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const now = new Date();
    const today = toDateKey(now);
    setTodayKey(today);
    setSelectedDate(today);
    setGreeting(now.getHours() < 11 ? '早上好' : now.getHours() < 18 ? '下午好' : '晚上好');
    const local = readLocal(today);
    setSnapshot(local);
    setReady(true);

    void (async () => {
      try {
        const response = await fetch('/api/state', { cache: 'no-store' });
        if (!response.ok) throw new Error('Remote state unavailable');
        const data = await response.json() as { snapshot: unknown };
        const remote = parseSnapshot(data.snapshot);
        if (remote && Date.parse(remote.updatedAt) >= Date.parse(local.updatedAt)) {
          setSnapshot(normalizeSnapshot(remote, today));
        } else {
          await fetch('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(local) });
        }
        setSyncState('synced');
      } catch {
        setSyncState('offline');
      }
    })();

    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');
    const captureInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    window.addEventListener('beforeinstallprompt', captureInstall);
    return () => window.removeEventListener('beforeinstallprompt', captureInstall);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem('weiguang.snapshot.v2', JSON.stringify(snapshot));
    const timer = window.setTimeout(async () => {
      setSyncState('syncing');
      try {
        const response = await fetch('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(snapshot) });
        if (!response.ok) throw new Error('Sync failed');
        setSyncState('synced');
      } catch {
        setSyncState('offline');
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [snapshot, ready]);

  useEffect(() => {
    if (!modal && !dataModal) return;
    const close = (event: KeyboardEvent) => event.key === 'Escape' && (setModal(false), setDataModal(false));
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [modal, dataModal]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const tasks = snapshot.tasks;
  const habits = snapshot.habits;
  const plans = snapshot.plans;
  const recordFor = (key: string) => snapshot.records[key] || emptyRecord();
  const selectedRecord = recordFor(selectedDate);
  const selectedTasks = tasks.filter((task) => task.date === selectedDate);
  const taskDone = selectedTasks.filter((task) => selectedRecord.taskDone.includes(task.id)).length;
  const habitDone = habits.filter((habit) => (selectedRecord.habits[String(habit.id)] || 0) >= habit.target).length;
  const todayTotal = selectedTasks.length + habits.length;
  const todayDone = taskDone + habitDone;
  const progress = todayTotal ? Math.round((todayDone / todayTotal) * 100) : 0;
  const averagePlan = plans.length ? Math.round(plans.reduce((sum, plan) => sum + plan.progress, 0) / plans.length) : 0;
  const reviewDays = useMemo(() => getWeekKeys(todayKey), [todayKey]);
  const previousDays = useMemo(() => reviewDays.map((key) => shiftDate(key, -7)), [reviewDays]);

  function completionForDate(key: string) {
    const dayTasks = tasks.filter((task) => task.date === key);
    const record = recordFor(key);
    const doneTasks = dayTasks.filter((task) => record.taskDone.includes(task.id)).length;
    const doneHabits = habits.filter((habit) => (record.habits[String(habit.id)] || 0) >= habit.target).length;
    const total = dayTasks.length + habits.length;
    return total ? Math.round(((doneTasks + doneHabits) / total) * 100) : 0;
  }

  const weekBars = reviewDays.map(completionForDate);
  const previousBars = previousDays.map(completionForDate);
  const currentAverage = Math.round(weekBars.reduce((sum, value) => sum + value, 0) / 7);
  const previousAverage = Math.round(previousBars.reduce((sum, value) => sum + value, 0) / 7);
  const trend = currentAverage - previousAverage;
  const weekTaskDone = tasks.filter((task) => reviewDays.includes(task.date) && recordFor(task.date).taskDone.includes(task.id)).length;
  const weekTaskTotal = tasks.filter((task) => reviewDays.includes(task.date)).length;
  const weekHabitDone = reviewDays.reduce((sum, key) => sum + habits.filter((habit) => (recordFor(key).habits[String(habit.id)] || 0) >= habit.target).length, 0);
  const bestDayIndex = weekBars.indexOf(Math.max(...weekBars));
  const bestDayName = ['周一','周二','周三','周四','周五','周六','周日'][Math.max(0, bestDayIndex)];
  const isToday = selectedDate === todayKey;
  const selectedLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(fromDateKey(selectedDate));
  const header = copy[view];
  const syncCopy = { loading: '正在连接', syncing: '正在同步', synced: '已同步', offline: '本机模式' }[syncState];

  function updateSnapshot(change: (current: AppSnapshot) => AppSnapshot) {
    setSnapshot((current) => stamp(change(current)));
  }

  function updateRecord(key: string, change: (record: DailyRecord) => DailyRecord) {
    updateSnapshot((current) => ({ ...current, records: { ...current.records, [key]: change(current.records[key] || emptyRecord()) } }));
  }

  function navigate(next: View) {
    setView(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openAdd(kind: AddKind) {
    setAddKind(kind);
    setTitle('');
    setDetail('');
    setModal(true);
  }

  function submitAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const id = Date.now();
    if (addKind === 'task') {
      updateSnapshot((current) => ({ ...current, tasks: [...current.tasks, { id, title: cleanTitle, time: detail.trim() || '今天', tag: '新建', date: selectedDate }] }));
      setToast(`待办已加入${isToday ? '今天' : selectedLabel}`);
    } else if (addKind === 'habit') {
      updateSnapshot((current) => ({ ...current, habits: [...current.habits, { id, icon: cleanTitle.slice(0, 1), title: cleanTitle, target: Math.max(1, Number(detail) || 1), unit: '次', color: 'violet' }] }));
      setToast('新习惯已创建');
    } else {
      updateSnapshot((current) => ({ ...current, plans: [...current.plans, { id, title: cleanTitle, detail: detail.trim() || '个人计划', progress: 0, color: 'blue', next: '下一步：写下第一个行动' }] }));
      setToast('计划已开始');
    }
    setModal(false);
  }

  function toggleTask(id: number) {
    updateRecord(selectedDate, (record) => ({ ...record, taskDone: record.taskDone.includes(id) ? record.taskDone.filter((taskId) => taskId !== id) : [...record.taskDone, id] }));
  }

  function removeTask(id: number) {
    updateSnapshot((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== id),
      records: Object.fromEntries(Object.entries(current.records).map(([key, record]) => [key, { ...record, taskDone: record.taskDone.filter((taskId) => taskId !== id) }])),
    }));
    setToast('待办已移除');
  }

  function addHabitProgress(id: number, key = view === 'today' ? selectedDate : todayKey) {
    const habit = habits.find((item) => item.id === id);
    if (!habit) return;
    updateRecord(key, (record) => ({ ...record, habits: { ...record.habits, [String(id)]: Math.min(habit.target, (record.habits[String(id)] || 0) + 1) } }));
    setToast('已记录一次，继续保持');
  }

  function advancePlan(id: number) {
    updateSnapshot((current) => ({ ...current, plans: current.plans.map((plan) => plan.id === id ? { ...plan, progress: Math.min(100, plan.progress + 10) } : plan) }));
    setToast('计划进度已更新');
  }

  function habitStreak(habit: Habit) {
    let streak = 0;
    for (let offset = 0; offset < 366; offset += 1) {
      const key = shiftDate(todayKey, -offset);
      if ((recordFor(key).habits[String(habit.id)] || 0) < habit.target) break;
      streak += 1;
    }
    return streak;
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `weiguang-backup-${todayKey}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setToast('备份文件已导出');
  }

  async function importData(file: File | undefined) {
    if (!file) return;
    try {
      const imported = parseSnapshot(JSON.parse(await file.text()));
      if (!imported) throw new Error('Invalid backup');
      setSnapshot(stamp(normalizeSnapshot(imported, todayKey)));
      setDataModal(false);
      setToast('备份数据已恢复');
    } catch {
      setToast('无法读取这个备份文件');
    }
  }

  function resetData() {
    if (!window.confirm('确定清空当前数据并恢复示例内容吗？建议先导出备份。')) return;
    setSnapshot(createSeedSnapshot(todayKey));
    setSelectedDate(todayKey);
    setDataModal(false);
    setToast('数据已恢复为初始状态');
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <aside className="sidebar glass-panel">
        <button className="brand" onClick={() => navigate('today')} aria-label="微光首页"><span className="brand-mark">微</span><span>微光</span></button>
        <nav className="nav-list" aria-label="主导航">{navItems.map((item) => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}><span>{item.short}</span>{item.label}</button>)}</nav>
        <div className="sidebar-foot"><div className="streak-orb">{Math.max(0, ...habits.map(habitStreak))}</div><div><strong>最长连续记录</strong><small>今天也向前一点</small></div></div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div><p className="eyebrow">{view === 'today' ? selectedLabel : header.eyebrow}</p><h1>{view === 'today' ? (isToday ? `${greeting}，${header.title}` : '这一天，安排了什么？') : header.title}</h1></div>
          <div className="top-actions"><button className={`sync-pill ${syncState}`} onClick={() => setDataModal(true)} aria-label="打开数据管理"><i />{syncCopy}</button><button className="avatar" aria-label="个人资料">SU</button></div>
        </header>

        {view === 'today' && <>
          <div className="date-controls glass-panel"><button onClick={() => setSelectedDate(shiftDate(selectedDate, -1))} aria-label="前一天">‹</button><div><strong>{isToday ? '今天' : selectedLabel}</strong><span>{selectedTasks.length} 项待办 · {habitDone}/{habits.length} 项习惯</span></div>{!isToday && <button className="back-today" onClick={() => setSelectedDate(todayKey)}>回到今天</button>}<button onClick={() => setSelectedDate(shiftDate(selectedDate, 1))} aria-label="后一天">›</button></div>
          <section className="overview glass-panel" aria-label="所选日期进度"><div><span className="section-label">{isToday ? '今日进度' : '当日进度'}</span><strong>{progress === 100 ? '这一天的约定，都完成了。' : '慢慢来，也是在前进。'}</strong><p>已完成 {todayDone} 项，还有 {todayTotal - todayDone} 项等你。</p></div><div className="progress-ring" style={{ '--progress': `${progress}%` } as CSSProperties}><span>{progress}<small>%</small></span></div></section>
          <section className="task-section" aria-labelledby="today-tasks"><div className="section-head"><div><span className="section-label">待办</span><h2 id="today-tasks">{isToday ? '今天' : selectedLabel}</h2></div><button className="add-button" onClick={() => openAdd('task')}><span>＋</span> 添加待办</button></div><div className="task-list glass-panel">{selectedTasks.length === 0 && <EmptyState text="这一天还没有待办，给自己安排一件小事吧。" onAdd={() => openAdd('task')} />}{selectedTasks.map((task) => { const done = selectedRecord.taskDone.includes(task.id); return <article className={`task-row ${done ? 'is-done' : ''}`} key={task.id}><button className="check" onClick={() => toggleTask(task.id)} aria-label={`${done ? '取消完成' : '完成'} ${task.title}`}>{done ? '✓' : ''}</button><div className="task-copy"><strong>{task.title}</strong><span>{task.time}</span></div><span className="tag">{task.tag}</span><button className="remove" onClick={() => removeTask(task.id)} aria-label={`删除 ${task.title}`}>×</button></article>; })}</div></section>
        </>}

        {view === 'plans' && <section className="view-section"><div className="section-head"><div><span className="section-label">{plans.length} 个进行中</span><h2>把大目标拆成下一步</h2></div><button className="add-button" onClick={() => openAdd('plan')}><span>＋</span> 新建计划</button></div><div className="plan-grid">{plans.map((plan) => <article className="plan-card glass-panel" key={plan.id}><div className={`plan-accent ${plan.color}`} /><div className="plan-title"><span>{plan.detail}</span><strong>{plan.title}</strong></div><div className="plan-percent"><b>{plan.progress}%</b><span>已完成</span></div><div className="plan-progress"><i style={{ width: `${plan.progress}%` }} /></div><p>{plan.next}</p><button onClick={() => advancePlan(plan.id)} disabled={plan.progress === 100}>{plan.progress === 100 ? '已经完成' : '推进 10%'}</button></article>)}</div></section>}

        {view === 'habits' && <section className="view-section"><div className="section-head"><div><span className="section-label">真实历史记录</span><h2>{habits.filter((habit) => (recordFor(todayKey).habits[String(habit.id)] || 0) >= habit.target).length} / {habits.length} 今日已完成</h2></div><button className="add-button" onClick={() => openAdd('habit')}><span>＋</span> 新建习惯</button></div><div className="habit-board glass-panel"><div className="habit-week-head"><span>习惯</span>{reviewDays.map((key) => <small key={key}>{new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(fromDateKey(key)).slice(-1)}</small>)}</div>{habits.map((habit) => { const done = (recordFor(todayKey).habits[String(habit.id)] || 0) >= habit.target; return <article className="habit-board-row" key={habit.id}><div className="habit-name"><div className={`habit-icon ${habit.color}`}>{habit.icon}</div><div><strong>{habit.title}</strong><span>连续 {habitStreak(habit)} 天</span></div></div>{reviewDays.map((key) => { const complete = (recordFor(key).habits[String(habit.id)] || 0) >= habit.target; return <i key={key} className={complete ? 'complete' : ''}>{complete ? '✓' : ''}</i>; })}<button onClick={() => addHabitProgress(habit.id, todayKey)} disabled={done}>{done ? '完成' : `+1 ${habit.unit}`}</button></article>; })}</div><div className="gentle-note glass-panel"><span>小提醒</span><p>好习惯不需要完美连续。漏掉一天，也可以从今天重新开始。</p></div></section>}

        {view === 'review' && <section className="view-section"><div className="metric-grid"><Metric label="本周待办" value={`${weekTaskDone}`} note={`共 ${weekTaskTotal} 项`} tone="violet" /><Metric label="习惯打卡" value={`${weekHabitDone}`} note={`最多 ${habits.length * 7} 次`} tone="blue" /><Metric label="计划均值" value={`${averagePlan}%`} note="持续推进中" tone="orange" /></div><article className="review-chart glass-panel"><div className="section-head"><div><span className="section-label">真实完成率</span><h2>最近 7 天</h2></div><span className={`trend ${trend < 0 ? 'down' : ''}`}>{trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% 较上周</span></div><div className="bars" aria-label="最近七天完成率柱状图">{weekBars.map((height, index) => <div key={reviewDays[index]}><i style={{ height: `${Math.max(height, 4)}%` }} className={index === 6 ? 'today' : ''} /><small>{['一','二','三','四','五','六','日'][index]}</small></div>)}</div></article><article className="review-note glass-panel"><div className="quote-mark">“</div><div><span className="section-label">本周发现</span><h2>{bestDayName}是你本周状态最好的一天</h2><p>本周平均完成率为 {currentAverage}%。回顾由真实的待办和习惯记录生成，继续记录后，趋势会越来越贴近你的节奏。</p></div></article></section>}
      </section>

      <aside className="right-rail"><div className="rail-head"><div><span className="section-label">{view === 'today' && !isToday ? selectedLabel : '保持节奏'}</span><h2>{view === 'today' && !isToday ? '当日习惯' : '今日习惯'}</h2></div><button onClick={() => openAdd('habit')} aria-label="添加习惯">＋</button></div><div className="habit-stack">{habits.slice(0, 4).map((habit) => { const key = view === 'today' ? selectedDate : todayKey; const value = recordFor(key).habits[String(habit.id)] || 0; const percent = Math.min(100, Math.round((value / habit.target) * 100)); return <article className="habit-card glass-panel" key={habit.id}><div className={`habit-icon ${habit.color}`}>{habit.icon}</div><div className="habit-info"><strong>{habit.title}</strong><span>{value} / {habit.target} {habit.unit}</span></div><button className="habit-plus" onClick={() => addHabitProgress(habit.id, key)} disabled={percent === 100}>{percent === 100 ? '✓' : '+'}</button><div className="mini-progress"><i style={{ width: `${percent}%` }} /></div></article>; })}</div><article className="reflection glass-panel"><span>今日一句</span><blockquote>“不需要很厉害才开始，开始了才会慢慢变厉害。”</blockquote><div className="week-dots">{reviewDays.map((key) => <div key={key}><i className={completionForDate(key) >= 60 ? 'filled' : ''} /><small>{new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(fromDateKey(key)).slice(-1)}</small></div>)}</div></article></aside>

      <nav className="mobile-nav glass-panel" aria-label="移动端导航">{navItems.slice(0, 2).map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><span>{item.short}</span>{item.label}</button>)}<button className="mobile-add" onClick={() => openAdd('task')} aria-label="快速添加">＋</button>{navItems.slice(2).map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><span>{item.short}</span>{item.label}</button>)}</nav>

      {modal && <div className="modal-layer" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setModal(false)}><section className="modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="add-title"><button className="modal-close" onClick={() => setModal(false)} aria-label="关闭">×</button><span className="section-label">快速记录</span><h2 id="add-title">把想法放进微光</h2><div className="kind-switch">{(['task','habit','plan'] as AddKind[]).map((kind) => <button key={kind} className={addKind === kind ? 'active' : ''} onClick={() => setAddKind(kind)}>{kind === 'task' ? '待办' : kind === 'habit' ? '习惯' : '计划'}</button>)}</div><form onSubmit={submitAdd}><label>名称<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder={addKind === 'task' ? '例如：回复重要邮件' : addKind === 'habit' ? '例如：拉伸 10 分钟' : '例如：完成个人作品集'} /></label><label>{addKind === 'task' ? '时间或备注' : addKind === 'habit' ? '每日目标次数' : '计划分类'}<input value={detail} onChange={(event) => setDetail(event.target.value)} inputMode={addKind === 'habit' ? 'numeric' : 'text'} placeholder={addKind === 'task' ? '例如：18:30' : addKind === 'habit' ? '例如：1' : '例如：个人成长'} /></label><button className="submit-button" type="submit">保存到微光</button></form></section></div>}

      {dataModal && <div className="modal-layer" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setDataModal(false)}><section className="modal data-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="data-title"><button className="modal-close" onClick={() => setDataModal(false)} aria-label="关闭">×</button><span className="section-label">数据与安装</span><h2 id="data-title">你的微光，由你保管</h2><div className={`sync-card ${syncState}`}><i /><div><strong>{syncCopy}</strong><span>{syncState === 'offline' ? '数据已安全保存在这台设备，联网后会自动同步。' : '数据同时保存在设备与私有云端。'}</span></div></div><div className="data-actions"><button onClick={exportData}><b>导</b><span><strong>导出备份</strong><small>下载完整 JSON 数据</small></span></button><label><b>入</b><span><strong>恢复备份</strong><small>从此前文件恢复</small></span><input type="file" accept="application/json" onChange={(event) => void importData(event.target.files?.[0])} /></label>{installPrompt && <button onClick={() => void installApp()}><b>装</b><span><strong>安装应用</strong><small>像普通 App 一样打开</small></span></button>}</div><p className="ios-hint">在 iPhone Safari 中打开后，点“分享”→“添加到主屏幕”，即可安装当前版本。</p><button className="reset-button" onClick={resetData}>清空并恢复示例数据</button></section></div>}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}

function EmptyState({ text, onAdd }: { text: string; onAdd: () => void }) { return <div className="empty"><div>＋</div><p>{text}</p><button onClick={onAdd}>添加第一项</button></div>; }
function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) { return <article className="metric glass-panel"><i className={tone} /><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
