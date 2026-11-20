import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/*
 * The product's buttons (the hierarchy pass, step 4). Primary is the inverse
 * pair and is never grey while it can be pressed; secondary is a hairline on
 * nothing; a destructive one is secondary in the danger colour, and its
 * confirmation carries the weight. Disabled is the same variant at 0.4.
 * Every button is 8px at the corner; focus is the page's one outline.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-inverse-bg text-inverse-text hover:bg-inverse-bg/90",
        destructive: "border border-danger bg-transparent text-danger hover:bg-surface-hover",
        outline: "border border-line-strong bg-transparent text-text-1 hover:bg-surface-hover",
        ghost: "text-text-2 hover:bg-surface-hover hover:text-text-1",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
