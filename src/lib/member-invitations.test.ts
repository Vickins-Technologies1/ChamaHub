import { describe, expect, it } from "vitest";
import {
  getMemberAccountSetupStatus,
  hashMemberInvitationToken,
  memberAccountSetupStatusLabel,
} from "./member-invitations";

describe("member account invitation status", () => {
  const now = new Date("2026-11-22T12:00:00.000Z");

  it("reports records without invitations and already linked members", () => {
    expect(getMemberAccountSetupStatus({}, now)).toBe("not_invited");
    expect(getMemberAccountSetupStatus({ userId: "user-1" }, now)).toBe("account_activated");
  });

  it("reports live, expired, revoked, and verification-pending invitations", () => {
    expect(getMemberAccountSetupStatus({ accountSetupStatus: "invitation_sent", accountSetupExpiresAt: new Date(now.getTime() + 1000) }, now)).toBe("invitation_sent");
    expect(getMemberAccountSetupStatus({ accountSetupStatus: "invitation_sent", accountSetupExpiresAt: new Date(now.getTime() - 1000) }, now)).toBe("invitation_expired");
    expect(getMemberAccountSetupStatus({ accountSetupStatus: "invitation_revoked" }, now)).toBe("invitation_revoked");
    expect(getMemberAccountSetupStatus({ accountSetupStatus: "setup_started", accountSetupAttemptExpiresAt: new Date(now.getTime() + 1000) }, now)).toBe("setup_in_progress");
    expect(getMemberAccountSetupStatus({ userId: "user-1", accountSetupStatus: "activation_pending_verification" }, now)).toBe("activation_pending");
  });

  it("has clear labels and hashes opaque setup tokens", () => {
    expect(memberAccountSetupStatusLabel("not_invited")).toBe("Not invited");
    expect(memberAccountSetupStatusLabel("account_activated")).toBe("Account activated");
    expect(hashMemberInvitationToken("example-token")).toHaveLength(64);
    expect(hashMemberInvitationToken("example-token")).toBe(hashMemberInvitationToken("example-token"));
    expect(hashMemberInvitationToken("example-token")).not.toBe(hashMemberInvitationToken("other-token"));
  });
});
