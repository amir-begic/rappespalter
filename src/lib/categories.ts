// Category types drive all the money maths (see summary/trends/income routes):
//   fixed, variable → spending (budgetable)
//   income          → money in
//   savings         → excluded from spending, shown separately
//   transfer        → internal movement, excluded everywhere

export const CATEGORY_TYPES = [
  { value: "fixed",    group: "Expense", label: "Fixed expense",    hint: "Recurring and predictable: rent, insurance, taxes" },
  { value: "variable", group: "Expense", label: "Variable expense", hint: "Discretionary: groceries, dining, shopping" },
  { value: "income",   group: "Income",  label: "Income",           hint: "Money coming in: salary, side income" },
  { value: "savings",  group: "Other",   label: "Savings",          hint: "Money you keep: ETF, 3a, savings transfers — not counted as spending" },
  { value: "transfer", group: "Other",   label: "Transfer",         hint: "Between your own accounts — excluded from all totals" },
] as const

export type CategoryType = (typeof CATEGORY_TYPES)[number]["value"]

export const isCategoryType = (v: unknown): v is CategoryType =>
  CATEGORY_TYPES.some(t => t.value === v)

// Only expense categories can carry a monthly budget.
export const BUDGETABLE_TYPES: ReadonlySet<string> = new Set(["fixed", "variable"])

// Default colours for new categories, picked in order, skipping ones in use.
export const CATEGORY_PALETTE = [
  "#8ab4d4", "#f0c080", "#d4857a", "#c5b8d4", "#6aaa7a", "#a8c5a0",
  "#e8a060", "#9b7ec4", "#4caf72", "#d4a5c0", "#7ab8b0", "#c9b458",
]

export const isHexColor = (v: unknown): v is string =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)
