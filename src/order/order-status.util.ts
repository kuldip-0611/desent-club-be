import { OrderStatus } from '@prisma/client';

export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

export const USER_CANCELLABLE: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING'];

export const canTransition = (from: OrderStatus, to: OrderStatus): boolean =>
  ORDER_STATUS_FLOW[from]?.includes(to) ?? false;

export const RETURN_WINDOW_DAYS = 3;
