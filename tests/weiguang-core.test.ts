import assert from 'node:assert/strict';
import test from 'node:test';
import {
  changeHabitValue,
  deletePlanFromSnapshot,
  getCompanionState,
  getMonthKeys,
  getMonthToDateKeys,
  getPreviousMonthKeys,
  getPreviousMonthToDateKeys,
  getWeekKeys,
  habitRevisionFor,
  habitProgress,
  isHabitScheduled,
  habitValueFor,
  habitPeriodStart,
  normalizeHabitSchedule,
  moveTaskCompletion,
  nextMilestoneCopy,
  normalizeSnapshot,
  parseSnapshot,
  planProgress,
  recommendedHabitStep,
  shiftDate,
  stamp,
  timeGreeting,
  dateAfterClockChange,
  nextClockCheckDelay,
  upsertHabitRevision,
  type AppSnapshot,
  type Habit,
  type Plan,
} from '../lib/weiguang-core.ts';

test('小光会温和回应进度，并在深夜优先提醒休息', () => {
  assert.deepEqual(getCompanionState(100, 3, 14), { mood: 'celebrate', message: '今天的约定都完成啦。现在可以安心休息了。' });
  assert.equal(getCompanionState(67, 3, 14).mood, 'bright');
  assert.equal(getCompanionState(20, 5, 14).mood, 'curious');
  assert.equal(getCompanionState(0, 3, 23).mood, 'sleepy');
  assert.equal(getCompanionState(0, 0, 14).mood, 'waiting');
});

test('问候语与小光的昼夜状态保持一致', () => {
  assert.equal(timeGreeting(1), '夜深了');
  assert.equal(timeGreeting(8), '早上好');
  assert.equal(timeGreeting(14), '下午好');
  assert.equal(timeGreeting(21), '晚上好');
});

test('日期范围可跨月、跨年并正确处理闰年', () => {
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDate('2028-02-28', 1), '2028-02-29');
  assert.deepEqual(getWeekKeys('2026-09-03'), ['2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03']);
  assert.equal(getMonthKeys('2028-02-10').length, 29);
  assert.equal(getMonthToDateKeys('2028-02-10').length, 10);
  assert.equal(getPreviousMonthKeys('2026-03-10').at(-1), '2026-02-28');
  assert.deepEqual(getPreviousMonthToDateKeys('2026-03-03'), ['2026-02-01', '2026-02-02', '2026-02-03']);
});

test('计划进度和下一里程碑始终由当前里程碑计算', () => {
  const plan = { progress: 99, milestones: [{ id: 1, title: '开始', done: true }, { id: 2, title: '完成', done: false }] } as Plan;
  assert.equal(planProgress(plan), 50);
  assert.equal(nextMilestoneCopy(plan.milestones), '下一步：完成');
  assert.equal(nextMilestoneCopy(plan.milestones.map((item) => ({ ...item, done: true }))), '所有里程碑均已完成');
  assert.equal(nextMilestoneCopy([]), '下一步：添加第一个里程碑');
});

test('旧版 today 记录和缺失字段会安全迁移到当前日期', () => {
  const legacy = {
    version: 4,
    tasks: [{ id: 1, title: '迁移待办', time: '', tag: '旧数据', date: 'today' }],
    habits: [{ id: 2, icon: '读', title: '阅读', target: 1, unit: '次', color: 'blue' }],
    plans: [{ id: 3, title: '计划', detail: '', progress: 0, color: 'blue', next: '旧文案' }],
    records: { today: { taskDone: [1], habits: { '2': 1 } } },
    updatedAt: '',
  } as unknown as AppSnapshot;
  const migrated = normalizeSnapshot(legacy, '2026-09-03');
  assert.equal(migrated.tasks[0].date, '2026-09-03');
  assert.equal(migrated.tasks[0].note, '');
  assert.deepEqual(migrated.records['2026-09-03'], { taskDone: [1], habits: { '2': 1 } });
  assert.equal(migrated.habits[0].days.length, 7);
  assert.equal(migrated.habits[0].paused, false);
  assert.equal(migrated.habits[0].step, 1);
  assert.equal(migrated.habits[0].revisions[0].effectiveFrom, '0001-01-01');
  assert.equal(migrated.plans[0].next, '下一步：添加第一个里程碑');
});

test('习惯新设置只从生效日开始，不改写历史目标和周期', () => {
  const original = {
    id: 1, icon: '水', title: '喝水', target: 8, step: 1, unit: '杯', color: 'blue', days: [1, 2, 3, 4, 5], paused: false, reminder: '',
    revisions: [{ effectiveFrom: '0001-01-01', target: 8, step: 1, unit: '杯', days: [1, 2, 3, 4, 5], paused: false }],
  } satisfies Habit;
  const changed = upsertHabitRevision({ ...original, target: 2000, step: 250, unit: 'ml', days: [1, 3, 5] }, '2026-09-04');
  assert.deepEqual(habitRevisionFor(changed, '2026-09-03'), original.revisions[0]);
  assert.equal(habitRevisionFor(changed, '2026-09-04').target, 2000);
  assert.equal(habitRevisionFor(changed, '2026-09-04').step, 250);
  assert.deepEqual(habitRevisionFor(changed, '2026-09-04').days, [1, 3, 5]);
});

test('习惯记录量会根据目标和单位给出合理默认值', () => {
  assert.equal(recommendedHabitStep(2000, 'ml'), 250);
  assert.equal(recommendedHabitStep(20, '分钟'), 5);
  assert.equal(recommendedHabitStep(8, '杯'), 1);
  assert.equal(recommendedHabitStep(10000, '步'), 1000);
});

test('习惯记录允许超额完成、不会低于零，且小数记录不会产生浮点尾数', () => {
  assert.equal(changeHabitValue(1750, 250), 2000);
  assert.equal(changeHabitValue(1900, 250), 2150);
  assert.equal(changeHabitValue(100, -250), 0);
  assert.equal(changeHabitValue(0.2, 0.1), 0.3);
});

test('习惯进度可区分未开始、进行中、完成和超额完成', () => {
  assert.deepEqual(habitProgress(0, 2000), { percent: 0, cappedPercent: 0, status: 'not-started', label: '未开始' });
  assert.deepEqual(habitProgress(1000, 2000), { percent: 50, cappedPercent: 50, status: 'in-progress', label: '进行中 50%' });
  assert.deepEqual(habitProgress(2000, 2000), { percent: 100, cappedPercent: 100, status: 'complete', label: '已完成 100%' });
  assert.deepEqual(habitProgress(2500, 2000), { percent: 125, cappedPercent: 100, status: 'exceeded', label: '超额完成 125%' });
});

test('待办改期会迁移完成状态且不会产生重复 ID', () => {
  const records = {
    '2026-09-03': { taskDone: [7, 8], habits: {} },
    '2026-09-04': { taskDone: [7, 9], habits: {} },
  };
  const moved = moveTaskCompletion(records, 7, '2026-09-03', '2026-09-04');
  assert.deepEqual(moved['2026-09-03'].taskDone, [8]);
  assert.deepEqual(moved['2026-09-04'].taskDone, [7, 9]);
  assert.deepEqual(records['2026-09-03'].taskDone, [7, 8]);
});

test('删除计划会保留待办和完成记录，只解除对应计划关联', () => {
  const snapshot = {
    version: 4,
    tasks: [
      { id: 1, title: '保留我', time: '', note: '', tag: '', date: '2026-09-03', planId: 7 },
      { id: 2, title: '其他计划', time: '', note: '', tag: '', date: '2026-09-03', planId: 8 },
    ],
    habits: [],
    plans: [
      { id: 7, title: '删除计划', detail: '', progress: 0, color: 'blue', next: '', milestones: [{ id: 71, title: '随计划删除', done: false }], deadline: '', archived: false },
      { id: 8, title: '保留计划', detail: '', progress: 0, color: 'blue', next: '', milestones: [], deadline: '', archived: false },
    ],
    records: { '2026-09-03': { taskDone: [1], habits: {} } },
    updatedAt: '2026-09-03T00:00:00.000Z',
  } satisfies AppSnapshot;
  const result = deletePlanFromSnapshot(snapshot, 7);
  assert.deepEqual(result.plans.map((plan) => plan.id), [8]);
  assert.equal(result.tasks[0].planId, undefined);
  assert.equal(result.tasks[1].planId, 8);
  assert.deepEqual(result.records, snapshot.records);
  assert.equal(snapshot.tasks[0].planId, 7);
});

test('备份入口拒绝不完整结构并统一到 v4', () => {
  assert.equal(parseSnapshot(null), null);
  assert.equal(parseSnapshot({ tasks: [], habits: [], plans: [], records: [] }), null);
  const parsed = parseSnapshot({ tasks: [], habits: [], plans: [], records: {}, updatedAt: '2026-09-03T00:00:00.000Z' });
  assert.equal(parsed?.version, 4);
  assert.equal(stamp(parsed!).version, 4);
  assert.notEqual(stamp(parsed!).updatedAt, parsed!.updatedAt);
});

function scheduledHabit(frequency: Habit['frequency']): Habit {
  return upsertHabitRevision({ id: 99, title: '打扫', icon: '扫', target: 1, step: 1, unit: '次', color: 'blue', days: [1], paused: false, reminder: '', frequency, intervalDays: 2, startDate: '2026-09-03', revisions: [] }, '2026-09-03');
}
test('隔天习惯从开始日期计算，跨周跨月仍保持间隔，创建前不安排', () => {
  const habit = scheduledHabit('interval');
  assert.equal(isHabitScheduled(habit, '2026-09-02'), false);
  assert.equal(isHabitScheduled(habit, '2026-09-03'), true);
  assert.equal(isHabitScheduled(habit, '2026-09-04'), false);
  assert.equal(isHabitScheduled(habit, '2026-09-05'), true);
  assert.equal(isHabitScheduled(habit, '2026-09-07'), true);
  assert.equal(isHabitScheduled(habit, '2026-10-01'), true);
  assert.equal(isHabitScheduled(habit, '2026-10-02'), false);
});
test('每周目标跨日累计、周一重置，历史进度不包含之后的记录', () => {
  const habit = scheduledHabit('weekly');
  const records = { '2026-09-02': { taskDone: [], habits: { '99': 8 } }, '2026-09-04': { taskDone: [], habits: { '99': 1 } }, '2026-09-06': { taskDone: [], habits: { '99': 1 } } };
  assert.equal(habitValueFor(habit, '2026-09-03', records), 0);
  assert.equal(habitValueFor(habit, '2026-09-05', records), 1);
  assert.equal(habitValueFor(habit, '2026-09-06', records), 2);
  assert.equal(habitValueFor(habit, '2026-09-07', records), 0);
  assert.equal(habitPeriodStart(habit, '2026-09-06'), '2026-09-03');
  assert.equal(habitPeriodStart(habit, '2026-09-07'), '2026-09-07');
  assert.equal(isHabitScheduled(habit, '2026-09-05'), true);
});
test('修改周期保留历史、间隔起点，备份恢复后保持周期', () => {
  const habit = scheduledHabit('interval');
  const changed = upsertHabitRevision({ ...habit, frequency: 'weekly' }, '2026-09-07');
  assert.equal(isHabitScheduled(changed, '2026-09-06'), false);
  assert.equal(isHabitScheduled(changed, '2026-09-08'), true);
  const snapshot = normalizeSnapshot({ version: 4, habits: [changed], tasks: [], plans: [], records: {}, updatedAt: '' }, '2026-09-08');
  assert.equal(snapshot.habits[0].frequency, 'weekly');
  assert.equal(habitRevisionFor(snapshot.habits[0], '2026-09-05').frequency, 'interval');
  assert.equal(habitRevisionFor(snapshot.habits[0], '2026-09-05').startDate, '2026-09-03');
  assert.equal(normalizeHabitSchedule({ intervalDays: -1 }).intervalDays, 2);
  assert.equal(normalizeHabitSchedule({}).frequency, 'weekdays');
  assert.equal(isHabitScheduled(upsertHabitRevision({ ...habit, paused: true }, '2026-09-05'), '2026-09-05'), false);
});

test('只改名称或提醒不会重置本周累计，也不会移动隔天起点', () => {
  const habit = scheduledHabit('weekly');
  const renamed = upsertHabitRevision({ ...habit, title: '收拾房间', reminder: '10:00' }, '2026-09-06');
  assert.deepEqual(renamed.revisions, habit.revisions);
  assert.equal(habitValueFor(renamed, '2026-09-06', { '2026-09-04': { taskDone: [], habits: { '99': 1 } } }), 1);
});

test('跨日、休眠数日及系统日期回拨时跟随今天，历史日期保持原选择', () => {
  assert.equal(dateAfterClockChange('2026-09-06', '2026-09-06', '2026-09-07'), '2026-09-07');
  assert.equal(dateAfterClockChange('2026-09-06', '2026-09-06', '2026-09-10'), '2026-09-10');
  assert.equal(dateAfterClockChange('2026-09-06', '2026-09-05', '2026-09-07'), '2026-09-05');
  assert.equal(dateAfterClockChange('2026-09-07', '2026-09-07', '2026-09-06'), '2026-09-06');
  const weekly = scheduledHabit('weekly');
  const records = { '2026-09-06': { taskDone: [], habits: { '99': 1 } } };
  const today = dateAfterClockChange('2026-09-06', '2026-09-06', '2026-09-07');
  assert.equal(habitValueFor(weekly, today, records), 0);
  assert.equal(habitValueFor(weekly, '2026-09-06', records), 1);
});
test('午夜立即检查，平时最多一分钟检查一次，跨年同样生效', () => {
  assert.equal(nextClockCheckDelay(new Date(2026, 8, 6, 23, 59, 59, 750)), 250);
  assert.equal(nextClockCheckDelay(new Date(2026, 11, 31, 23, 59, 59)), 1000);
  assert.equal(nextClockCheckDelay(new Date(2026, 8, 7, 12)), 60000);
});
