export interface PolicyMeasures {
  baby_bonus: boolean | null;
  parental_leave: boolean | null;
  childcare_subsidy: boolean | null;
  tax_incentive: boolean | null;
}

export interface Policy {
  iso_num: number;
  iso3: string;
  stance: "raise" | "maintain" | "lower" | "none" | null;
  measures: PolicyMeasures;
  notes: string | null;
}

export async function loadPolicies(baseUrl = "/data"): Promise<Policy[]> {
  try {
    const res = await fetch(`${baseUrl}/policies.json`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as Policy[]) : [];
  } catch {
    return [];
  }
}

export function indexPoliciesByIsoNum(policies: Policy[]): Map<number, Policy> {
  const m = new Map<number, Policy>();
  for (const p of policies) m.set(p.iso_num, p);
  return m;
}
