import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-xl border border-input bg-card px-3 py-1 text-base transition-colors duration-200 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-[0.6875rem] file:uppercase file:text-foreground placeholder:text-muted-foreground/70 hover:border-foreground/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
