"use client";

import { copyText } from "@/lib/utils";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** Right after booking: this page's address is the guest's way back, so offer to copy it. */
export function SaveLinkCard({ url, noun }: { url: string; noun: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-sunken/60 p-5 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">This page is your {noun} link</p>
        <p className="text-sm text-muted-foreground">
          Bookmark it to reschedule or cancel later. It&apos;s also in your confirmation email.
        </p>
      </div>
      <Button
        variant="secondary"
        className="shrink-0"
        onClick={async () => {
          if (await copyText(url)) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          } else {
            toast.error("Couldn't copy. Select the address bar and copy the link instead.");
          }
        }}
      >
        {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}

/** For signed-out guests: an account keeps every booking in one place. */
export function CreateAccountPrompt({ bookingsNoun, email }: { bookingsNoun: string; email: string | null }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">Keep all your {bookingsNoun} in one place</p>
        <p className="text-sm text-muted-foreground">
          Create a free account with {email ?? "your email"} to see and manage everything you book.
        </p>
      </div>
      <Button asChild variant="secondary" className="shrink-0">
        <Link href={`/sign-up?redirect_url=${encodeURIComponent("/my/bookings")}`}>
          Create account <ArrowRight />
        </Link>
      </Button>
    </div>
  );
}
