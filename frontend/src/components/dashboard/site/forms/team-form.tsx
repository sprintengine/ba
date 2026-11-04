"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import type { SiteSectionOf, TeamContent } from "@/lib/api/types";
import { LIMITS } from "@/lib/site/schema";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { ImageField } from "../images/image-field";
import { useEditor } from "../use-site-editor";
import { TextField, useContentForm } from "./fields";
import { SectionForm } from "./section-form";

export function TeamForm({ section }: { section: SiteSectionOf<"team"> }) {
  const form = useContentForm(section);
  return (
    <SectionForm form={form}>
      <TextField<TeamContent> name="heading" label="Heading" max={LIMITS.heading} />
      <TextField<TeamContent> name="intro" label="Intro" max={LIMITS.intro} optional multiline />
      <MembersEditor />
    </SectionForm>
  );
}

/** Everyone (from Resources) or chosen people with their own bio and photo. */
function MembersEditor() {
  const { site } = useEditor();
  const team = site.context.team;
  const { control } = useFormContext<TeamContent>();
  const { fields, append, remove } = useFieldArray<TeamContent, "members">({ control, name: "members" });
  const members = useWatch<TeamContent, "members">({ name: "members" });
  const everyone = fields.length === 0;
  const name = (id: string) => team.find((t) => t.id === id)?.name ?? "Removed person";

  const setEveryone = (on: boolean) => {
    if (on) remove();
    else append(team.map((t) => ({ resourceId: t.id, bio: t.description, photo: null })));
  };
  const toggle = (id: string, on: boolean) => {
    const index = members.findIndex((m) => m.resourceId === id);
    if (on && index < 0)
      append({ resourceId: id, bio: team.find((t) => t.id === id)?.description ?? null, photo: null });
    if (!on && index >= 0) remove(index);
  };

  if (team.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add people under Resources and they appear here automatically.
      </p>
    );
  }
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">People</legend>
      <Field
        label="Show everyone"
        orientation="horizontal"
        help="Uses each person's description from Resources."
      >
        <Switch checked={everyone} onCheckedChange={setEveryone} />
      </Field>
      {!everyone && (
        <>
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {team.map((t) => (
              <li key={t.id}>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={members.some((m) => m.resourceId === t.id)}
                    onCheckedChange={(v) => toggle(t.id, v === true)}
                  />
                  {t.name}
                </label>
              </li>
            ))}
          </ul>
          <ol className="flex flex-col gap-3">
            {fields.map((f, i) => (
              <li
                key={f.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface-sunken/50 p-3"
              >
                <p className="text-sm font-semibold">{name(members[i]?.resourceId ?? "")}</p>
                <TextField<TeamContent>
                  name={`members.${i}.bio`}
                  label="Bio"
                  max={LIMITS.bio}
                  optional
                  multiline
                  rows={2}
                />
                <ImageField<TeamContent>
                  name={`members.${i}.photo`}
                  label="Photo"
                  sources={["upload", "stock"]}
                />
              </li>
            ))}
          </ol>
        </>
      )}
    </fieldset>
  );
}
