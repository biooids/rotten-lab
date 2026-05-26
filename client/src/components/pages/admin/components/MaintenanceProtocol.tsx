//src/components/pages/admin/components/MaintenanceProtocol.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  Hammer,
  Lock,
  Unlock,
  Loader2,
  Save,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import CornerFlourish from "@/components/shared/CornerFlourish";
import { Button } from "@/components/ui/button";
import {
  useGetMaintenanceQuery,
  useUpdateMaintenanceMutation,
} from "@/lib/features/admin/adminApiSlice";
import { updateMaintenanceSchema } from "@/lib/features/admin/adminSchema";

interface Props {
  showToast: (message: string, type: "success" | "error") => void;
}

export default function MaintenanceProtocol({ showToast }: Props) {
  const { data: maintData } = useGetMaintenanceQuery();
  const [updateMaint, { isLoading: isMaintUpdating }] =
    useUpdateMaintenanceMutation();

  const [maintMsg, setMaintMsg] = useState("");
  const [isMaintLocal, setIsMaintLocal] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Populate state on load
  useEffect(() => {
    if (maintData?.settings) {
      setIsMaintLocal(maintData.settings.is_maintenance);
      setMaintMsg(maintData.settings.maintenance_message);
    }
  }, [maintData]);

  // Live Validation Loop with data-loading protection guard
  useEffect(() => {
    // Hold evaluation until the initial database configuration has successfully arrived
    if (!maintData?.settings) return;

    const result = updateMaintenanceSchema.safeParse({
      is_maintenance: isMaintLocal,
      maintenance_message: maintMsg,
    });

    const errors: Record<string, string> = {};
    if (!result.success) {
      result.error.issues.forEach((issue) => {
        if (issue.path[0]) {
          errors[issue.path[0].toString()] = issue.message;
        }
      });
    }
    setFieldErrors(errors);
  }, [maintMsg, isMaintLocal, maintData]);

  const handleSaveMaintenance = async () => {
    if (Object.keys(fieldErrors).length > 0) return;

    try {
      await updateMaint({
        is_maintenance: isMaintLocal,
        maintenance_message: maintMsg,
      }).unwrap();
      showToast("System protocols updated successfully.", "success");
    } catch {
      showToast("Failed to update system protocols.", "error");
    }
  };

  const msgChars = maintMsg.length;
  const isInvalidLength = msgChars < 10 || msgChars > 500;

  return (
    <div className="relative border-3 border-double p-4 flex flex-col gap-4 bg-card/30">
      <CornerFlourish className="-top-1 -left-1" />
      <CornerFlourish className="-top-1 -right-1 rotate-90" />
      <CornerFlourish className="-bottom-1 -left-1 -rotate-90" />
      <CornerFlourish className="-bottom-1 -right-1 rotate-180" />

      {/* --- HEADER CONTROLS --- */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2 items-center text-primary">
          <h4 className="font-bold text-sm  ">Maintainance message</h4>
        </div>

        <button
          disabled={isMaintUpdating}
          onClick={() => setIsMaintLocal(!isMaintLocal)}
          className={cn(
            "flex items-center gap-2 px-3 py-1 border-3 border-double font-bold text-xs transition-all disabled:opacity-50",
            isMaintLocal
              ? "bg-destructive text-destructive-foreground border-destructive"
              : "bg-primary/10 text-primary border-primary",
          )}
        >
          {isMaintLocal ? (
            <Lock className="h-3 w-3" />
          ) : (
            <Unlock className="h-3 w-3" />
          )}
          {isMaintLocal ? "Maintenance Mode" : "Normal Mode"}
        </button>
      </div>

      {/* --- INPUT LAYER WITH LIVE COUNT --- */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center w-full">
          <label className="text-xs font-bold opacity-70  ">
            Broadcast Message
          </label>
          <span
            className={cn(
              "text-xs font-mono font-bold",
              isInvalidLength ? "text-destructive" : "text-primary",
            )}
          >
            ({msgChars}/500)
          </span>
        </div>

        <div className="flex gap-2">
          <input
            value={maintMsg}
            disabled={isMaintUpdating}
            maxLength={500}
            onChange={(e) => setMaintMsg(e.target.value)}
            placeholder="System protocols are being rewritten..."
            className={cn(
              "flex-1 bg-background border-3 border-double p-2 text-xs font-bold outline-none transition-colors disabled:opacity-50",
              isInvalidLength
                ? "border-destructive/50 focus:border-destructive"
                : "border-double focus:border-primary",
            )}
          />
          <Button
            disabled={isMaintUpdating || Object.keys(fieldErrors).length > 0}
            onClick={handleSaveMaintenance}
            className="border-3 border-double rounded-none h-auto aspect-square p-2"
          >
            {isMaintUpdating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* --- ERROR FEEDBACK CONTAINER --- */}
        {fieldErrors.maintenance_message && (
          <p className="text-xs text-destructive font-bold flex items-center gap-1 mt-1 animate-in fade-in-50 duration-200">
            <AlertTriangle className="h-3 w-3" />
            {fieldErrors.maintenance_message}
          </p>
        )}
      </div>
    </div>
  );
}
