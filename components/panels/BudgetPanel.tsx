'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useTripStore } from '@/store/tripStore';
import { createClient } from '@/lib/supabase/client';
import {
  BUDGET_CATEGORY_LABELS,
  BUDGET_CATEGORY_ICONS,
  type BudgetCategory,
  type BudgetItem,
} from '@/types';
import { formatCurrency } from '@/lib/utils';

const BUDGET_COLORS: Record<BudgetCategory, string> = {
  gas: '#F59E0B',
  hotel: '#6366F1',
  food: '#EF4444',
  activities: '#3B82F6',
  emergency: '#F97316',
  misc: '#6B7280',
};

export function BudgetPanel() {
  const { activePanel, setActivePanel, budgetItems, addBudgetItem, removeBudgetItem, activeTrip } =
    useTripStore();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    label: '',
    amount: '',
    category: 'misc' as BudgetCategory,
    date: '',
  });
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const isOpen = activePanel === 'budget';

  const totalSpent = budgetItems.reduce((sum, i) => sum + i.amount, 0);
  const totalBudget = activeTrip?.total_budget ?? 0;
  const remaining = totalBudget - totalSpent;

  const byCategory = (Object.keys(BUDGET_CATEGORY_LABELS) as BudgetCategory[]).map((cat) => ({
    name: BUDGET_CATEGORY_LABELS[cat],
    value: budgetItems.filter((i) => i.category === cat).reduce((s, i) => s + i.amount, 0),
    color: BUDGET_COLORS[cat],
    category: cat,
  })).filter((d) => d.value > 0);

  const handleAdd = useCallback(async () => {
    if (!activeTrip || !form.label || !form.amount) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('budget_items')
      .insert({
        trip_id: activeTrip.id,
        label: form.label,
        amount: parseFloat(form.amount),
        category: form.category,
        date: form.date || null,
      })
      .select()
      .single();
    if (!error && data) {
      addBudgetItem(data as BudgetItem);
      setForm({ label: '', amount: '', category: 'misc', date: '' });
      setAdding(false);
    }
    setSaving(false);
  }, [activeTrip, form, supabase, addBudgetItem]);

  const handleDelete = useCallback(
    async (id: string) => {
      await supabase.from('budget_items').delete().eq('id', id);
      removeBudgetItem(id);
    },
    [supabase, removeBudgetItem]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="budget-panel"
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed left-16 top-0 bottom-0 z-20 w-80 bg-[#13131A] border-r border-white/8 flex flex-col shadow-2xl"
        >
          {/* Header */}
          <div className="p-4 border-b border-white/8 flex items-center justify-between">
            <div>
              <h2 className="text-white font-semibold">Budget Tracker</h2>
              <p className="text-slate-500 text-xs mt-0.5">{budgetItems.length} items</p>
            </div>
            <button
              onClick={() => setActivePanel(null)}
              className="p-2 text-slate-500 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Summary */}
          <div className="p-4 border-b border-white/8 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">Budget</p>
                <p className="text-white font-semibold text-sm">{formatCurrency(totalBudget)}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">Spent</p>
                <p className="text-amber-400 font-semibold text-sm">{formatCurrency(totalSpent)}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">Left</p>
                <p className={`font-semibold text-sm ${remaining < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {formatCurrency(Math.abs(remaining))}
                  {remaining < 0 && ' over'}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            {totalBudget > 0 && (
              <div className="bg-white/5 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min((totalSpent / totalBudget) * 100, 100)}%`,
                    backgroundColor: totalSpent > totalBudget ? '#EF4444' : '#F59E0B',
                  }}
                />
              </div>
            )}
          </div>

          {/* Pie chart */}
          {byCategory.length > 0 && (
            <div className="p-4 border-b border-white/8">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={byCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {byCategory.map((entry) => (
                      <Cell key={entry.category} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#13131A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                    labelStyle={{ color: '#F8FAFC' }}
                    formatter={(value) => [formatCurrency(Number(value)), '']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 justify-center">
                {byCategory.map((d) => (
                  <span key={d.category} className="flex items-center gap-1 text-xs text-slate-400">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: d.color }} />
                    {d.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Items list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {budgetItems.length === 0 && !adding && (
              <div className="text-center py-6">
                <span className="text-3xl block mb-2">💳</span>
                <p className="text-slate-400 text-sm">No expenses yet</p>
              </div>
            )}
            {budgetItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 bg-white/5 border border-white/8 rounded-xl p-3"
              >
                <span className="text-xl flex-shrink-0">{BUDGET_CATEGORY_ICONS[item.category as BudgetCategory]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{item.label}</p>
                  <p className="text-slate-500 text-xs">{BUDGET_CATEGORY_LABELS[item.category as BudgetCategory]}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-amber-400 font-semibold text-sm">{formatCurrency(item.amount)}</p>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-slate-600 hover:text-red-400 text-xs transition-colors"
                  >
                    remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add form */}
          <AnimatePresence>
            {adding && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t border-white/8"
              >
                <div className="p-3 space-y-2">
                  <input
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-amber-500/50 placeholder-slate-600"
                    placeholder="Label (e.g. Gas fill-up)"
                    value={form.label}
                    onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-amber-500/50 placeholder-slate-600"
                      placeholder="Amount $"
                      value={form.amount}
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    />
                    <select
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-white text-sm outline-none focus:border-amber-500/50"
                      value={form.category}
                      onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as BudgetCategory }))}
                    >
                      {(Object.keys(BUDGET_CATEGORY_LABELS) as BudgetCategory[]).map((cat) => (
                        <option key={cat} value={cat}>{BUDGET_CATEGORY_LABELS[cat]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAdd}
                      disabled={saving || !form.label || !form.amount}
                      className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold py-2 rounded-xl text-sm transition-colors disabled:opacity-50"
                    >
                      {saving ? 'Adding...' : 'Add Expense'}
                    </button>
                    <button
                      onClick={() => setAdding(false)}
                      className="px-4 bg-white/5 hover:bg-white/10 text-white py-2 rounded-xl text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="p-3 border-t border-white/8">
            <button
              onClick={() => setAdding(true)}
              disabled={adding}
              className="w-full py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-medium rounded-xl text-sm transition-colors border border-amber-500/20 disabled:opacity-50"
            >
              + Add Expense
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
