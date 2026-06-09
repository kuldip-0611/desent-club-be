import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app: admin.app.App | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    const rawPrivateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY');

    if (!projectId || !clientEmail || !rawPrivateKey) {
      this.logger.warn(
        'Firebase Admin credentials not configured — push notifications disabled. ' +
          'Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in .env',
      );
      return;
    }

    if (admin.apps.length > 0) {
      this.app = admin.apps[0]!;
      return;
    }

    const privateKey = rawPrivateKey.replace(/\\n/g, '\n');

    this.app = admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });

    this.logger.log('Firebase Admin initialised');
  }

  /**
   * Send a push notification to a single FCM registration token.
   * Silently ignores if Firebase Admin is not configured.
   */
  async sendToToken(
    token: string,
    notification: { title: string; body: string },
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.app) return;

    try {
      await admin.messaging(this.app).send({
        token,
        notification,
        data,
        webpush: {
          notification: {
            ...notification,
            icon: '/icon.png',
            badge: '/icon.png',
            click_action: '/',
          },
        },
      });
      this.logger.log(`Push sent to token …${token.slice(-8)}`);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      // Token expired / unregistered — caller should clean it up
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        this.logger.warn(`Invalid FCM token …${token.slice(-8)}: ${code}`);
      } else {
        this.logger.error(`Failed to send push: ${String(err)}`);
      }
    }
  }

  /**
   * Send to multiple tokens (fan-out).
   */
  async sendToTokens(
    tokens: string[],
    notification: { title: string; body: string },
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.app || tokens.length === 0) return;

    const chunks: string[][] = [];
    for (let i = 0; i < tokens.length; i += 500) {
      chunks.push(tokens.slice(i, i + 500));
    }

    for (const chunk of chunks) {
      const result = await admin.messaging(this.app).sendEachForMulticast({
        tokens: chunk,
        notification,
        data,
        webpush: {
          notification: {
            ...notification,
            icon: '/icon.png',
            badge: '/icon.png',
            click_action: '/',
          },
        },
      });
      this.logger.log(
        `Push multicast: ${result.successCount} sent, ${result.failureCount} failed`,
      );
    }
  }
}
