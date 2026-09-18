'use client';

import { useState } from 'react';
import type { Memo } from '@/lib/weiguang-core';

export default function Memos({ memos, onChange, saveStatus }: { memos: Memo[]; onChange: (change: (current: Memo[]) => Memo[]) => void; saveStatus: string }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = memos.find((memo) => memo.id === selectedId);
  const matches = memos.filter((memo) => `${memo.title}\n${memo.content}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  function createMemo() {
    const now = new Date().toISOString();
    const memo: Memo = { id: crypto.randomUUID(), title: '', content: '', createdAt: now, updatedAt: now };
    onChange((current) => [memo, ...current]); setQuery(''); setSelectedId(memo.id);
  }
  function editMemo(change: Partial<Pick<Memo, 'title' | 'content'>>) {
    onChange((current) => current.map((memo) => memo.id === selectedId ? { ...memo, ...change, updatedAt: new Date().toISOString() } : memo));
  }
  function deleteMemo() {
    if (!selected || !window.confirm(`确定删除“${selected.title.trim() || '无标题备忘录'}”吗？此操作无法撤销。`)) return;
    onChange((current) => current.filter((memo) => memo.id !== selected.id)); setSelectedId(null);
  }
  return <section className="view-section memo-section">
    <div className="section-head"><div><span className="section-label">{memos.length} 篇备忘录</span><h2>随手记下，留待想起</h2></div><button className="add-button" onClick={createMemo}><span>＋</span> 新建备忘录</button></div>
    <label className="memo-search">搜索备忘录<input type="search" placeholder="搜索标题或正文" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <div className="memo-workspace">
      <div className="memo-list" aria-label="备忘录列表">{matches.map((memo) => <button key={memo.id} className={`memo-card glass-panel ${selectedId === memo.id ? 'selected' : ''}`} onClick={() => setSelectedId(memo.id)} aria-pressed={selectedId === memo.id}><strong>{memo.title.trim() || '无标题备忘录'}</strong><p>{memo.content.trim() || '还没有正文，点击开始记录'}</p><time dateTime={memo.updatedAt}>{new Date(memo.updatedAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></button>)}{matches.length === 0 && <p className="memo-empty">{query.trim() ? '没有找到匹配的备忘录，试试其他关键词。' : '还没有备忘录，点击“新建备忘录”记下第一个想法。'}</p>}</div>
      {selected ? <article className="memo-editor glass-panel" key={selected.id}><div className="memo-editor-head"><span role="status">{saveStatus}</span><button className="delete-habit-button" onClick={deleteMemo}>删除备忘录</button></div><label>标题<input autoFocus placeholder="无标题备忘录" value={selected.title} onChange={(event) => editMemo({ title: event.target.value })} /></label><label>正文<textarea placeholder="想法、灵感、需要记住的小事……" value={selected.content} onChange={(event) => editMemo({ content: event.target.value })} /></label><small>{selected.content.length} 字 · 内容仅保存在当前设备</small></article> : <div className="memo-editor memo-placeholder glass-panel">{memos.length ? '选择一篇备忘录，继续记录。' : '给零散的想法留一个位置。'}</div>}
    </div>
  </section>;
}
