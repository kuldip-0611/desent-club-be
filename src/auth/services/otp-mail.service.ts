import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../../mail/mail.service';
import { buildPasswordResetEmail } from '../templates/password-reset-email.template';
import { buildRegistrationOtpEmail } from '../templates/registration-otp-email.template';

@Injectable()
export class OtpMailService {
  private readonly logger = new Logger(OtpMailService.name);

  constructor(private readonly mailService: MailService) {}

  async sendEmailOtp(email: string, otp: string): Promise<void> {
    const { subject, text, html } = buildRegistrationOtpEmail(otp);
    try {
      await this.mailService.sendRaw({ to: email, subject, text, html });
      this.logger.log(`Registration OTP email sent to ${email}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown mailer error';
      this.logger.error(`Failed sending registration OTP email to ${email}: ${message}`);
      throw error;
    }
  }

  async sendPasswordResetEmail(email: string, resetLink: string): Promise<void> {
    const { subject, text, html } = buildPasswordResetEmail(resetLink);
    try {
      await this.mailService.sendRaw({ to: email, subject, text, html });
      this.logger.log(`Password reset email sent to ${email}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown mailer error';
      this.logger.error(`Failed sending password reset email to ${email}: ${message}`);
      throw error;
    }
  }

  sendPhoneOtp(phone: string, otp: string): Promise<void> {
    this.logger.log(`Mock SMS OTP sent to ${phone}: ${otp}`);
    return Promise.resolve();
  }
}
