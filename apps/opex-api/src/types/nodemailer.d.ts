// The small part of nodemailer OPEX uses (the package ships no types).
declare module "nodemailer" {
  export type SendMailOptions = { from: string; to: string; subject: string; text: string; html?: string; replyTo?: string; messageId?: string; inReplyTo?: string; references?: string[]; headers?: Record<string, string> };
  export type Transporter = { sendMail(o: SendMailOptions): Promise<{ messageId: string }> };
  export function createTransport(url: string): Transporter;
  const nodemailer: { createTransport: typeof createTransport };
  export default nodemailer;
}
