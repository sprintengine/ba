"use client";

import { useState } from "react";
import { CalendarDays, CalendarPlus, Copy, Download, Search, Stethoscope, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SkeletonText } from "@/components/ui/skeleton";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { TimeInput } from "@/components/ui/time-input";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Demo, Section } from "./section";

export function OverlaysSection() {
  const [cmdOpen, setCmdOpen] = useState(false);
  const [showCancelled, setShowCancelled] = useState(true);
  return (
    <Section
      id="overlays"
      title="Overlays"
      description="Dialog, ConfirmDialog, Sheet, Drawer (mobile), Popover, DropdownMenu, Tooltip, CommandDialog."
    >
      <Demo>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary">Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reschedule booking</DialogTitle>
              <DialogDescription>Pick a new time for Alex&apos;s initial assessment.</DialogDescription>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-4">
              <Field label="New start time">
                <TimeInput value="10:00" onValueChange={() => {}} />
              </Field>
              <Field orientation="horizontal" label="Notify customer">
                <Switch defaultChecked />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary">Cancel</Button>
              <Button variant="primary">Reschedule</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <ConfirmDialog
          trigger={<Button variant="danger-soft">Cancel booking…</Button>}
          title="Cancel this booking?"
          description="Alex will be emailed and refunded €65 per your policy."
          confirmLabel="Cancel booking"
          cancelLabel="Keep booking"
          destructive
          onConfirm={async () => {
            await new Promise((r) => setTimeout(r, 800));
            toast.success("Booking cancelled");
          }}
        />
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="secondary">Open sheet</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>BA-7K3F9Q</SheetTitle>
              <SheetDescription>Initial assessment · Thu 1 Oct, 09:00</SheetDescription>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-4">
              <div className="flex gap-2">
                <BookingStatusBadge status="confirmed" />
                <PaymentStatusBadge status="paid" />
              </div>
              <SkeletonText lines={5} />
            </SheetBody>
            <SheetFooter>
              <Button variant="secondary">Reschedule</Button>
              <Button variant="primary">Mark completed</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
        <Drawer>
          <DrawerTrigger asChild>
            <Button variant="secondary">Open drawer</Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Choose a time</DrawerTitle>
              <DrawerDescription>Thursday 1 October</DrawerDescription>
            </DrawerHeader>
            <DrawerBody>
              <div className="grid grid-cols-3 gap-2">
                {["09:00", "09:30", "10:00", "11:30", "14:00", "15:30"].map((t) => (
                  <Button key={t} variant="secondary" className="tnum">
                    {t}
                  </Button>
                ))}
              </div>
            </DrawerBody>
            <DrawerFooter>
              <Button variant="primary" size="lg">
                Continue
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="secondary">Popover</Button>
          </PopoverTrigger>
          <PopoverContent>
            <p className="text-sm font-medium">Share booking page</p>
            <p className="mt-1 text-sm text-muted-foreground">bookanything.ie/lumen-physio</p>
            <Button variant="primary" size="sm" className="mt-3" onClick={() => toast.success("Link copied")}>
              <Copy /> Copy link
            </Button>
          </PopoverContent>
        </Popover>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary">Dropdown</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>View</DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked={showCancelled} onCheckedChange={setShowCancelled}>
              Show cancelled
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Download /> Export CSV <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem destructive>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip content="Tooltips use a dark ink chip" shortcut="⌘K">
          <Button variant="ghost">Hover for tooltip</Button>
        </Tooltip>
        <Button variant="secondary" onClick={() => setCmdOpen(true)}>
          <Search /> Command menu
        </Button>
        <CommandDialog open={cmdOpen} onOpenChange={setCmdOpen}>
          <CommandInput placeholder="Search or jump to…" />
          <CommandList>
            <CommandEmpty>Nothing found.</CommandEmpty>
            <CommandGroup heading="Actions">
              <CommandItem>
                <CalendarPlus /> New booking <CommandShortcut>N</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <Users /> Add customer
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Go to">
              <CommandItem>
                <CalendarDays /> Calendar
              </CommandItem>
              <CommandItem>
                <Stethoscope /> Therapists
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </Demo>
    </Section>
  );
}
