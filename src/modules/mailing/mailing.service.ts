import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { SendMailDto } from './dtos/send-mail.dto';

interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';

// Render (and most PaaS free/starter tiers) block outbound SMTP ports (465/587), which made
// direct Gmail SMTP time out silently in production even though it worked fine locally. SendGrid's
// API runs over plain HTTPS (443), which isn't blocked. (Previously used Resend; swapped after its
// API key started getting rejected as invalid in production.)
@Injectable()
export class MailingService {
  private readonly logger = new Logger(MailingService.name);
  private readonly fromRaw =
    process.env.SENDGRID_FROM_EMAIL ||
    process.env.RESEND_FROM_EMAIL ||
    'RoyalGames <noreply@royalgames.lat>';

  // SendGrid wants { email, name } instead of the "Name <email>" string format Resend used.
  private get from(): { email: string; name?: string } {
    const match = this.fromRaw.match(/^(.*)<(.+)>$/);
    if (match) {
      return { name: match[1].trim() || undefined, email: match[2].trim() };
    }
    return { email: this.fromRaw.trim() };
  }

  async sendMail(sendMailDto: SendMailDto & { attachments?: MailAttachment[] }): Promise<any> {
    try {
      const payload: Record<string, unknown> = {
        personalizations: [{ to: [{ email: sendMailDto.to }] }],
        from: this.from,
        subject: sendMailDto.subject,
        content: [{ type: 'text/html', value: sendMailDto.html }],
      };
      if (sendMailDto.attachments?.length) {
        payload.attachments = sendMailDto.attachments.map((att) => ({
          filename: att.filename,
          content: att.content.toString('base64'),
          type: att.contentType,
          disposition: 'attachment',
        }));
      }

      const response = await axios.post(SENDGRID_API_URL, payload, {
        headers: {
          Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      const messageId = response.headers['x-message-id'];
      this.logger.log(`Email sent: ${messageId}`);
      return {
        success: true,
        message: 'Email sent successfully',
        messageId,
      };
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? JSON.stringify(error.response?.data) || error.message
        : (error as Error).message || String(error);
      this.logger.error(`Failed to send email: ${msg}`);
      return {
        success: false,
        message: 'Failed to send email',
        error: msg,
      };
    }
  }

  async sendWelcomeEmail(email: string, nick: string): Promise<any> {
    const html = `
      <h1>Welcome to Royal Games, ${nick}!</h1>
      <p>Thank you for joining our gaming platform.</p>
      <p>Start playing and earning chips today!</p>
    `;

    return this.sendMail({
      to: email,
      subject: 'Welcome to Royal Games',
      html,
    });
  }

  async sendPaymentConfirmationEmail(
    email: string,
    chips: number,
    amount: string,
  ): Promise<any> {
    const html = `
      <h1>Payment Confirmed</h1>
      <p>Your payment has been processed successfully.</p>
      <p><strong>Chips Purchased:</strong> ${chips}</p>
      <p><strong>Amount:</strong> $${amount}</p>
      <p>Your chips will be added to your account shortly.</p>
    `;

    return this.sendMail({
      to: email,
      subject: 'Payment Confirmation',
      html,
    });
  }
}
