import { SettingGroup } from "../../settings/setting-rows";

/**
 * A titled card of the service editor, the same card as in Settings, with an optional action (e.g. "Add option") on the
 * right. `rows` is for cards of label-and-control rows; anything else gets the card's padding.
 */
export function Section({
  title,
  description,
  action,
  rows = false,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  rows?: boolean;
  children: React.ReactNode;
}) {
  return (
    <SettingGroup title={title} description={description} action={action}>
      {rows ? children : <div className="flex flex-col gap-4 p-4">{children}</div>}
    </SettingGroup>
  );
}
