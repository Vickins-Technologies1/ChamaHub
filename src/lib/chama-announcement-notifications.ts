import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaMemberModel from "@/lib/models/chama-member";
import transporter from "@/lib/nodemailer";
import { canSendSms, sendSms } from "@/lib/sms";

type DeliveryChannel = "in-app" | "email" | "sms";

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] || character);

export const deliverAnnouncement = async (input: {
  groupId: string;
  title: string;
  message: string;
  deliveryChannels: DeliveryChannel[];
}) => {
  const channels = new Set(input.deliveryChannels);
  if (!channels.has("email") && !channels.has("sms")) {
    return { email: 0, sms: 0 };
  }

  const [groupResult, members] = await Promise.all([
    ChamaGroupModel.findById(input.groupId).lean(),
    ChamaMemberModel.find({ groupId: input.groupId, status: "active" }).lean(),
  ]);
  const group = Array.isArray(groupResult) ? groupResult[0] : groupResult;
  const groupName = group?.name || "your ChamaHub group";
  const safeTitle = escapeHtml(input.title);
  const safeMessage = escapeHtml(input.message).replace(/\n/g, "<br />");
  const canUseSms = channels.has("sms") && canSendSms();

  const outcomes = await Promise.allSettled(
    members.map(async (member) => {
      let email = 0;
      let sms = 0;

      if (channels.has("email") && member.email && transporter) {
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: member.email,
          subject: `${groupName}: ${input.title}`,
          html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0b1220"><h2>${safeTitle}</h2><p>${safeMessage}</p><p style="font-size:12px;color:#5a6882">Sent by ChamaHub for ${escapeHtml(groupName)}.</p></div>`,
        });
        email = 1;
      }

      if (canUseSms && member.phone) {
        await sendSms(member.phone, `${groupName}: ${input.title}. ${input.message}`.slice(0, 1500));
        sms = 1;
      }
      return { email, sms };
    })
  );

  return outcomes.reduce(
    (total, outcome) => {
      if (outcome.status === "fulfilled") {
        total.email += outcome.value.email;
        total.sms += outcome.value.sms;
      }
      return total;
    },
    { email: 0, sms: 0 }
  );
};
