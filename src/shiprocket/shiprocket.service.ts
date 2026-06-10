import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

const SR_BASE = 'https://apiv2.shiprocket.in/v1/external';
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000; // 23 hours (Shiprocket tokens last 24h)

export interface ShiprocketOrderItem {
  name: string;
  sku: string;
  units: number;
  selling_price: string;
  discount?: string;
  tax?: string;
  hsn?: string;
}

export interface CreateShiprocketOrderPayload {
  orderId: string;          // our internal order id (used as order_id)
  orderDate: string;        // ISO date string
  billingCustomerName: string;
  billingPhone: string;
  billingAddress: string;
  billingCity: string;
  billingState: string;
  billingPincode: string;
  billingCountry: string;
  shippingCustomerName: string;
  shippingPhone: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;
  shippingPincode: string;
  shippingCountry: string;
  paymentMethod: 'Prepaid' | 'COD';
  subTotal: number;
  length: number;
  breadth: number;
  height: number;
  weight: number;
  items: ShiprocketOrderItem[];
}

@Injectable()
export class ShiprocketService implements OnModuleInit {
  private readonly logger = new Logger(ShiprocketService.name);
  private readonly http: AxiosInstance;
  private token: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({ baseURL: SR_BASE });
  }

  onModuleInit() {
    // warm up token on boot (fire-and-forget, failures are fine)
    this.getToken().catch(() => {
      this.logger.warn('Shiprocket token warm-up failed — will retry on first use');
    });
  }

  // ─── Auth ───────────────────────────────────────────────────────────────────

  async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) {
      return this.token;
    }

    const email = this.config.get<string>('SHIPROCKET_EMAIL');
    const password = this.config.get<string>('SHIPROCKET_PASSWORD');

    const { data } = await this.http.post<{ token: string }>('/auth/login', {
      email,
      password,
    });

    this.token = data.token;
    this.tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
    this.logger.log('Shiprocket token refreshed');
    return this.token;
  }

  private async authHeader() {
    const token = await this.getToken();
    return { Authorization: `Bearer ${token}` };
  }

  // ─── Create Order ────────────────────────────────────────────────────────────

  async createOrder(payload: CreateShiprocketOrderPayload): Promise<{
    shiprocketOrderId: string;
    shiprocketShipmentId: string;
  }> {
    const headers = await this.authHeader();
    const pickupLocation = this.config.get<string>('SHIPROCKET_PICKUP_LOCATION') ?? 'Primary';

    const body = {
      order_id: payload.orderId,
      order_date: payload.orderDate,
      pickup_location: pickupLocation,

      billing_customer_name: payload.billingCustomerName,
      billing_last_name: '',
      billing_address: payload.billingAddress,
      billing_city: payload.billingCity,
      billing_pincode: payload.billingPincode,
      billing_state: payload.billingState,
      billing_country: payload.billingCountry,
      billing_email: '',
      billing_phone: payload.billingPhone,

      shipping_is_billing: false,
      shipping_customer_name: payload.shippingCustomerName,
      shipping_last_name: '',
      shipping_address: payload.shippingAddress,
      shipping_city: payload.shippingCity,
      shipping_pincode: payload.shippingPincode,
      shipping_country: payload.shippingCountry,
      shipping_state: payload.shippingState,
      shipping_email: '',
      shipping_phone: payload.shippingPhone,

      order_items: payload.items.map((i) => ({
        name: i.name,
        sku: i.sku,
        units: i.units,
        selling_price: i.selling_price,
        discount: i.discount ?? '0',
        tax: i.tax ?? '0',
        hsn: i.hsn ?? '',
      })),

      payment_method: payload.paymentMethod,
      shipping_charges: 0,
      giftwrap_charges: 0,
      transaction_charges: 0,
      total_discount: 0,
      sub_total: payload.subTotal,

      length: payload.length,
      breadth: payload.breadth,
      height: payload.height,
      weight: payload.weight,
    };

    const { data } = await this.http.post<{
      order_id: number;
      shipment_id: number;
    }>('/orders/create/adhoc', body, { headers });

    return {
      shiprocketOrderId: String(data.order_id),
      shiprocketShipmentId: String(data.shipment_id),
    };
  }

  // ─── Assign AWB (auto-assign best courier) ───────────────────────────────────

  async assignAWB(shipmentId: string): Promise<{
    awbCode: string;
    courierName: string;
    trackingUrl: string;
  }> {
    const headers = await this.authHeader();

    const { data } = await this.http.post<{
      awb_assign_status: number;
      response: {
        data: {
          awb_code: string;
          courier_name: string;
          applied_weight: number;
        };
      };
    }>(
      '/courier/assign/awb',
      { shipment_id: shipmentId },
      { headers },
    );

    const awb = data?.response?.data?.awb_code ?? '';
    const courier = data?.response?.data?.courier_name ?? '';

    return {
      awbCode: awb,
      courierName: courier,
      trackingUrl: awb
        ? `https://shiprocket.co/tracking/${awb}`
        : '',
    };
  }

  // ─── Track by AWB ─────────────────────────────────────────────────────────────

  async trackByAwb(awbCode: string): Promise<Record<string, unknown>> {
    const headers = await this.authHeader();
    const { data } = await this.http.get<Record<string, unknown>>(
      `/courier/track/awb/${awbCode}`,
      { headers },
    );
    return data;
  }

  // ─── Generate Manifest & Label (optional helpers) ─────────────────────────────

  async generateManifest(shiprocketOrderId: string): Promise<void> {
    const headers = await this.authHeader();
    await this.http.post(
      '/manifests/generate',
      { order_ids: [shiprocketOrderId] },
      { headers },
    );
  }

  async generateLabel(shipmentId: string): Promise<void> {
    const headers = await this.authHeader();
    await this.http.post(
      '/courier/generate/label',
      { shipment_id: [shipmentId] },
      { headers },
    );
  }
}
