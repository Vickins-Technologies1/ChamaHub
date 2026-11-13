export type ContributionStatus = "unpaid" | "partially_paid" | "fully_paid" | "overpaid";

export const getOutstandingMinor = (expectedMinor: number, verifiedMinor: number) =>
  Math.max(0, expectedMinor - verifiedMinor);

export const getContributionStatus = (
  expectedMinor: number,
  verifiedMinor: number,
  pendingMinor = 0
): ContributionStatus | "pending_verification" => {
  if (verifiedMinor > expectedMinor) return "overpaid";
  if (verifiedMinor === expectedMinor && expectedMinor > 0) return "fully_paid";
  if (verifiedMinor > 0) return "partially_paid";
  if (pendingMinor > 0) return "pending_verification";
  return "unpaid";
};

export const canAdvanceRound = (args: {
  outstandingMinor: number;
  payoutStatus: string | null;
}) => args.outstandingMinor === 0 && args.payoutStatus === "confirmed";
