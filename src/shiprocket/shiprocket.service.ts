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
      order_id?: number;
      shipment_id?: number;
      payload?: { order_id?: number; shipment_id?: number };
    }>('/orders/create/adhoc', body, { headers });

    // Shiprocket sometimes wraps in a payload object; handle both shapes
    const orderId = data?.order_id ?? data?.payload?.order_id;
    const shipmentId = data?.shipment_id ?? data?.payload?.shipment_id;

    this.logger.log(`[Shiprocket] createOrder raw → order_id=${orderId} shipment_id=${shipmentId}`);

    if (!orderId) throw new Error(`Shiprocket createOrder returned no order_id. Raw: ${JSON.stringify(data)}`);

    return {
      shiprocketOrderId: String(orderId),
      shiprocketShipmentId: shipmentId ? String(shipmentId) : String(orderId),
    };
  }

  // ─── Assign AWB (auto-assign best courier) ───────────────────────────────────

  async assignAWB(shipmentId: string, pickupPincode?: string, deliveryPincode?: string, isCod = false): Promise<{
    awbCode: string;
    courierName: string;
    trackingUrl: string;
  }> {
    const headers = await this.authHeader();

    // Step 1: get cheapest available courier via serviceability
    let courierId: number | undefined;
    if (pickupPincode && deliveryPincode) {
      try {
        const { data: svc } = await this.http.get<{
          data?: {
            shiprocket_recommended_courier_id?: number;
            available_courier_companies?: Array<{
              courier_company_id: number;
              courier_name: string;
              rate: number;
              cod: number;
            }>;
          };
        }>(
          `/courier/serviceability/?pickup_postcode=${pickupPincode}&delivery_postcode=${deliveryPincode}&weight=0.5&cod=${isCod ? 1 : 0}`,
          { headers },
        );
        const companies = svc?.data?.available_courier_companies ?? [];
        // Filter by COD capability if needed, then pick lowest rate
        const eligible = isCod ? companies.filter((c) => c.cod === 1) : companies;
        if (eligible.length > 0) {
          const cheapest = eligible.reduce((min, c) => (c.rate < min.rate ? c : min), eligible[0]);
          courierId = cheapest.courier_company_id;
          this.logger.log(`[Shiprocket] Cheapest courier: ${cheapest.courier_name} @ ₹${cheapest.rate} (id=${courierId})`);
        } else {
          courierId = svc?.data?.shiprocket_recommended_courier_id ?? undefined;
        }
      } catch {
        // fall through — assign without courier_id
      }
    }

    // Step 2: assign AWB (with courier_id if we got one)
    const body: Record<string, unknown> = { shipment_id: shipmentId };
    if (courierId) body['courier_id'] = courierId;

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
      body,
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

  // ─── Cancel Order ──────────────────────────────────────────────────────────────

  async cancelOrder(shiprocketOrderId: string): Promise<void> {
    const headers = await this.authHeader();
    await this.http.post(
      '/orders/cancel',
      { ids: [Number(shiprocketOrderId)] },
      { headers },
    );
    this.logger.log(`Shiprocket order ${shiprocketOrderId} cancelled`);
  }

  // ─── Return / Reverse Pickup ──────────────────────────────────────────────────

  /**
   * Creates a reverse-pickup (return) order in Shiprocket.
   * The courier will pick up the item from the customer and deliver to the warehouse.
   */
  async createReturnPickup(payload: {
    /** Unique ID for this return — e.g. "RET-<orderId>" */
    returnOrderId: string;
    orderDate: string;
    /** Customer (pickup) details */
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    customerCity: string;
    customerState: string;
    customerPincode: string;
    customerCountry: string;
    /** Items being returned */
    items: ShiprocketOrderItem[];
    subTotal: number;
  }): Promise<{ shiprocketOrderId: string; shipmentId: string }> {
    const headers = await this.authHeader();

    // Warehouse = ship-to for a return
    const warehouseName = this.config.get<string>('SHIPROCKET_WAREHOUSE_NAME') ?? 'Disent Club';
    const warehousePhone = this.config.get<string>('SHIPROCKET_WAREHOUSE_PHONE') ?? '9999999999';
    const warehouseAddress = this.config.get<string>('SHIPROCKET_WAREHOUSE_ADDRESS') ?? '';
    const warehouseCity = this.config.get<string>('SHIPROCKET_WAREHOUSE_CITY') ?? '';
    const warehouseState = this.config.get<string>('SHIPROCKET_WAREHOUSE_STATE') ?? '';
    const warehousePincode = this.config.get<string>('SHIPROCKET_WAREHOUSE_PINCODE') ?? '';
    const pickupLocation = this.config.get<string>('SHIPROCKET_PICKUP_LOCATION') ?? 'Primary';

    const body = {
      order_id: payload.returnOrderId,
      order_date: payload.orderDate,
      channel_id: '',
      pickup_customer_name: payload.customerName,
      pickup_last_name: '',
      pickup_address: payload.customerAddress,
      pickup_city: payload.customerCity,
      pickup_state: payload.customerState,
      pickup_country: payload.customerCountry,
      pickup_pincode: payload.customerPincode,
      pickup_email: '',
      pickup_phone: payload.customerPhone,
      shipping_customer_name: warehouseName,
      shipping_last_name: '',
      shipping_address: warehouseAddress,
      shipping_city: warehouseCity,
      shipping_state: warehouseState,
      shipping_country: 'India',
      shipping_pincode: warehousePincode,
      shipping_email: '',
      shipping_phone: warehousePhone,
      pickup_location: pickupLocation,
      order_items: payload.items.map((i) => ({
        name: i.name,
        sku: i.sku,
        units: i.units,
        selling_price: i.selling_price,
        discount: i.discount ?? '0',
        tax: i.tax ?? '0',
        hsn: i.hsn ?? '',
      })),
      payment_method: 'Prepaid',
      sub_total: payload.subTotal,
      length: 25,
      breadth: 20,
      height: 5,
      weight: 0.5,
    };

    const { data } = await this.http.post<{ order_id: number; shipment_id: number }>(
      '/orders/create/return',
      body,
      { headers },
    );

    return {
      shiprocketOrderId: String(data.order_id),
      shipmentId: String(data.shipment_id),
    };
  }

  // ─── Serviceability ───────────────────────────────────────────────────────────

  async checkServiceability(
    pincode: string,
    weight = 500,
  ): Promise<{
    cod: boolean;
    prepaid: boolean;
    couriers: Array<{ name: string; etd: string; cod: boolean }>;
  }> {
    const headers = await this.authHeader();
    const warehousePincode =
      this.config.get<string>('SHIPROCKET_WAREHOUSE_PINCODE') ?? '400001';

    const { data } = await this.http.post<{
      data?: {
        available_courier_companies?: Array<{
          courier_name: string;
          estimated_delivery_days: string;
          cod: number;
        }>;
      };
    }>(
      '/courier/serviceability/',
      {
        pickup_postcode: warehousePincode,
        delivery_postcode: pincode,
        weight,
        cod: 1,
      },
      { headers },
    );

    const companies = data?.data?.available_courier_companies ?? [];
    const couriers = companies.map((c) => ({
      name: c.courier_name,
      etd: c.estimated_delivery_days,
      cod: c.cod === 1,
    }));

    return {
      cod: couriers.some((c) => c.cod),
      prepaid: couriers.length > 0,
      couriers,
    };
  }

  // ─── Schedule Pickup ──────────────────────────────────────────────────────────

  /**
   * Schedules a courier pickup for the given shipment.
   * @param shipmentId  Shiprocket shipment_id (not order_id)
   * @param pickupDate  Date string "YYYY-MM-DD HH:MM" — defaults to next day 10:00 AM
   */
  async schedulePickup(shipmentId: string, pickupDate?: string): Promise<void> {
    const headers = await this.authHeader();

    // Default: next calendar day — Shiprocket accepts YYYY-MM-DD only
    if (!pickupDate) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const yyyy = tomorrow.getFullYear();
      const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const dd = String(tomorrow.getDate()).padStart(2, '0');
      pickupDate = `${yyyy}-${mm}-${dd}`;
    }

    await this.http.post(
      '/courier/generate/pickup',
      { shipment_id: [Number(shipmentId)], pickup_date: [pickupDate] },
      { headers },
    );

    this.logger.log(`[Shiprocket] Pickup scheduled for shipment ${shipmentId} on ${pickupDate}`);
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

  async getLabelUrl(shipmentId: string): Promise<string> {
    const headers = await this.authHeader();
    const { data } = await this.http.post<{ label_url?: string; response?: { label_url?: string } }>(
      '/courier/generate/label',
      { shipment_id: [Number(shipmentId)] },
      { headers },
    );
    const url = data?.label_url ?? data?.response?.label_url ?? '';
    if (!url) throw new Error('Label URL not available — ensure AWB is assigned and pickup is scheduled');
    return url;
  }
}
