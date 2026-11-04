import { router, type Href } from "expo-router";
import { useState } from "react";
import { Layers, Plus } from "lucide-react-native";
import type { Service } from "@shared/api/types";
import { useServices } from "@shared/api/hooks/use-services";
import { useBusinessContext, usePermissions } from "@shared/business/business-context";
import { EmptyState, Screen, SplitView, useLayout } from "~/ui";
import { UnsavedChangesScope, useConfirmLeave } from "~/ui/form";
import { ServiceEditor } from "./ServiceEditor";
import { NEW_SERVICE } from "./editor";
import { ServicesList } from "./ServicesList";

/**
 * `/dashboard/[slug]/services`. Phones: the list; a service (or a new one) opens its editor on its own screen
 * (`/services/[id]`). Large screens, for admins: list and editor side by side, asking before unsaved changes are
 * dropped. Staff only see the list (there is nothing to open).
 */
export function ServicesScreen() {
  const { isWide } = useLayout();
  const perms = usePermissions();
  if (isWide && perms.manageServices) {
    return (
      <UnsavedChangesScope>
        <ServicesSplit />
      </UnsavedChangesScope>
    );
  }
  return <ServicesPhone />;
}

function ServicesPhone() {
  const { business } = useBusinessContext();
  const { isWide } = useLayout();
  const open = (id: string) => router.push(`/dashboard/${business.slug}/services/${id}` as Href);
  return (
    <Screen testID="services">
      <ServicesList wide={isWide} onOpen={(s) => open(s.id)} onNew={() => open(NEW_SERVICE)} />
    </Screen>
  );
}

function ServicesSplit() {
  const { business } = useBusinessContext();
  const services = useServices(business.id);
  const confirmLeave = useConfirmLeave();
  const [selected, setSelected] = useState<string | null>(null);
  // A service just created, until the refetched list has it.
  const [created, setCreated] = useState<Service | null>(null);

  const all = services.data ?? [];
  const service =
    selected && selected !== NEW_SERVICE
      ? (all.find((s) => s.id === selected) ?? (created?.id === selected ? created : undefined))
      : undefined;

  const select = async (id: string) => {
    if (id === selected) return;
    if (await confirmLeave()) setSelected(id);
  };

  const detail =
    selected === NEW_SERVICE || service ? (
      <ServiceEditor
        key={selected}
        embedded
        service={service ?? null}
        services={all}
        onSaved={(saved) => {
          setCreated(saved);
          setSelected(saved.id);
        }}
        onDeleted={() => setSelected(null)}
      />
    ) : (
      <EmptyState
        icon={Layers}
        title="Choose a service"
        description="Its details, prices and rules show here."
        action={{ label: "New service", icon: Plus, onPress: () => void select(NEW_SERVICE) }}
      />
    );

  return (
    <Screen testID="services">
      <SplitView
        list={
          <ServicesList
            wide
            selectedId={selected}
            onOpen={(s) => void select(s.id)}
            onNew={() => void select(NEW_SERVICE)}
          />
        }
        detail={detail}
      />
    </Screen>
  );
}
