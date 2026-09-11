import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/**
 * **`text-base md:text-sm` is NOT converted to a role, and that is A67 rather
 * than an oversight.**
 *
 * SPEC.md §7a's scale has no 16px entry and this needs one on mobile: Safari
 * zooms the viewport when a focused input's font-size is under 16px. The pair
 * is 16px on phones and 14px from `md` up, where no zoom rule applies.
 *
 * **No role reproduces that pair.** `typed` is a flat 16px, so converting would
 * take desktop from 14 to 16 across all eight consumers of this component — a
 * visible change on every form in the app, to satisfy a constraint that only
 * exists on mobile. `typed` and A67 agree on what they want from a phone and
 * are not the same rule: `typed` is about what the element accepts, A67 is
 * about what the browser does on focus, and only one of them is responsive.
 *
 * So the exception survives the conversion intact. Do not "finish the job" here
 * without checking what it does to `md:` — the zoom is silent and only appears
 * on a device.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
