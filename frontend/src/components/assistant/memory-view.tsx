"use client";

import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import { useAddMemory, useAssistantMemory, useDeleteMemory, useUpdateMemory } from "@/lib/api/hooks";
import type { MemoryEntry } from "@/lib/api/types";
import { ASSISTANT_NAME } from "@/lib/assistant/constants";
import { useCurrentBusiness, usePermissions } from "@/lib/business/business-context";
import { ErrorState } from "@/components/common/feedback";
import { applyApiErrors, Form, FormField, FormRootError, FormSubmit } from "@/components/ui/form";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";

const MAX = 280;

function Entry({ entry, editable }: { entry: MemoryEntry; editable: boolean }) {
  const business = useCurrentBusiness();
  const [draft, setDraft] = useState<string | null>(null);
  // After saving or cancelling, focus goes back to the entry's Edit button (the edit field it replaced is gone).
  const refocus = useRef(false);
  const closeEdit = () => {
    refocus.current = true;
    setDraft(null);
  };
  const update = useUpdateMemory(business.id, {
    onSuccess: closeEdit,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const save = () => {
    if (draft?.trim()) update.mutate({ id: entry.id, text: draft });
  };
  const remove = useDeleteMemory(business.id, { onError: (e) => toast.error(errorMessage(e)) });
  if (draft !== null) {
    return (
      <li className="flex items-center gap-1.5">
        <Input
          aria-label="Edit memory"
          value={draft}
          maxLength={MAX}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          size="sm"
        />
        <IconButton label="Save" loading={update.isPending} disabled={!draft.trim()} onClick={save}>
          <Check />
        </IconButton>
        <IconButton label="Cancel" onClick={closeEdit}>
          <X />
        </IconButton>
      </li>
    );
  }
  return (
    <li className="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-accent">
      <span className="flex-1 text-sm">{entry.text}</span>
      {editable && (
        <span className="flex shrink-0 gap-0.5">
          <IconButton
            ref={(button) => {
              if (button && refocus.current) {
                refocus.current = false;
                button.focus();
              }
            }}
            label={`Edit: ${entry.text}`}
            size="xs"
            onClick={() => setDraft(entry.text)}
          >
            <Pencil />
          </IconButton>
          <IconButton
            label={`Forget: ${entry.text}`}
            size="xs"
            variant="danger"
            loading={remove.isPending}
            onClick={() => remove.mutate(entry.id)}
          >
            <Trash2 />
          </IconButton>
        </span>
      )}
    </li>
  );
}

/** Business memory: facts and preferences Bo keeps in mind ("we close early on Fridays"). Owners and admins edit. */
export function MemoryView() {
  const business = useCurrentBusiness();
  const { manageAssistant } = usePermissions();
  const memory = useAssistantMemory(business.id);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Things {ASSISTANT_NAME} keeps in mind for everyone on your team.{" "}
        {!manageAssistant && "Owners and admins can change them."}
      </p>
      {memory.isError ? (
        <ErrorState error={memory.error} onRetry={() => memory.refetch()} />
      ) : memory.isPending ? (
        <Skeleton className="h-24 rounded-lg" />
      ) : memory.data.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-subtle-foreground">
          Nothing saved yet.
          {manageAssistant && " Add your first note below, like where people should park."}
        </p>
      ) : (
        <ul className="flex flex-col" aria-label={`What ${ASSISTANT_NAME} remembers`}>
          {memory.data.map((m) => (
            <Entry key={m.id} entry={m} editable={manageAssistant} />
          ))}
        </ul>
      )}
      {manageAssistant && <AddMemoryForm />}
    </div>
  );
}

const memorySchema = z.object({ text: z.string().trim().max(MAX) });
type MemoryValues = z.infer<typeof memorySchema>;

/** One new fact; the server's errors show under the field or below the form. */
function AddMemoryForm() {
  const business = useCurrentBusiness();
  const add = useAddMemory(business.id);
  const form = useForm<MemoryValues>({ resolver: zodResolver(memorySchema), defaultValues: { text: "" } });
  const text = useWatch({ control: form.control, name: "text" });
  return (
    <Form
      form={form}
      className="gap-2"
      onSubmit={async ({ text }) => {
        if (!text) return;
        try {
          await add.mutateAsync(text);
          form.reset({ text: "" });
        } catch (err) {
          applyApiErrors(form, err);
        }
      }}
    >
      <div className="flex items-end gap-2">
        <FormField<MemoryValues, "text"> name="text" label="Add something to remember" className="flex-1">
          {(field) => <Input {...field} maxLength={MAX} placeholder="e.g. We close early on Fridays" />}
        </FormField>
        <FormSubmit variant="secondary" disabled={!text.trim()}>
          Add
        </FormSubmit>
      </div>
      <FormRootError />
    </Form>
  );
}
