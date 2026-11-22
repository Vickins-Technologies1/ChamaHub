import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaPaymentModel from "@/lib/models/chama-payment";
import ChamaPaymentReceiptModel from "@/lib/models/chama-payment-receipt";
import { getGroupMember, getSessionUser, hasGroupRole, isSiteAdmin } from "@/lib/chama-access";
import { canAccessPaymentReceipt } from "@/lib/payments/payment-rules";

type Params = { params: Promise<{ groupId: string; paymentId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { groupId, paymentId } = await params;
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Sign in to access this receipt." }, { status: 401 });
    if (!Types.ObjectId.isValid(groupId) || !Types.ObjectId.isValid(paymentId)) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
    await connectMongoose();
    const groupMember = await getGroupMember(groupId, user);
    const payment = await ChamaPaymentModel.findOne({ _id: paymentId, groupId }).lean();
    if (!payment) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
    const ownsPayment = Boolean(groupMember && String(groupMember._id) === String(payment.memberId));
    const canReview = isSiteAdmin(user) || hasGroupRole(groupMember, ["admin", "treasurer"]);
    if (!canAccessPaymentReceipt(ownsPayment, canReview)) return NextResponse.json({ error: "You cannot access this receipt." }, { status: 403 });
    if (!payment.receiptId) return NextResponse.json({ error: "No receipt was uploaded for this payment." }, { status: 404 });
    const receipt = await ChamaPaymentReceiptModel.findOne({ _id: payment.receiptId, paymentId: payment._id, groupId }).select("+data");
    if (!receipt) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
    const filename = receipt.filename.replace(/["\\\r\n]/g, "_");
    return new NextResponse(new Uint8Array(receipt.data as unknown as Uint8Array), {
      status: 200,
      headers: {
        "Content-Type": receipt.contentType,
        "Content-Length": String(receipt.size),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    console.error("Unable to load payment receipt", error);
    return NextResponse.json({ error: "Unable to access this receipt." }, { status: 500 });
  }
}
