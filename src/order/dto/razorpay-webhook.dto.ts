// Raw Razorpay webhook event shape (we only extract what we need)
export interface RazorpayWebhookEvent {
  event: string;
  payload: {
    payment?: {
      entity: {
        id: string;            // pay_xxx
        order_id: string;      // order_xxx
        status: string;        // captured | failed | refunded
        amount: number;        // paise
        error_description?: string;
      };
    };
    refund?: {
      entity: {
        id: string;            // rfnd_xxx
        payment_id: string;
        amount: number;
      };
    };
    order?: {
      entity: {
        id: string;            // order_xxx
        status: string;
      };
    };
  };
}
