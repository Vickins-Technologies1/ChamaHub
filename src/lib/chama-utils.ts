import type { ChamaGroup } from "@/lib/models/chama-group";

export type ChamaFrequency = "weekly" | "bi-weekly" | "monthly";

export const normalizeFrequency = (value?: string): ChamaFrequency => {
  if (value === "weekly" || value === "bi-weekly" || value === "monthly") {
    return value;
  }
  return "monthly";
};

export const addFrequency = (base: Date, frequency: ChamaFrequency, steps = 1) => {
  const next = new Date(base);
  if (frequency === "weekly") {
    next.setDate(next.getDate() + 7 * steps);
  } else if (frequency === "bi-weekly") {
    next.setDate(next.getDate() + 14 * steps);
  } else {
    next.setMonth(next.getMonth() + steps);
  }
  return next;
};

export const calculatePotAmount = (group: unknown, membersCount: number) => {
  const amount = Number((group as { contributionAmount?: number })?.contributionAmount ?? 0);
  return Math.max(0, amount * membersCount);
};

export const shuffle = <T,>(items: T[]) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export const getNextRecipientId = (rotationOrder: string[], roundNumber: number) => {
  if (rotationOrder.length === 0) return null;
  const index = (roundNumber - 1) % rotationOrder.length;
  return rotationOrder[index];
};
