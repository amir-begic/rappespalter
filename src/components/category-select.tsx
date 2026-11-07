"use client"

interface Category { id: number; name: string; color: string }

// The category picker in the review inbox and the setup's Sort step. A payee with a
// suggested (or guessed) category shows it already chosen, edged in its colour, so
// "Looks right" next to it is one click; picking another category files it there.
export function CategorySelect({ guessed, categories, disabled, label, placeholder, onChange }: {
  guessed:     Category | null
  categories:  Category[]
  disabled?:   boolean
  label:       string
  placeholder: string
  onChange:    (categoryId: number) => void
}) {
  return (
    <select
      value={guessed?.id ?? ""}
      disabled={disabled}
      onChange={e => {
        const id = Number(e.target.value)
        if (e.target.value && id !== guessed?.id) onChange(id)
      }}
      aria-label={label}
      style={guessed ? { borderColor: guessed.color, boxShadow: `inset 4px 0 0 ${guessed.color}` } : undefined}
      className={`text-sm rounded-xl border px-2 py-1 bg-card text-foreground w-44 ${
        guessed ? "border-2 pl-3 font-medium" : "border-input"
      }`}
    >
      {!guessed && <option value="">{placeholder}</option>}
      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  )
}
