import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaMemberModel from "@/lib/models/chama-member";
import transporter from "@/lib/nodemailer";
import { canSendSms, sendSms } from "@/lib/sms";

type NotificationKind = "scheduled" | "starting";

const getBaseUrl = () => {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.BETTER_AUTH_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000"
  );
};

const formatDateTime = (value: Date) => {
  const timeZone = process.env.DEFAULT_TIME_ZONE || "Africa/Nairobi";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(value);
  } catch {
    return value.toISOString();
  }
};

const buildEmail = (kind: NotificationKind, params: { groupName: string; title: string; when?: Date; meetingUri?: string | null }) => {
  const baseUrl = getBaseUrl();
  const subjectPrefix = params.groupName ? `${params.groupName}: ` : "";

  if (kind === "scheduled") {
    const whenText = params.when ? formatDateTime(params.when) : "soon";
    return {
      subject: `${subjectPrefix}Call scheduled - ${params.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0b1220;">
          <h2 style="margin: 0 0 12px;">Group call scheduled</h2>
          <p><strong>${params.title}</strong> is scheduled for <strong>${whenText}</strong>.</p>
          ${
            params.meetingUri
              ? `<p style="margin-top: 18px;">
                <a href="${params.meetingUri}" style="background:#1b5cff;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:600;">
                  Join meeting
                </a>
              </p>`
              : ""
          }
          <p style="font-size: 12px; color: #5a6882; margin-top: 16px;">
            Sent by <a href="${baseUrl}" style="color:#1b5cff;text-decoration:none;">ChamaPulse</a>.
          </p>
        </div>
      `,
    };
  }

  return {
    subject: `${subjectPrefix}Call starting - ${params.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0b1220;">
        <h2 style="margin: 0 0 12px;">Group call starting</h2>
        <p><strong>${params.title}</strong> is starting now.</p>
        ${
          params.meetingUri
            ? `<p style="margin-top: 18px;">
              <a href="${params.meetingUri}" style="background:#1b5cff;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:600;">
                Join meeting
              </a>
            </p>`
            : ""
        }
        <p style="font-size: 12px; color: #5a6882; margin-top: 16px;">
          Sent by <a href="${baseUrl}" style="color:#1b5cff;text-decoration:none;">ChamaPulse</a>.
        </p>
      </div>
    `,
  };
};

const buildSmsBody = (kind: NotificationKind, params: { groupName: string; title: string; when?: Date; meetingUri?: string | null }) => {
  const groupPrefix = params.groupName ? `${params.groupName}: ` : "";
  if (kind === "scheduled") {
    const whenText = params.when ? formatDateTime(params.when) : "soon";
    return `${groupPrefix}Call scheduled: ${params.title} at ${whenText}.${params.meetingUri ? ` Join: ${params.meetingUri}` : ""}`;
  }
  return `${groupPrefix}Call starting: ${params.title}.${params.meetingUri ? ` Join: ${params.meetingUri}` : ""}`;
};

export const notifyGroupCallMembers = async (input: {
  groupId: string;
  title: string;
  scheduledFor?: Date;
  meetingUri?: string | null;
  kind: NotificationKind;
}) => {
  const [group, members] = await Promise.all([
    ChamaGroupModel.findById(input.groupId).lean(),
    ChamaMemberModel.find({ groupId: input.groupId, status: { $ne: "rejected" } }).lean(),
  ]);

  const groupName = (group && typeof group === "object" && "name" in group ? String((group as { name?: string }).name || "") : "") || "ChamaPulse group";

  const recipients = members
    .map((m) => ({
      email: (m as { email?: string | null }).email || null,
      phone: (m as { phone?: string | null }).phone || null,
    }))
    .filter((m) => m.email || m.phone);

  const mail = buildEmail(input.kind, {
    groupName,
    title: input.title,
    when: input.scheduledFor,
    meetingUri: input.meetingUri,
  });

  const canSms = canSendSms();
  const smsBody = canSms
    ? buildSmsBody(input.kind, {
        groupName,
        title: input.title,
        when: input.scheduledFor,
        meetingUri: input.meetingUri,
      })
    : null;

  const results = await Promise.allSettled(
    recipients.map(async (recipient) => {
      let emailed = 0;
      let sms = 0;
      if (recipient.email && transporter) {
        try {
          await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: recipient.email,
            subject: mail.subject,
            html: mail.html,
          });
          emailed = 1;
        } catch {
          // Ignore per-recipient failures.
        }
      }

      if (recipient.phone && smsBody) {
        try {
          await sendSms(recipient.phone, smsBody);
          sms = 1;
        } catch {
          // Ignore per-recipient failures.
        }
      }

      return { emailed, sms };
    })
  );

  const totals = results.reduce(
    (acc, item) => {
      if (item.status === "fulfilled" && item.value) {
        acc.emailed += item.value.emailed;
        acc.sms += item.value.sms;
      }
      return acc;
    },
    { emailed: 0, sms: 0 }
  );

  return { ...totals, groupName, recipientCount: recipients.length };
};
