import nodemailer from 'nodemailer';
import { env } from '../config/env';

let transporter: nodemailer.Transporter | null = null;

export function getMailer() {
  if (transporter) return transporter;

  if (!env.MAIL_HOST || !env.MAIL_PORT || !env.MAIL_USER || !env.MAIL_PASS) {
    throw new Error('Mail transport is not configured');
  }

  transporter = nodemailer.createTransport({
    host: env.MAIL_HOST,
    port: env.MAIL_PORT,
    secure: env.MAIL_SECURE ?? env.MAIL_PORT === 465,
    auth: {
      user: env.MAIL_USER,
      pass: env.MAIL_PASS
    }
  });

  return transporter;
}

export function getMailFrom() {
  return env.MAIL_FROM ?? `HelpHub Support <${env.MAIL_USER}>`;
}


