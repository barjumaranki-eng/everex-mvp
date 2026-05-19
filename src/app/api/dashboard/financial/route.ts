import { NextResponse } from "next/server";
import { canViewSensitiveProfitMetrics } from "@/lib/authz";
import { getTodayAndMonthSummary } from "@/lib/financial-summary";
import { todayDayKey } from "@/lib/day-key";
import { getSessionUser } from "@/lib/session";

/**
 * Resumen financiero (mini estado / métricas). Solo ADMIN.
 * Roles operativos reciben 403 aunque conozcan la URL.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!canViewSensitiveProfitMetrics(user)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const dayKey = todayDayKey();
  const fin = await getTodayAndMonthSummary(dayKey);
  return NextResponse.json({
    dayKey,
    monthRange: fin.monthRange,
    today: fin.today,
    month: fin.month,
  });
}
