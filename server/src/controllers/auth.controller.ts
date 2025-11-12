import type { Request, Response } from 'express';
import { z } from 'zod';
import { firebaseAuth } from '../config/firebase';
import { env } from '../config/env';
import { getMailer, getMailFrom } from '../services/mailer';

const forgotSchema = z.object({ email: z.string().email() });

export async function forgotPasswordHandler(req: Request, res: Response) {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid email.' });

  const { email } = parsed.data;

  try {
    console.log('[FORGOT PASSWORD]', email);
    const actionLink = env.CLIENT_URL
      ? await firebaseAuth.generatePasswordResetLink(email, {
          handleCodeInApp: false,
          url: `${env.CLIENT_URL}/auth`,
        })
      : await firebaseAuth.generatePasswordResetLink(email);

    const transporter = getMailer();
    const info = await transporter.sendMail({
      from: getMailFrom(),
      to: email,
      subject: 'Reset your HelpHub password',
      html: `
        <p>Hi,</p>
        <p>We received a request to reset your HelpHub password.</p>
        <p><a href="${actionLink}" style="display:inline-block;padding:12px 20px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;">Reset password</a></p>
        <p>If you didn’t request this, you can ignore the email.</p>
      `,
    });

    console.log('✅ Password reset email sent:', info.messageId);
    res.json({ message: 'If the email is registered, you’ll get reset instructions soon.' });

  } catch (error: any) {
    console.error('❌ Forgot password error:', error.message);
    res.status(500).json({ message: 'Something went wrong while sending the reset email.' });
  }
}
