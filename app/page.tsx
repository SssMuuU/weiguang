'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type View = 'today' | 'plans' | 'habits' | 'review';
type AddKind = 'task' | 'habit' | 'plan';
type Task = { id: number; title: string; time: string; tag: string; done: boolean };
type Habit = { id: number; icon: string; title: string; completed: number; target: number; unit: string; color: string; streak: number };
type Plan = { id: number; title: string; detail: string; progress: number; color: string; next: string };

const initialTasks: Task[] = [
  { id: 1, title: '完成产品首页线框', time: '09:30', tag: '专注', done: true },
  { id: 2, title: '阅读 20 页', time: '18:30', tag: '成长', done: false },
  { id: 3, title: '整理本周计划', time: '20:00', tag: '生活', done: false },
];

const initialHabits: Habit[] = [
  { id: 1, icon: '水', title: '喝水', completed: 6, target: 8, unit: '杯', color: 'blue', streak: 12 },
  { id: 2, icon: '读', title: '每日阅读', completed: 12, target: 20, unit: '分钟', color: 'violet', streak: 7 },
  { id: 3, icon: '步', title: '散步', completed: 0, target: 1, unit: '次', color: 'orange', streak: 4 },
];

const initialPlans: Plan[] = [
  { id: 1, title: '完成微光 App 1.0', detail: '产品与设计', progress: 38, color: 'violet', next: '下一步：完成核心交互' },
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

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const saved = window.localStorage.getItem(key);
    return saved ? JSON.parse(saved) as T : fallback;
  } catch {
    return fallback;
  }
}

export default function Home() {
  const [view, setView] = useState<View>('today');
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [habits, setHabits] = useState<Habit[]>(initialHabits);
  const [plans, setPlans] = useState<Plan[]>(initialPlans);
  const [hydrated, setHydrated] = useState(false);
  const [dateLabel, setDateLabel] = useState('今天');
  const [greeting, setGreeting] = useState('早上好');
  const [modal, setModal] = useState(false);
  const [addKind, setAddKind] = useState<AddKind>('task');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    setTasks(loadLocal('weiguang.tasks', initialTasks));
    setHabits(loadLocal('weiguang.habits', initialHabits));
    setPlans(loadLocal('weiguang.plans', initialPlans));
    const now = new Date();
    setDateLabel(new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(now));
    setGreeting(now.getHours() < 11 ? '早上好' : now.getHours() < 18 ? '下午好' : '晚上好');
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem('weiguang.tasks', JSON.stringify(tasks));
    window.localStorage.setItem('weiguang.habits', JSON.stringify(habits));
    window.localStorage.setItem('weiguang.plans', JSON.stringify(plans));
  }, [tasks, habits, plans, hydrated]);

  useEffect(() => {
    if (!modal) return;
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setModal(false);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [modal]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const taskDone = tasks.filter((task) => task.done).length;
  const habitDone = habits.filter((habit) => habit.completed >= habit.target).length;
  const todayTotal = tasks.length + habits.length;
  const todayDone = taskDone + habitDone;
  const progress = todayTotal ? Math.round((todayDone / todayTotal) * 100) : 0;
  const averagePlan = plans.length ? Math.round(plans.reduce((sum, plan) => sum + plan.progress, 0) / plans.length) : 0;
  const weekBars = useMemo(() => [58, 76, 45, 88, Math.max(progress, 20), 16, 8], [progress]);

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
      setTasks((items) => [...items, { id, title: cleanTitle, time: detail.trim() || '今天', tag: '新建', done: false }]);
      setToast('待办已加入今天');
    } else if (addKind === 'habit') {
      setHabits((items) => [...items, { id, icon: cleanTitle.slice(0, 1), title: cleanTitle, completed: 0, target: Number(detail) || 1, unit: '次', color: 'violet', streak: 0 }]);
      setToast('新习惯已创建');
    } else {
      setPlans((items) => [...items, { id, title: cleanTitle, detail: detail.trim() || '个人计划', progress: 0, color: 'blue', next: '下一步：写下第一个行动' }]);
      setToast('计划已开始');
    }
    setModal(false);
  }

  function toggleTask(id: number) {
    setTasks((items) => items.map((task) => task.id === id ? { ...task, done: !task.done } : task));
  }

  function removeTask(id: number) {
    setTasks((items) => items.filter((task) => task.id !== id));
    setToast('待办已移除');
  }

  function addHabitProgress(id: number) {
    setHabits((items) => items.map((habit) => habit.id === id ? { ...habit, completed: Math.min(habit.target, habit.completed + 1) } : habit));
    setToast('已记录一次，继续保持');
  }

  function advancePlan(id: number) {
    setPlans((items) => items.map((plan) => plan.id === id ? { ...plan, progress: Math.min(100, plan.progress + 10) } : plan));
    setToast('计划进度已更新');
  }

  const header = copy[view];

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <aside className="sidebar glass-panel">
        <button className="brand" onClick={() => navigate('today')} aria-label="微光首页">
          <span className="brand-mark">微</span><span>微光</span>
        </button>
        <nav className="nav-list" aria-label="主导航">
          {navItems.map((item) => (
            <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}>
              <span>{item.short}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="streak-orb">7</div>
          <div><strong>连续 7 天</strong><small>今天也向前一点</small></div>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">{view === 'today' ? dateLabel : header.eyebrow}</p>
            <h1>{view === 'today' ? `${greeting}，${header.title}` : header.title}</h1>
          </div>
          <div className="top-actions">
            <button className="icon-button" aria-label="通知">铃</button>
            <button className="avatar" aria-label="个人资料">SU</button>
          </div>
        </header>

        {view === 'today' && <>
          <section className="overview glass-panel" aria-label="今日进度">
            <div><span className="section-label">今日进度</span><strong>{progress === 100 ? '今天的约定，都完成了。' : '慢慢来，也是在前进。'}</strong><p>已完成 {todayDone} 项，还有 {todayTotal - todayDone} 项等你。</p></div>
            <div className="progress-ring" style={{ '--progress': `${progress}%` } as React.CSSProperties}><span>{progress}<small>%</small></span></div>
          </section>
          <section className="task-section" aria-labelledby="today-tasks">
            <div className="section-head"><div><span className="section-label">待办</span><h2 id="today-tasks">今天</h2></div><button className="add-button" onClick={() => openAdd('task')}><span>＋</span> 添加待办</button></div>
            <div className="task-list glass-panel">
              {tasks.length === 0 && <EmptyState text="今天还没有待办，给自己安排一件小事吧。" onAdd={() => openAdd('task')} />}
              {tasks.map((task) => <article className={`task-row ${task.done ? 'is-done' : ''}`} key={task.id}>
                <button className="check" onClick={() => toggleTask(task.id)} aria-label={`${task.done ? '取消完成' : '完成'} ${task.title}`}>{task.done ? '✓' : ''}</button>
                <div className="task-copy"><strong>{task.title}</strong><span>{task.time}</span></div>
                <span className="tag">{task.tag}</span>
                <button className="remove" onClick={() => removeTask(task.id)} aria-label={`删除 ${task.title}`}>×</button>
              </article>)}
            </div>
          </section>
        </>}

        {view === 'plans' && <section className="view-section">
          <div className="section-head"><div><span className="section-label">{plans.length} 个进行中</span><h2>把大目标拆成下一步</h2></div><button className="add-button" onClick={() => openAdd('plan')}><span>＋</span> 新建计划</button></div>
          <div className="plan-grid">
            {plans.map((plan) => <article className="plan-card glass-panel" key={plan.id}>
              <div className={`plan-accent ${plan.color}`} /><div className="plan-title"><span>{plan.detail}</span><strong>{plan.title}</strong></div>
              <div className="plan-percent"><b>{plan.progress}%</b><span>已完成</span></div>
              <div className="plan-progress"><i style={{ width: `${plan.progress}%` }} /></div>
              <p>{plan.next}</p><button onClick={() => advancePlan(plan.id)} disabled={plan.progress === 100}>{plan.progress === 100 ? '已经完成' : '推进 10%'}</button>
            </article>)}
          </div>
        </section>}

        {view === 'habits' && <section className="view-section">
          <div className="section-head"><div><span className="section-label">今日打卡</span><h2>{habitDone} / {habits.length} 已完成</h2></div><button className="add-button" onClick={() => openAdd('habit')}><span>＋</span> 新建习惯</button></div>
          <div className="habit-board glass-panel">
            <div className="habit-week-head"><span>习惯</span>{['一','二','三','四','五','六','日'].map((day) => <small key={day}>{day}</small>)}</div>
            {habits.map((habit) => {
              const done = habit.completed >= habit.target;
              return <article className="habit-board-row" key={habit.id}>
                <div className="habit-name"><div className={`habit-icon ${habit.color}`}>{habit.icon}</div><div><strong>{habit.title}</strong><span>连续 {habit.streak} 天</span></div></div>
                {[0,1,2,3,4,5,6].map((day) => <i key={day} className={day < 5 || (day === 5 && done) ? 'complete' : ''}>{day < 5 || (day === 5 && done) ? '✓' : ''}</i>)}
                <button onClick={() => addHabitProgress(habit.id)} disabled={done}>{done ? '完成' : `+1 ${habit.unit}`}</button>
              </article>;
            })}
          </div>
          <div className="gentle-note glass-panel"><span>小提醒</span><p>好习惯不需要完美连续。漏掉一天，也可以从今天重新开始。</p></div>
        </section>}

        {view === 'review' && <section className="view-section">
          <div className="metric-grid">
            <Metric label="完成待办" value={`${taskDone}`} note={`共 ${tasks.length} 项`} tone="violet" />
            <Metric label="完成习惯" value={`${habitDone}`} note={`共 ${habits.length} 项`} tone="blue" />
            <Metric label="计划均值" value={`${averagePlan}%`} note="持续推进中" tone="orange" />
          </div>
          <article className="review-chart glass-panel">
            <div className="section-head"><div><span className="section-label">专注节奏</span><h2>最近 7 天</h2></div><span className="trend">↑ 12% 较上周</span></div>
            <div className="bars" aria-label="最近七天完成率柱状图">{weekBars.map((height, index) => <div key={index}><i style={{ height: `${height}%` }} className={index === 4 ? 'today' : ''} /><small>{['一','二','三','四','五','六','日'][index]}</small></div>)}</div>
          </article>
          <article className="review-note glass-panel"><div className="quote-mark">“</div><div><span className="section-label">本周发现</span><h2>你在傍晚更容易完成重要任务</h2><p>本周 68% 的完成记录集中在 17:00—21:00。下周可以把需要专注的事情安排在这个时段。</p></div></article>
        </section>}
      </section>

      <aside className="right-rail">
        <div className="rail-head"><div><span className="section-label">保持节奏</span><h2>今日习惯</h2></div><button onClick={() => openAdd('habit')} aria-label="添加习惯">＋</button></div>
        <div className="habit-stack">{habits.slice(0, 4).map((habit) => {
          const percent = Math.min(100, Math.round((habit.completed / habit.target) * 100));
          return <article className="habit-card glass-panel" key={habit.id}><div className={`habit-icon ${habit.color}`}>{habit.icon}</div><div className="habit-info"><strong>{habit.title}</strong><span>{habit.completed} / {habit.target} {habit.unit}</span></div><button className="habit-plus" onClick={() => addHabitProgress(habit.id)} disabled={percent === 100}>{percent === 100 ? '✓' : '+'}</button><div className="mini-progress"><i style={{ width: `${percent}%` }} /></div></article>;
        })}</div>
        <article className="reflection glass-panel"><span>今日一句</span><blockquote>“不需要很厉害才开始，开始了才会慢慢变厉害。”</blockquote><div className="week-dots">{['一','二','三','四','五','六','日'].map((day, index) => <div key={day}><i className={index < 5 ? 'filled' : ''} /><small>{day}</small></div>)}</div></article>
      </aside>

      <nav className="mobile-nav glass-panel" aria-label="移动端导航">
        {navItems.slice(0,2).map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><span>{item.short}</span>{item.label}</button>)}
        <button className="mobile-add" onClick={() => openAdd('task')} aria-label="快速添加">＋</button>
        {navItems.slice(2).map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><span>{item.short}</span>{item.label}</button>)}
      </nav>

      {modal && <div className="modal-layer" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setModal(false)}>
        <section className="modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="add-title">
          <button className="modal-close" onClick={() => setModal(false)} aria-label="关闭">×</button>
          <span className="section-label">快速记录</span><h2 id="add-title">把想法放进微光</h2>
          <div className="kind-switch">{(['task','habit','plan'] as AddKind[]).map((kind) => <button key={kind} className={addKind === kind ? 'active' : ''} onClick={() => setAddKind(kind)}>{kind === 'task' ? '待办' : kind === 'habit' ? '习惯' : '计划'}</button>)}</div>
          <form onSubmit={submitAdd}>
            <label>名称<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder={addKind === 'task' ? '例如：回复重要邮件' : addKind === 'habit' ? '例如：拉伸 10 分钟' : '例如：完成个人作品集'} /></label>
            <label>{addKind === 'task' ? '时间或备注' : addKind === 'habit' ? '每日目标次数' : '计划分类'}<input value={detail} onChange={(event) => setDetail(event.target.value)} inputMode={addKind === 'habit' ? 'numeric' : 'text'} placeholder={addKind === 'task' ? '例如：18:30' : addKind === 'habit' ? '例如：1' : '例如：个人成长'} /></label>
            <button className="submit-button" type="submit">保存到微光</button>
          </form>
        </section>
      </div>}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}

function EmptyState({ text, onAdd }: { text: string; onAdd: () => void }) {
  return <div className="empty"><div>＋</div><p>{text}</p><button onClick={onAdd}>添加第一项</button></div>;
}

function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) {
  return <article className="metric glass-panel"><i className={tone} /><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}
