import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const to = process.argv[2] ?? "nomibabaoo82@gmail.com";

const tx = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  tls: { rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false" },
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

try {
  const info = await tx.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: "ACCESS Ready SMTP test (district invite debug)",
    text: "If you see this, SMTP delivery to Gmail works from your dev machine.",
    html: "<p>If you see this, SMTP delivery to Gmail works from your dev machine.</p>",
  });
  console.log("sent:", info.messageId, info.response);
} catch (err) {
  console.error("send failed:", err);
  process.exit(1);
}
