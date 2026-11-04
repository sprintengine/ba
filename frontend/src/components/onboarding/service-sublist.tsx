import type { BusinessSetup } from "@/lib/api/types";
import type { SetupAction } from "@/lib/onboarding/actions";
import type { SetupErrors, SetupService } from "@/lib/onboarding/types";

export type EditorProps = {
  setup: BusinessSetup;
  service: SetupService;
  index: number;
  errors: SetupErrors;
  dispatch: (action: SetupAction) => void;
};

/** A titled block inside the service editor (options, add-ons, requirements, groups). */
export function SubList({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">{title}</p>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/** A row's error; give it an [id] and point the row's controls at it with `aria-describedby`. */
export function RowError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="text-xs font-medium text-danger-soft-foreground">
      {children}
    </p>
  );
}

/** The first error under [prefix], for a one-line row summary. */
export function firstError(errors: SetupErrors, prefix: string): string | undefined {
  const k = Object.keys(errors).find((key) => key.startsWith(prefix));
  return k ? errors[k] : undefined;
}
