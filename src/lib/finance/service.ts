import { Types, type ClientSession } from "mongoose";
import ChamaFinancialAuditModel from "@/lib/models/chama-financial-audit";
import ChamaFinancialTransactionModel from "@/lib/models/chama-financial-transaction";
import ChamaReconciliationModel from "@/lib/models/chama-reconciliation";
import ChamaRoundModel from "@/lib/models/chama-round";
import { fromMinorUnits } from "@/lib/finance/money";

export const writeFinanceAudit = async (
  entry: {
    groupId: Types.ObjectId | string;
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    reason?: string;
    previousValues?: unknown;
    newValues?: unknown;
  },
  session?: ClientSession
) => {
  const [event] = await ChamaFinancialAuditModel.create(
    [{ ...entry, occurredAt: new Date() }],
    session ? { session } : undefined
  );
  return event;
};

export const refreshRoundRecordedTotal = async (roundId: Types.ObjectId, session?: ClientSession) => {
  let aggregate = ChamaFinancialTransactionModel.aggregate([
    {
      $match: {
        roundId,
        type: "contribution",
        status: { $nin: ["reversed", "failed"] },
        amountMinor: { $type: "number" },
      },
    },
    { $group: { _id: null, totalMinor: { $sum: "$amountMinor" } } },
  ]);
  if (session) aggregate = aggregate.session(session);
  const rows = await aggregate;

  const round = await ChamaRoundModel.findById(roundId).session(session ?? null);
  if (!round) return;
  const totalMinor = rows[0]?.totalMinor ?? 0;
  const currency = round.currencySnapshot;
  round.totalContributions = currency ? fromMinorUnits(totalMinor, currency) : 0;
  await round.save(session ? { session } : undefined);
};

let indexSetup: Promise<void> | null = null;
export const ensureFinanceIndexes = async () => {
  if (!indexSetup) {
    indexSetup = (async () => {
      const [duplicateRounds, multipleOpenRounds] = await Promise.all([
        ChamaRoundModel.aggregate([
          { $group: { _id: { groupId: "$groupId", roundNumber: "$roundNumber" }, count: { $sum: 1 } } },
          { $match: { count: { $gt: 1 } } },
          { $limit: 1 },
        ]),
        ChamaRoundModel.aggregate([
          { $match: { status: "open" } },
          { $group: { _id: "$groupId", count: { $sum: 1 } } },
          { $match: { count: { $gt: 1 } } },
          { $limit: 1 },
        ]),
      ]);
      if (duplicateRounds.length || multipleOpenRounds.length) {
        throw new Error("Financial indexes are blocked until duplicate or multiple-open rounds are reviewed and resolved.");
      }
      await Promise.all([
        ChamaFinancialTransactionModel.createIndexes(),
        ChamaFinancialAuditModel.createIndexes(),
        ChamaRoundModel.createIndexes(),
        ChamaReconciliationModel.createIndexes(),
      ]);
    })().catch((error) => {
      indexSetup = null;
      throw error;
    });
  }
  return indexSetup;
};

export const runInFinancialTransaction = async <T>(work: (session: ClientSession) => Promise<T>) => {
  const session = await ChamaRoundModel.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await work(session);
    }, {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
      readPreference: "primary",
    });
    if (result === undefined) throw new Error("Financial transaction completed without a result.");
    return result;
  } finally {
    await session.endSession();
  }
};

export const isDuplicateKeyError = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === 11000;
