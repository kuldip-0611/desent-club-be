import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleIdentity {
  providerId: string;
  email: string;
  name: string;
}

@Injectable()
export class MockGoogleService {
  private readonly oauthClient: OAuth2Client;
  private readonly googleClientId: string;

  constructor(private readonly configService: ConfigService) {
    this.googleClientId =
      this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID');
    this.oauthClient = new OAuth2Client(this.googleClientId);
  }

  async verifyGoogleToken(token: string): Promise<GoogleIdentity> {
    if (token.startsWith('mock:')) {
      return this.verifyMockToken(token);
    }

    const ticket = await this.oauthClient.verifyIdToken({
      idToken: token,
      audience: this.googleClientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || !payload.name) {
      throw new UnauthorizedException('Invalid Google token payload');
    }

    return {
      providerId: payload.sub,
      email: payload.email,
      name: payload.name,
    };
  }

  private verifyMockToken(token: string): GoogleIdentity {
    const parts = token.split(':');
    if (parts.length < 4) {
      throw new UnauthorizedException('Malformed Google token');
    }

    const [, providerId, email, ...nameParts] = parts;
    const name = nameParts.join(':');
    if (!providerId || !email || !name) {
      throw new UnauthorizedException('Malformed Google token');
    }

    return { providerId, email, name };
  }
}
