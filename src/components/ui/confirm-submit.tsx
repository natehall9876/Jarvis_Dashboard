"use client";

import type { ReactNode } from "react";
import { Button } from "./button";

/**
 * A submit button that asks for confirmation before letting its parent
 * <form action={serverAction}> actually submit. Native window.confirm is
 * intentional here — no extra client state, no dialog component needed for
 * something this infrequent and destructive.
 */
export function ConfirmSubmit({
  confirmMessage,
  children,
  variant = "danger",
  className,
}: {
  confirmMessage: string;
  children: ReactNode;
  variant?: "danger" | "secondary";
  className?: string;
}) {
  return (
    <Button
      type="submit"
      variant={variant}
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </Button>
  );
}
