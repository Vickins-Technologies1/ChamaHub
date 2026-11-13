export type PaymentInitiationRequest = {
  groupId: string;
  roundId: string;
  memberId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  phoneNumber?: string;
  accountReference: string;
};

export type PaymentInitiationResult = {
  provider: string;
  providerRequestId: string;
  providerReference?: string;
  status: "pending" | "accepted" | "failed";
  message?: string;
};

export type VerifiedPaymentCallback = {
  provider: string;
  providerEventId: string;
  providerReference: string;
  status: "succeeded" | "failed";
  amountMinor: number;
  currency: string;
  phoneNumber?: string;
  occurredAt: Date;
  rawPayloadHash: string;
};

/** Provider callbacks must be authenticated and mapped to verified amounts before touching the ledger. */
export interface PaymentProvider {
  readonly name: string;
  isConfigured(): boolean;
  initiatePayment(input: PaymentInitiationRequest): Promise<PaymentInitiationResult>;
  verifyCallback(request: Request): Promise<VerifiedPaymentCallback>;
}
