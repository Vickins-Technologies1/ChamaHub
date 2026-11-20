import { describe, expect, it } from "vitest";
import { canUserReplyToTicket, publicTicketMessages, userTicketFilter } from "./support-policy";

describe("support ticket ownership", () => {
  it("scopes user ticket queries to the signed-in account", () => {
    expect(userTicketFilter("member-1")).toEqual({ createdBy: "member-1" });
    expect(canUserReplyToTicket({ createdBy: "member-1", status: "OPEN" }, "member-1")).toBe(true);
    expect(canUserReplyToTicket({ createdBy: "member-2", status: "OPEN" }, "member-1")).toBe(false);
  });

  it("does not allow replies to resolved tickets or expose internal notes", () => {
    expect(canUserReplyToTicket({ createdBy: "member-1", status: "RESOLVED" }, "member-1")).toBe(false);
    expect(publicTicketMessages([{ visibility: "user", body: "Visible" }, { visibility: "internal", body: "Private" }])).toEqual([{ visibility: "user", body: "Visible" }]);
  });
});
