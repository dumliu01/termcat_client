import { apiService } from '@/base/http/api';
import { logger, LOG_MODULE } from '@/base/logger/logger';

export interface PaymentMethod {
  code: string;
  name: string;
  provider: string;
  gateway: string;
}

export interface PaymentOrder {
  id: number;
  order_no: string;
  user_id: number;
  type: string;
  amount: number;
  currency: string;
  payment_method: string;
  status: string;
  gems: number;
  tier_days: number;
  tier_type: string;
  third_party_order_no?: string;
  third_party_trade_no?: string;
  paid_at?: string;
  expired_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateOrderResponse {
  order_no: string;
  payment_url: string;
  order: PaymentOrder;
}

/**
 * Payment Service
 */
class PaymentService {
  /**
   * Get available payment methods
   */
  async getAvailablePaymentMethods(): Promise<PaymentMethod[]> {
    try {
      const response = await apiService.getAvailablePaymentMethods();
      return response.methods || [];
    } catch (error) {
      logger.error(LOG_MODULE.HTTP, 'payment.methods.failed', 'Failed to get available payment methods', {
        module: LOG_MODULE.PAYMENT,
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Create payment order
   */
  async createOrder(
    type: string,
    amount: number,
    paymentMethod: string,
    tierId?: string,
    machineId?: string,
    machineName?: string
  ): Promise<CreateOrderResponse> {
    try {
      return await apiService.createPaymentOrder(type, amount, paymentMethod, tierId, machineId, machineName);
    } catch (error) {
      logger.error(LOG_MODULE.HTTP, 'payment.order.create_failed', 'Failed to create payment order', {
        module: LOG_MODULE.PAYMENT,
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get order details
   */
  async getOrder(orderNo: string): Promise<PaymentOrder> {
    try {
      return await apiService.getPaymentOrder(orderNo);
    } catch (error) {
      logger.error(LOG_MODULE.HTTP, 'payment.order.get_failed', 'Failed to get payment order', {
        module: LOG_MODULE.PAYMENT,
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get user order list
   */
  async getUserOrders(
    page: number = 1,
    pageSize: number = 20
  ): Promise<{
    orders: PaymentOrder[];
    total: number;
    page: number;
    page_size: number;
  }> {
    try {
      return await apiService.getUserPaymentOrders(page, pageSize);
    } catch (error) {
      logger.error(LOG_MODULE.HTTP, 'payment.order.list_failed', 'Failed to get user payment orders', {
        module: LOG_MODULE.PAYMENT,
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderNo: string): Promise<void> {
    try {
      await apiService.cancelPaymentOrder(orderNo);
    } catch (error) {
      logger.error(LOG_MODULE.HTTP, 'payment.order.cancel_failed', 'Failed to cancel payment order', {
        module: LOG_MODULE.PAYMENT,
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Mock pay (dev/test only) — directly marks order as paid via server
   */
  async mockPay(orderNo: string): Promise<void> {
    try {
      await apiService.mockPay(orderNo);
    } catch (error) {
      logger.error(LOG_MODULE.HTTP, 'payment.mock_pay.failed', 'Mock pay failed', {
        module: LOG_MODULE.PAYMENT,
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Open payment window
   */
  openPaymentWindow(paymentUrl: string): Window | null {
    const width = 800;
    const height = 600;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    const paymentWindow = window.open(
      paymentUrl,
      'payment',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    return paymentWindow;
  }

  /**
   * Poll order status
   */
  async pollOrderStatus(
    orderNo: string,
    onStatusChange: (order: PaymentOrder) => void,
    maxAttempts: number = 60,
    interval: number = 2000
  ): Promise<PaymentOrder> {
    let attempts = 0;

    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const order = await this.getOrder(orderNo);
          onStatusChange(order);

          if (order.status === 'paid') {
            resolve(order);
            return;
          }

          if (order.status === 'failed' || order.status === 'cancelled' || order.status === 'expired') {
            reject(new Error(`Order ${order.status}`));
            return;
          }

          attempts++;
          if (attempts >= maxAttempts) {
            reject(new Error('Polling timeout'));
            return;
          }

          setTimeout(poll, interval);
        } catch (error) {
          reject(error);
        }
      };

      poll();
    });
  }
}

export const paymentService = new PaymentService();
