type SmsSendResult = { sid?: string };

const getEnvOptional = (key: string) => process.env[key] || null;

export const canSendSms = () => {
  return Boolean(
    getEnvOptional("TWILIO_ACCOUNT_SID") &&
      getEnvOptional("TWILIO_AUTH_TOKEN") &&
      getEnvOptional("TWILIO_FROM")
  );
};

export const sendSms = async (to: string, body: string): Promise<SmsSendResult> => {
  const accountSid = getEnvOptional("TWILIO_ACCOUNT_SID");
  const authToken = getEnvOptional("TWILIO_AUTH_TOKEN");
  const from = getEnvOptional("TWILIO_FROM");

  if (!accountSid || !authToken || !from) {
    throw new Error("Missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM environment variables.");
  }

  const payload = new URLSearchParams({
    To: to,
    From: from,
    Body: body,
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload,
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Twilio SMS request failed.");
  }

  const data = (await response.json()) as { sid?: string };
  return { sid: data.sid };
};

