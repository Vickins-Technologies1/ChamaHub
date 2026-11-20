import nodemailer from 'nodemailer';

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_HOST = process.env.EMAIL_HOST;
const configuredPort = Number(process.env.EMAIL_PORT);
const EMAIL_PORT = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 587;
const EMAIL_SECURE = process.env.EMAIL_SECURE === "true" || (process.env.EMAIL_SECURE !== "false" && EMAIL_PORT === 465);

const transporter =
  EMAIL_HOST
    ? nodemailer.createTransport({
        host: EMAIL_HOST,
        port: EMAIL_PORT,
        secure: EMAIL_SECURE,
        ...(EMAIL_USER && EMAIL_PASS ? { auth: { user: EMAIL_USER, pass: EMAIL_PASS } } : {}),
      })
    : EMAIL_USER && EMAIL_PASS
      ? nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: EMAIL_USER,
          pass: EMAIL_PASS,
        },
      })
      : null;

export default transporter;
