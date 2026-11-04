/**
 * The review step's reducer. Pure (no React), so the wizard UI stays thin and the rules are unit-tested. Edits keep
 * cross-references valid: requirements reference resources by `key`, hours and services reference customer groups by
 * `key`, and questions reference services by *name* (so renaming a service rewrites its questions). Each entity's
 * handlers live in `reducers/`.
 */
import type { SetupAction, SetupHandlers } from "./actions";
import { businessHandlers } from "./reducers/business";
import { groupHandlers } from "./reducers/groups";
import { questionHandlers } from "./reducers/questions";
import { hoursHandlers, resourceHandlers } from "./reducers/resources";
import { servicePartHandlers } from "./reducers/service-parts";
import { serviceHandlers } from "./reducers/services";
import type { SetupDraft } from "./types";

const HANDLERS: SetupHandlers<SetupAction> = {
  ...businessHandlers,
  ...resourceHandlers,
  ...hoursHandlers,
  ...serviceHandlers,
  ...servicePartHandlers,
  ...groupHandlers,
  ...questionHandlers,
};

export function setupReducer(draft: SetupDraft, action: SetupAction): SetupDraft {
  // HANDLERS[action.type] takes exactly this action's type; TypeScript can't correlate the two through the lookup.
  const handle = HANDLERS[action.type] as (draft: SetupDraft, action: SetupAction) => SetupDraft;
  return handle(draft, action);
}
