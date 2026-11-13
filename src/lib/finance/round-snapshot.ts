import { Types } from "mongoose";
import { fromMinorUnits, toMinorUnits } from "./money";

type GroupMoneySource = { contributionAmount: number; currency: string };

export const buildRoundSnapshot = (
  group: GroupMoneySource,
  eligibleMemberIds: Array<string | Types.ObjectId>,
  at = new Date()
) => {
  const contributionAmountMinor = toMinorUnits(group.contributionAmount, group.currency);
  const memberObligations = eligibleMemberIds.map((memberId) => ({
    memberId: new Types.ObjectId(String(memberId)),
    amountMinor: contributionAmountMinor,
  }));
  const expectedTotalMinor = contributionAmountMinor * memberObligations.length;
  if (!Number.isSafeInteger(expectedTotalMinor) || expectedTotalMinor < 1) {
    throw new Error("The round total exceeds the supported range or has no eligible members.");
  }
  return {
    currencySnapshot: group.currency.toUpperCase(),
    contributionAmountMinor,
    expectedTotalMinor,
    eligibleMemberIds: memberObligations.map((item) => item.memberId),
    memberObligations,
    snapshotAt: at,
    snapshotStatus: "confirmed" as const,
    potAmount: fromMinorUnits(expectedTotalMinor, group.currency),
    potAmountMinor: expectedTotalMinor,
  };
};
