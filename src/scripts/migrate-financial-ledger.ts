import dotenv from "dotenv";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaContributionModel from "@/lib/models/chama-contribution";
import ChamaFinancialAuditModel from "@/lib/models/chama-financial-audit";
import ChamaFinancialTransactionModel from "@/lib/models/chama-financial-transaction";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaRoundModel from "@/lib/models/chama-round";
import { toMinorUnits } from "@/lib/finance/money";
import { ensureFinanceIndexes } from "@/lib/finance/service";

dotenv.config({ path: ".env.local" });

const dryRun = process.argv.includes("--dry-run");
const batchSize = 250;

const main = async () => {
  await connectMongoose();
  const duplicateRounds = await ChamaRoundModel.aggregate([
    { $group: { _id: { groupId: "$groupId", roundNumber: "$roundNumber" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 20 },
  ]);
  const multipleOpenRounds = await ChamaRoundModel.aggregate([
    { $match: { status: "open" } },
    { $group: { _id: "$groupId", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 20 },
  ]);
  const groups = await ChamaGroupModel.find().select({ currency: 1 }).lean();
  const currencyByGroup = new Map(groups.map((group) => [String(group._id), group.currency || "KES"]));
  const preflightSamples: Array<{ id: string; source: "contribution" | "payout"; reason: string }> = [];
  let unresolvedSourceReferenceCount = 0;
  let unlinkedContributions = 0;
  let legacyPayoutRounds = 0;
  let amountsRequiringReview = 0;
  const addPreflightIssue = (issue: { id: string; source: "contribution" | "payout"; reason: string }) => {
    unresolvedSourceReferenceCount += 1;
    if (preflightSamples.length < 100) preflightSamples.push(issue);
  };

  const contributions = ChamaContributionModel.find({
    $or: [{ financialTransactionId: null }, { financialTransactionId: { $exists: false } }],
  }).select({ _id: 1, groupId: 1, amount: 1 }).lean().cursor();
  for await (const contribution of contributions) {
    unlinkedContributions += 1;
    const currency = currencyByGroup.get(String(contribution.groupId));
    if (!currency) {
      addPreflightIssue({ id: String(contribution._id), source: "contribution", reason: "The source group is missing; currency cannot be safely determined." });
      continue;
    }
    try {
      toMinorUnits(contribution.amount, currency);
    } catch {
      amountsRequiringReview += 1;
    }
  }

  const payoutRounds = ChamaRoundModel.find({ receivedAt: { $type: "date" } }).select({ _id: 1, groupId: 1 }).lean().cursor();
  for await (const round of payoutRounds) {
    legacyPayoutRounds += 1;
    if (!currencyByGroup.has(String(round.groupId))) {
      addPreflightIssue({ id: String(round._id), source: "payout", reason: "The legacy payout round has no source group; currency cannot be safely determined." });
    }
  }

  if (dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      unlinkedContributions,
      legacyPayoutRounds,
      amountsRequiringReview,
      unresolvedSourceReferenceCount,
      unresolvedSourceReferenceSamples: preflightSamples,
      duplicateRounds,
      multipleOpenRounds,
    }, null, 2));
    return;
  }

  if (duplicateRounds.length || multipleOpenRounds.length) {
    throw new Error("Round uniqueness preflight failed. Run --dry-run to review duplicate round numbers and multiple open rounds before applying finance indexes.");
  }
  if (unresolvedSourceReferenceCount) {
    throw new Error(`Migration stopped before writing: ${unresolvedSourceReferenceCount} source records have missing group references. Run --dry-run for sample details.`);
  }

  await ensureFinanceIndexes();
  let migratedContributions = 0;
  let linkedContributions = 0;
  let migratedLegacyPayouts = 0;

  let ops: Array<Record<string, unknown>> = [];
  let auditRows: Array<Record<string, unknown>> = [];
  const flush = async () => {
    if (ops.length) await ChamaFinancialTransactionModel.bulkWrite(ops as never[], { ordered: false });
    if (auditRows.length) {
      await ChamaFinancialAuditModel.bulkWrite(
        auditRows.map((row) => ({
          updateOne: {
            filter: { idempotencyKey: row.idempotencyKey },
            update: { $setOnInsert: row },
            upsert: true,
          },
        })) as never[],
        { ordered: false }
      );
    }
    ops = [];
    auditRows = [];
  };

  const oldContributions = ChamaContributionModel.find({
    $or: [{ financialTransactionId: null }, { financialTransactionId: { $exists: false } }],
  }).lean().cursor();
  for await (const old of oldContributions) {
    const id = String(old._id);
    const currency = currencyByGroup.get(String(old.groupId));
    if (!currency) throw new Error(`Preflight inconsistency: source group is missing for contribution ${id}.`);
    let amountMinor: number | null = null;
    let amountIssue = "";
    try {
      amountMinor = toMinorUnits(old.amount, currency);
    } catch {
      amountIssue = "Legacy amount was preserved as a major-unit value because it cannot be represented exactly in the configured currency.";
    }
    const transactionId = old._id as Types.ObjectId;
    const migratedStatus = old.status === "pending" ? "pending_verification" : "legacy_unverified";
    ops.push({
      updateOne: {
        filter: { _id: transactionId },
        update: {
          $setOnInsert: {
            _id: transactionId,
            groupId: old.groupId,
            type: "contribution",
            direction: "in",
            amountMinor,
            legacyAmountMajor: old.amount,
            currency,
            memberId: old.memberId,
            roundId: old.roundId,
            recordedBy: "legacy_migration",
            reference: old.reference || "",
            method: old.method || "manual",
            transactionDate: old.paidAt ?? old.createdAt ?? new Date(0),
            status: migratedStatus,
            idempotencyKey: `legacy-contribution:${id}`,
            description: amountIssue || "Imported from the contribution collection; verification evidence was not available during migration.",
            legacy: true,
            legacyContributionId: transactionId,
          },
        },
        upsert: true,
      },
    });
    auditRows.push({
      groupId: old.groupId,
      actorId: "finance-migration",
      action: "legacy.contribution_imported",
      entityType: "financial_transaction",
      entityId: id,
      occurredAt: new Date(),
      idempotencyKey: `legacy-contribution:${id}`,
      reason: "Historical contribution imported. Existing records did not contain independent payment verification evidence.",
      newValues: { status: migratedStatus, amountMinor, currency, legacyAmountMajor: old.amount },
    });
    migratedContributions += 1;
    if (ops.length >= batchSize) await flush();
  }
  await flush();

  const unlinked = ChamaContributionModel.find({
    $or: [{ financialTransactionId: null }, { financialTransactionId: { $exists: false } }],
  }).lean().cursor();
  const linkOps: Array<Record<string, unknown>> = [];
  for await (const source of unlinked) {
    linkOps.push({ updateOne: { filter: { _id: source._id }, update: { $set: { financialTransactionId: source._id } } } });
    linkedContributions += 1;
    if (linkOps.length >= batchSize) {
      await ChamaContributionModel.bulkWrite(linkOps as never[], { ordered: false });
      linkOps.length = 0;
    }
  }
  if (linkOps.length) await ChamaContributionModel.bulkWrite(linkOps as never[], { ordered: false });

  const legacyRounds = ChamaRoundModel.find({ receivedAt: { $type: "date" } }).lean().cursor();
  for await (const round of legacyRounds) {
    const currency = currencyByGroup.get(String(round.groupId));
    if (!currency) throw new Error(`Preflight inconsistency: source group is missing for payout round ${String(round._id)}.`);
    let legacyPayout = await ChamaFinancialTransactionModel.findOne({ legacyRoundId: round._id, type: "payout" });
    if (!legacyPayout) legacyPayout = await ChamaFinancialTransactionModel.create({
      groupId: round.groupId,
      type: "payout",
      direction: "out",
      amountMinor: null,
      currency,
      memberId: round.recipientMemberId,
      roundId: round._id,
      recordedBy: "legacy_migration",
      method: "unknown",
      reference: "",
      transactionDate: round.receivedAt,
      status: "legacy_unverified",
      description: "Imported from a timestamp-only payout marker. Amount, transfer reference and recipient confirmation are unavailable.",
      legacy: true,
      legacyRoundId: round._id,
    });
    await ChamaFinancialAuditModel.updateOne({ idempotencyKey: `legacy-round-payout:${String(round._id)}` }, { $setOnInsert: {
      groupId: round.groupId,
      actorId: "finance-migration",
      action: "legacy.payout_timestamp_imported",
      entityType: "financial_transaction",
      entityId: String(legacyPayout._id),
      occurredAt: new Date(),
      idempotencyKey: `legacy-round-payout:${String(round._id)}`,
      reason: "Legacy payout timestamp preserved without asserting a verified transfer.",
      newValues: { status: "legacy_unverified", amountMinor: null, currency },
    } }, { upsert: true });
    if (!legacyPayout.legacy) migratedLegacyPayouts += 1;
  }

  await ChamaRoundModel.updateMany(
    { snapshotStatus: { $exists: false } },
    { $set: { snapshotStatus: "legacy_review_required" } }
  );
  console.log(JSON.stringify({ migratedContributions, linkedContributions, migratedLegacyPayouts, amountsRequiringReview }, null, 2));
};

main().catch((error) => {
  console.error("Financial ledger migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
