import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deletePlanFromSnapshot,
  getMonthKeys,
  getPreviousMonthKeys,
  getWeekKeys,
  moveTaskCompletion,
  nextMilestoneCopy,
  normalizeSnapshot,
  parseSnapshot,
  planProgress,
  shiftDate,
  stamp,
  type AppSnapshot,
  type Plan,
} from '../lib/weiguang-core.ts';

test('日期范围可跨月、跨年并正确处理闰年', () => {
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDate('2028-02-28', 1), '2028-02-29');
  assert.deepEqual(getWeekKeys('2026-09-03'), ['2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03']);
  assert.equal(getMonthKeys('2028-02-10').length, 29);
  assert.equal(getPreviousMonthKeys('2026-03-10').at(-1), '2026-02-28');
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
  assert.equal(migrated.plans[0].next, '下一步：添加第一个里程碑');
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
