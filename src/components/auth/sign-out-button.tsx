"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      onClick={async () => {
        await createClient().auth.signOut();
        router.replace("/login?info=keluar");
        router.refresh();
      }}
    >
      <LogOut aria-hidden />Keluar
    </Button>
  );
}
