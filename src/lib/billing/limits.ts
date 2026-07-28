import { cloudEnabled } from "../supabase";
import { useBilling } from "../../store/billingStore";
import { usePlatformAdmin } from "../../store/platformAdminStore";

/** True when the active teamspace has AI minutes left (or billing not loaded / local-only). */
export function teamAiAllowed(): boolean {
  if (!cloudEnabled()) return true;
  // Master switch off → unlimited free for everyone
  if (usePlatformAdmin.getState().ready && !usePlatformAdmin.getState().billingEnabled) {
    return true;
  }
  const snap = useBilling.getState().snapshot;
  if (!snap) return true;
  return snap.canUseAi;
}

export function teamAiBlockMessage(): string {
  const snap = useBilling.getState().snapshot;
  if (snap?.pastDue) {
    return "Subscription past due — update billing in Team settings to continue using AI.";
  }
  return "Team AI minute quota reached for this month — upgrade your plan in Team settings.";
}
