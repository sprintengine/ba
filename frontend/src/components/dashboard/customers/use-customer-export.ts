"use client";

import type { CustomerDetail } from "@/lib/api/types";
import { useExportCustomer } from "@/lib/api/hooks";
import { useBusinessContext } from "@/lib/business/business-context";
import { downloadBlob } from "@/lib/download";
import { withToast } from "@/components/common/with-toast";

/** Downloads everything held about a customer as JSON (a GDPR access request), with a toast either way. */
export function useCustomerExport(customer: Pick<CustomerDetail, "id" | "name"> | undefined) {
  const { business } = useBusinessContext();
  const exportData = useExportCustomer(business.id);
  const download = async () => {
    if (!customer) return;
    await withToast(async () => {
      const data = await exportData.mutateAsync(customer.id);
      downloadBlob(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
        `${customer.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-data-export.json`,
      );
    }, "Export downloaded");
  };
  return { download, isPending: exportData.isPending };
}
