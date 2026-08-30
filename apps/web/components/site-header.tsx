"use client";

import Image from "next/image";
import { Caveat } from "next/font/google";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NotificationToggle } from "@/components/notification-toggle";

const caveat = Caveat({ subsets: ["latin"], weight: "700" });

export function SiteHeader() {
  const pathname = usePathname();
  const wordmark = pathname?.startsWith("/transmit") ? "TaVeno ?" : "ToVeno !";

  return (
    <header className="flex shrink-0 items-center gap-3 px-8 py-4">
      <Image
        src="/icon/raccoon_logo_round.svg"
        alt="ToVeno"
        width={36}
        height={36}
        priority
      />
      <span className={cn(caveat.className, "sketchy-text text-3xl text-foreground")}>
        {wordmark}
      </span>
      <div className="ml-auto">
        <NotificationToggle />
      </div>
    </header>
  );
}
