'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, DollarSign, Fuel, Utensils, Bed, Ticket, Car, MoreHorizontal } from 'lucide-react'
import type { Expense, Stop, Trip, Profile, ExpenseCategory } from '@/types'
import { EXPENSE_CATEGORIES } from '@/types'

interface BudgetTrackerProps {
  expenses: Expense[]
  stops: Stop[]
  trip: Trip
  profiles: Profile[]
  currentUserId: string
  onAddExpense: (expense: Omit<Expense, 'id' | 'created_at'>) => void
  onDeleteExpense: (expenseId: string) => void
}

const categoryIcons: Record<ExpenseCategory, React.ReactNode> = {
  fuel: <Fuel className="h-4 w-4" />,
  food: <Utensils className="h-4 w-4" />,
  lodging: <Bed className="h-4 w-4" />,
  activities: <Ticket className="h-4 w-4" />,
  transport: <Car className="h-4 w-4" />,
  other: <MoreHorizontal className="h-4 w-4" />,
}

const categoryColors: Record<ExpenseCategory, string> = {
  fuel: 'bg-amber-500/20 text-amber-400',
  food: 'bg-green-500/20 text-green-400',
  lodging: 'bg-blue-500/20 text-blue-400',
  activities: 'bg-purple-500/20 text-purple-400',
  transport: 'bg-orange-500/20 text-orange-400',
  other: 'bg-gray-500/20 text-gray-400',
}

export function BudgetTracker({
  expenses,
  stops,
  trip,
  profiles,
  currentUserId,
  onAddExpense,
  onDeleteExpense,
}: BudgetTrackerProps) {
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [category, setCategory] = useState<ExpenseCategory>('other')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [stopId, setStopId] = useState<string>('')

  const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const budget = Number(trip.total_budget) || 0
  const remaining = budget - totalSpent
  const percentSpent = budget > 0 ? (totalSpent / budget) * 100 : 0

  const expensesByCategory = EXPENSE_CATEGORIES.map((cat) => ({
    ...cat,
    total: expenses.filter((e) => e.category === cat.value).reduce((sum, e) => sum + Number(e.amount), 0),
  })).filter((cat) => cat.total > 0)

  const handleAddExpense = () => {
    if (!amount) return
    onAddExpense({
      trip_id: trip.id,
      stop_id: stopId || null,
      category,
      amount: parseFloat(amount),
      description: description || null,
      paid_by: currentUserId,
    })
    setIsAddOpen(false)
    setAmount('')
    setDescription('')
    setCategory('other')
    setStopId('')
  }

  const getProfileName = (userId: string | null) => {
    if (!userId) return 'Unknown'
    return profiles.find((p) => p.id === userId)?.display_name || 'Unknown'
  }

  return (
    <>
      {/* Budget Summary */}
      <div className="mb-6 rounded-xl border border-border/50 bg-card/50 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-medium text-foreground">Budget Overview</h3>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Expense
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Expense</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          <div className="flex items-center gap-2">
                            {categoryIcons[cat.value]}
                            {cat.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount ($)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="desc">Description</Label>
                  <Input
                    id="desc"
                    placeholder="What was this for?"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                {stops.length > 0 && (
                  <div className="space-y-2">
                    <Label>Stop (optional)</Label>
                    <Select value={stopId} onValueChange={setStopId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a stop" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No specific stop</SelectItem>
                        {stops.map((stop) => (
                          <SelectItem key={stop.id} value={stop.id}>
                            {stop.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button className="w-full" onClick={handleAddExpense} disabled={!amount}>
                  Add Expense
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-foreground">${totalSpent.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground">Spent</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-primary">${budget.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground">Budget</p>
          </div>
          <div>
            <p className={`text-2xl font-bold ${remaining >= 0 ? 'text-green-400' : 'text-destructive'}`}>
              ${Math.abs(remaining).toFixed(0)}
            </p>
            <p className="text-xs text-muted-foreground">{remaining >= 0 ? 'Remaining' : 'Over'}</p>
          </div>
        </div>

        {budget > 0 && (
          <div className="mb-4">
            <div className="mb-1 text-xs text-muted-foreground">{percentSpent.toFixed(0)}% spent</div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${
                  percentSpent > 100 ? 'bg-destructive' : 'bg-primary'
                }`}
                style={{ width: `${Math.min(percentSpent, 100)}%` }}
              />
            </div>
          </div>
        )}

        {expensesByCategory.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">By Category</p>
            <div className="flex flex-wrap gap-2">
              {expensesByCategory.map((cat) => (
                <div
                  key={cat.value}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${categoryColors[cat.value]}`}
                >
                  {categoryIcons[cat.value]}
                  <span>${cat.total.toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Expense List */}
      <h3 className="mb-3 text-sm font-medium text-foreground">
        Recent Expenses ({expenses.length})
      </h3>

      {expenses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <DollarSign className="mb-4 h-10 w-10 text-muted-foreground/50" />
          <h3 className="mb-1 font-medium text-foreground">No expenses yet</h3>
          <p className="text-sm text-muted-foreground">Track your spending as you travel</p>
        </div>
      ) : (
        <div className="space-y-2">
          {expenses.map((expense) => {
            const stop = stops.find((s) => s.id === expense.stop_id)
            return (
              <div
                key={expense.id}
                className="group flex items-center gap-3 rounded-lg border border-border/50 bg-card/50 p-3"
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full ${categoryColors[expense.category]}`}
                >
                  {categoryIcons[expense.category]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="truncate font-medium text-foreground">
                      {expense.description ||
                        EXPENSE_CATEGORIES.find((c) => c.value === expense.category)?.label}
                    </p>
                    <p className="font-semibold text-foreground">${Number(expense.amount).toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{getProfileName(expense.paid_by)}</span>
                    {stop && (
                      <>
                        <span>•</span>
                        <span className="truncate">{stop.name}</span>
                      </>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => onDeleteExpense(expense.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
