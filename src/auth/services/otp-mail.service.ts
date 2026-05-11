import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { buildRegistrationOtpEmail } from '../templates/registration-otp-email.template';

@Injectable()
export class OtpMailService {
  private readonly logger = new Logger(OtpMailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

  async sendEmailOtp(email: string, otp: string): Promise<void> {
    const { subject, text, html } = buildRegistrationOtpEmail(otp);
    const host = this.configService.get<string>('SMTP_HOST')?.trim();
    const user = this.configService.get<string>('SMTP_USER')?.trim();
    const from =
      this.configService.get<string>('MAIL_FROM')?.trim() ||
      user ||
      'no-reply@desent.club';

    if (!host) {
      this.logger.log(
        `Email OTP for ${email} (configure SMTP_HOST to send real mail)\n${text}`,
      );
      return;
    }

    try {
      const transport = this.getTransporter();
      await transport.sendMail({ from, to: email, subject, text, html });
      this.logger.log(`Registration OTP email sent to ${email}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown mailer error';
      this.logger.error(`Failed sending registration OTP email to ${email}: ${message}`);
      throw error;
    }
  }

  sendPhoneOtp(phone: string, otp: string): Promise<void> {
    this.logger.log(`Mock SMS OTP sent to ${phone}: ${otp}`);
    return Promise.resolve();
  }

  private getTransporter(): nodemailer.Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    const host = this.configService.getOrThrow<string>('SMTP_HOST').trim();
    const port = Number(this.configService.get<string>('SMTP_PORT') ?? 587);
    const secure =
      this.configService.get<string>('SMTP_SECURE') === 'true' || port === 465;
    const user = this.configService.get<string>('SMTP_USER')?.trim();
    const passRaw = this.configService.get<string>('SMTP_PASS')?.trim();
    const pass = passRaw ? passRaw.replace(/\s+/g, '') : undefined;

    const options: SMTPTransport.Options = {
      host,
      port,
      secure,
    };

    if (user && pass) {
      options.auth = { user, pass };
    }

    this.transporter = nodemailer.createTransport(options);
    return this.transporter;
  }
}
