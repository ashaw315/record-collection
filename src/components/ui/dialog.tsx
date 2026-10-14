"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      {/*
        `text-sm` here is an inherited CONTAINER DEFAULT rather than a role, so
        it is left as it is: every child a dialog renders today — DialogTitle,
        DialogDescription, Button — sets its own size, so this reaches nothing.
        Converting it would name a role for text that does not exist. If a
        dialog ever renders unclassed prose, that element takes a role, not this.
      */}
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              /*
                §9.3, step 128: the cross is 28, 8 from the dialog's top and
                its right, so an overlay of 44 square reaches those two
                edges exactly and 8 into the dialog on the other two, under
                the handoff's 9. Displayed where the pointer is coarse, as
                every hit area is (`src/app/hit-area.ts`).
              */
              <Button
                variant="ghost"
                className="absolute top-2 right-2 before:absolute before:top-1/2 before:left-1/2 before:hidden before:size-[44px] before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] pointer-coarse:before:block"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        /*
          §9.3, step 128: the footer's buttons are boxes, so they are 44 in the box where the pointer is coarse.
          Step 139 (Design, 12 Oct): one order at every width, "Cancel first and the destructive verb last, side
          by side left to right and stacked top to bottom", so the column is no longer reversed; and stacked they
          stand 24 apart, §G.3's gap, "so a thumb landing low reaches neither by sliding off the other". No
          overlay reaches into that 24: each button is its own box. Step 143 (Design, 13 Oct): the 24 side by side
          as well, "controls in one group stand 24 apart, §G.3's gap, side by side or stacked"; it was 8 from 640.
        */
        "-mx-4 -mb-4 flex flex-col gap-6 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end pointer-coarse:[&>button]:h-[44px]",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        // `pr-6`: the close button is absolutely positioned at top-2 right-2,
        // so a title long enough to reach it renders UNDERNEATH it. Reserving
        // the space here fixes every dialog rather than each caller — seen with
        // a full record title, which is the normal case for a delete
        // confirmation naming what it is about to remove.
        "font-heading pr-6 text-title leading-snug font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-prose text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
