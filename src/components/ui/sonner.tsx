"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-center"
      richColors={false}
      closeButton
      mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)", left: 12, right: 12 }}
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !border-line !bg-surface !text-ink !shadow-pop !font-sans",
          description: "!text-muted",
          success: "[&_[data-icon]]:!text-accent",
          error: "[&_[data-icon]]:!text-danger",
        },
      }}
    />
  );
}
