"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-center"
      richColors={false}
      closeButton
      toastOptions={{
        classNames: {
          toast: "!rounded-control !border-line !bg-surface !text-ink !shadow-pop !font-sans",
          description: "!text-muted",
          success: "[&_[data-icon]]:!text-accent",
          error: "[&_[data-icon]]:!text-danger",
        },
      }}
    />
  );
}
