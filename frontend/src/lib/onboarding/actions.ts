import type { BusinessSetup, ResourceKind, Vocabulary } from "@/lib/api/types";
import type {
  SetupAddon,
  SetupDraft,
  SetupGroup,
  SetupOption,
  SetupQuestion,
  SetupRequirement,
  SetupResource,
  SetupService,
} from "./types";

type BusinessPatch = Partial<
  Pick<BusinessSetup, "description" | "timezone" | "currency" | "industry" | "locale" | "country">
>;
type ResourcePatch = Partial<Pick<SetupResource, "name" | "kind" | "capacity" | "description">>;
type ServicePatch = Partial<Omit<SetupService, "options" | "addons" | "requirements" | "allowedGroupKeys">>;
type GroupPatch = Partial<Pick<SetupGroup, "name" | "description" | "restricted">>;
type QuestionPatch = Partial<SetupQuestion>;

export type BusinessAction =
  | { type: "load"; setup: BusinessSetup }
  | { type: "setName"; name: string }
  | { type: "setSlug"; slug: string }
  | { type: "resetSlug" }
  | { type: "updateBusiness"; patch: BusinessPatch }
  | { type: "setVocabulary"; patch: Partial<Vocabulary> }
  | { type: "setBrandColor"; color: string };

export type ResourceAction =
  | { type: "addResource"; kind?: ResourceKind; name?: string }
  | { type: "updateResource"; key: string; patch: ResourcePatch }
  | { type: "removeResource"; key: string }
  | { type: "copyHoursToAll"; resourceKey: string };

/** Hours actions address a day's windows by index in display order (`windowsForDay`). */
export type HoursAction =
  | { type: "setDayOpen"; resourceKey: string; day: number; open: boolean }
  | {
      type: "updateWindow";
      resourceKey: string;
      day: number;
      windowIndex: number;
      patch: { startTime?: string; endTime?: string };
    }
  | { type: "addWindow"; resourceKey: string; day: number }
  | { type: "removeWindow"; resourceKey: string; day: number; windowIndex: number }
  | { type: "copyDayToWeekdays"; resourceKey: string; fromDay?: number };

export type ServiceAction =
  | { type: "addService" }
  | { type: "updateService"; index: number; patch: ServicePatch }
  | { type: "removeService"; index: number }
  | { type: "toggleServiceGroup"; serviceIndex: number; groupKey: string };

/** Options, add-ons and requirements of the service at `serviceIndex`. */
export type ServicePartAction =
  | { type: "addOption"; serviceIndex: number }
  | { type: "updateOption"; serviceIndex: number; index: number; patch: Partial<SetupOption> }
  | { type: "removeOption"; serviceIndex: number; index: number }
  | { type: "addAddon"; serviceIndex: number }
  | { type: "updateAddon"; serviceIndex: number; index: number; patch: Partial<SetupAddon> }
  | { type: "removeAddon"; serviceIndex: number; index: number }
  | { type: "addRequirement"; serviceIndex: number }
  | {
      type: "updateRequirement";
      serviceIndex: number;
      index: number;
      patch: Partial<Omit<SetupRequirement, "resourceKeys">>;
    }
  | { type: "toggleRequirementResource"; serviceIndex: number; index: number; resourceKey: string }
  | { type: "removeRequirement"; serviceIndex: number; index: number };

export type GroupAction =
  | { type: "addGroup" }
  | { type: "updateGroup"; key: string; patch: GroupPatch }
  | { type: "removeGroup"; key: string };

export type QuestionAction =
  | { type: "addQuestion" }
  | { type: "updateQuestion"; index: number; patch: QuestionPatch }
  | { type: "removeQuestion"; index: number }
  | { type: "addQuestionOption"; index: number }
  | { type: "updateQuestionOption"; index: number; optionIndex: number; value: string }
  | { type: "removeQuestionOption"; index: number; optionIndex: number };

/** Every edit the review step can make to a draft. */
export type SetupAction =
  | BusinessAction
  | ResourceAction
  | HoursAction
  | ServiceAction
  | ServicePartAction
  | GroupAction
  | QuestionAction;

/** One reducer per action type of [A]: adding an action without its handler is a type error. */
export type SetupHandlers<A extends SetupAction> = {
  [T in A["type"]]: (draft: SetupDraft, action: Extract<A, { type: T }>) => SetupDraft;
};
