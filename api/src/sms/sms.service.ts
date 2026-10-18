import { Global, Injectable, Logger, Module, ServiceUnavailableException } from '@nestjs/common';

/**
 * Text messages (OTP codes, SOS alerts). Pick a vendor with SMS_PROVIDER:
 *   console  - prints to the server log (development only)
 *   msg91    - MSG91 Flow API (India, DLT-registered templates). Needs MSG91_AUTH_KEY,
 *              MSG91_OTP_TEMPLATE_ID and MSG91_ALERT_TEMPLATE_ID. Template variables: ##otp## / ##message##
 *   twilio   - Twilio Messages API. Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
 *
 * Vendor request formats change: check their current docs before go-live and adjust `send` below.
 */
export type SmsKind = 'otp' | 'alert';

@Injectable()
export class SmsService {
  private readonly log = new Logger('Sms');
  readonly provider = (process.env.SMS_PROVIDER ?? 'console').toLowerCase();

  async send(to: string, kind: SmsKind, text: string, vars: Record<string, string> = {}): Promise<void> {
    try {
      if (this.provider === 'msg91') return await this.msg91(to, kind, vars);
      if (this.provider === 'twilio') return await this.twilio(to, text);
    } catch (e: any) {
      this.log.error(`SMS via ${this.provider} failed: ${e.message}`);
      throw new ServiceUnavailableException('Could not send the SMS right now. Please try again in a minute.');
    }
    // console: never print OTP codes in production logs
    const shown = kind === 'otp' && process.env.NODE_ENV === 'production' ? text.replace(/\d{6}/, '******') : text;
    this.log.log(`[console SMS] to ${to.slice(0, 5)}*****${to.slice(-2)}: ${shown}`);
  }

  private async msg91(to: string, kind: SmsKind, vars: Record<string, string>) {
    const template = kind === 'otp' ? process.env.MSG91_OTP_TEMPLATE_ID : process.env.MSG91_ALERT_TEMPLATE_ID;
    const res = await fetch('https://control.msg91.com/api/v5/flow', {
      method: 'POST',
      headers: { authkey: process.env.MSG91_AUTH_KEY ?? '', 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ template_id: template, short_url: '0', recipients: [{ mobiles: to.replace(/^\+/, ''), ...vars }] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  private async twilio(to: string, text: string) {
    const sid = process.env.TWILIO_ACCOUNT_SID ?? '';
    const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN ?? ''}`).toString('base64');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM ?? '', Body: text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }
}

@Global()
@Module({ providers: [SmsService], exports: [SmsService] })
export class SmsModule {}
