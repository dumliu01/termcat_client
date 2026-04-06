
import React, { useState, useEffect } from 'react';
import { X, Check, ShieldCheck, Smartphone, Building2, BadgeCheck, Loader2, Wallet, CreditCard as CardIcon, AlertCircle, FlaskConical } from 'lucide-react';
import { paymentService, PaymentMethod, PaymentOrder } from '@/core/commerce/paymentService';
import { commerceService } from '@/core/commerce/commerceService';
import { licenseService } from '@/core/license/licenseService';
import { logger, LOG_MODULE } from '@/base/logger/logger';
import { useI18n, useTranslation } from '@/base/i18n/I18nContext';

interface PaymentModalProps {
  show: boolean;
  type: 'gems' | 'vip_month' | 'vip_year' | 'agent_pack';
  amount: number;
  tierId?: string;
  onClose: () => void;
  onPaymentSuccess: (type: 'gems' | 'vip_month' | 'vip_year' | 'agent_pack', order: PaymentOrder) => void;
}

// Payment method icon mapping
const getPaymentIcon = (provider: string) => {
  switch (provider) {
    case 'wechat':
      return Smartphone;
    case 'alipay':
      return Wallet;
    case 'paypal':
      return CardIcon;
    default:
      return Wallet;
  }
};

// Payment method color mapping
const getPaymentColor = (provider: string) => {
  switch (provider) {
    case 'wechat':
      return 'text-emerald-500';
    case 'alipay':
      return 'text-sky-500';
    case 'paypal':
      return 'text-blue-600';
    default:
      return 'text-slate-400';
  }
};

// Get payment method display name
const getPaymentLabel = (method: PaymentMethod, language: 'zh' | 'en') => {
  // Use custom name if available
  if (method.name) {
    return method.name;
  }

  // Use translation keys
  const providerNames: Record<string, string> = {
    'wechat': language === 'zh' ? '微信支付' : 'WeChat Pay',
    'alipay': language === 'zh' ? '支付宝' : 'Alipay',
    'paypal': language === 'zh' ? 'PayPal' : 'PayPal'
  };

  return providerNames[method.provider] || method.provider;
};

export const PaymentModalNew: React.FC<PaymentModalProps> = ({
  show, type, amount: initialAmount, tierId, onClose, onPaymentSuccess
}) => {
  const { language } = useI18n();
  const t = useTranslation();
  const [step, setStep] = useState<'selection' | 'method' | 'processing' | 'success' | 'error'>(
    (type === 'gems' && !initialAmount) ? 'selection' : 'method'
  );
  const [amount, setAmount] = useState(initialAmount);
  const [selectedPayMethod, setSelectedPayMethod] = useState<string>('');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [mockPayEnabled, setMockPayEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMethods, setLoadingMethods] = useState(false);
  const [error, setError] = useState<string>('');
  const [orderNo, setOrderNo] = useState<string>('');
  const [completedOrder, setCompletedOrder] = useState<PaymentOrder | null>(null);
  const [paymentWindow, setPaymentWindow] = useState<Window | null>(null);

  useEffect(() => {
    if (show) {
      // Reset state to avoid stale data when reopening
      setStep((type === 'gems' && !initialAmount) ? 'selection' : 'method');
      setAmount(initialAmount);
      setError('');
      setSelectedPayMethod('');
      setOrderNo('');
      loadPaymentMethods();
    }
  }, [show, type]);

  const loadPaymentMethods = async () => {
    setLoadingMethods(true);
    try {
      const { methods, mockPayEnabled: mockEnabled } = await paymentService.getAvailablePaymentMethods();
      logger.debug(LOG_MODULE.PAYMENT, 'payment.modal.methods_loaded', 'Loaded payment methods', {
        module: LOG_MODULE.PAYMENT,
        methods_count: methods.length,
        mock_pay_enabled: mockEnabled,
      });
      setPaymentMethods(methods);
      setMockPayEnabled(mockEnabled);

      // Auto-select if only one payment method
      if (methods.length === 1) {
        setSelectedPayMethod(methods[0].code);
      }
    } catch (err) {
      logger.error(LOG_MODULE.PAYMENT, 'payment.modal.methods_failed', 'Failed to load payment methods', {
        module: LOG_MODULE.PAYMENT,
        error: 1,
        msg: err instanceof Error ? err.message : 'Unknown error',
      });
      setError(t.payment.loadMethodsFailed);
    } finally {
      setLoadingMethods(false);
    }
  };

  const handlePayment = async () => {
    if (!selectedPayMethod) {
      setError(t.payment.selectPaymentMethod);
      return;
    }

    setLoading(true);
    setError('');
    setStep('processing');

    // For agent_pack, include machine_id so server can auto-activate this device
    let machineId: string | undefined;
    let machineName: string | undefined;
    if (type === 'agent_pack') {
      machineId = await licenseService.getMachineId();
      machineName = await licenseService.getDeviceName();
    }

    try {
      if (selectedPayMethod === 'mock_pay') {
        // Mock payment: create order with any method, then mock-pay it directly
        const response = await paymentService.createOrder(type, amount, 'mock_pay', tierId, machineId, machineName);
        setOrderNo(response.order_no);
        await paymentService.mockPay(response.order_no);
        const paidOrder = await paymentService.getOrder(response.order_no);
        setCompletedOrder(paidOrder);
        setStep('success');
        onPaymentSuccess(type, paidOrder);
        return;
      }

      // Create order
      const response = await paymentService.createOrder(type, amount, selectedPayMethod, tierId, machineId, machineName);
      setOrderNo(response.order_no);

      // Open payment window
      const window = paymentService.openPaymentWindow(response.payment_url);
      setPaymentWindow(window);

      // Start polling order status
      const paidOrder = await paymentService.pollOrderStatus(
        response.order_no,
        (order) => {
          logger.debug(LOG_MODULE.PAYMENT, 'payment.order.status', 'Order status', {
            module: LOG_MODULE.PAYMENT,
            status: order.status,
          });
        },
        60, // Poll up to 60 times
        2000 // Poll every 2 seconds
      );

      // Payment success
      setCompletedOrder(paidOrder);
      setStep('success');
      onPaymentSuccess(type, paidOrder);

      // Close payment window
      if (window && !window.closed) {
        window.close();
      }
    } catch (err: any) {
      // Map server error codes to i18n messages
      const errorCode = err?.code;
      const LICENSE_ALREADY_OWNED = 2305;
      const errorMsg = errorCode === LICENSE_ALREADY_OWNED
        ? (t.payment as any).licenseAlreadyOwned || err.message
        : err.message || t.payment.paymentFailedRetry;

      logger.error(LOG_MODULE.PAYMENT, 'payment.order.failed', 'Payment failed', {
        module: LOG_MODULE.PAYMENT,
        error: 1,
        msg: errorMsg,
      });
      setError(errorMsg);
      setStep('error');

      // Close payment window
      if (paymentWindow && !paymentWindow.closed) {
        paymentWindow.close();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Close payment window
    if (paymentWindow && !paymentWindow.closed) {
      paymentWindow.close();
    }

    // Cancel order if order number exists and order is incomplete
    if (orderNo && step === 'processing') {
      paymentService.cancelOrder(orderNo).catch((e) => {
        logger.warn(LOG_MODULE.PAYMENT, 'payment.order.cancel_failed', 'Failed to cancel order', {
          module: LOG_MODULE.PAYMENT,
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      });
    }

    onClose();
  };

  if (!show) return null;

  // Get gem packages from commerce config
  const gemPackages = commerceService.getConfig()?.gem_packages ?? [];
  const bonePackages = gemPackages.map(pkg => ({
    amount: pkg.price,
    label: `${pkg.gems} ${t.payment.gems}`,
    bonus: false,
    gems: pkg.gems
  }));

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-300 p-4">
      <div className="w-full max-w-lg bg-[var(--bg-card)] rounded-[2.5rem] border border-[var(--border-color)] overflow-hidden shadow-2xl animate-in zoom-in-95" data-testid="payment-modal">
        {/* Header */}
        <div className="p-8 border-b border-[var(--border-color)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600/10 rounded-xl flex items-center justify-center text-indigo-500">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-[var(--text-main)]">
                {t.payment.title}
              </h3>
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] opacity-50">Powered by TermCat Pay</p>
            </div>
          </div>
          <button onClick={handleClose} className="text-[var(--text-dim)] hover:text-rose-500 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8">
          {step === 'selection' && (
            <div className="space-y-6">
              <h4 className="text-xs font-black uppercase tracking-widest text-indigo-400">{t.payment.selectAmount}</h4>
              <div className="grid grid-cols-2 gap-4">
                {bonePackages.map((pkg) => (
                  <button
                    key={pkg.amount}
                    onClick={() => { setAmount(pkg.amount); setStep('method'); }}
                    className="group p-6 rounded-2xl border border-[var(--border-color)] bg-black/5 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all text-left relative overflow-hidden"
                  >
                    {pkg.bonus && <div className="absolute top-0 right-0 px-3 py-1 bg-amber-500 text-white text-[8px] font-black uppercase tracking-tighter rounded-bl-xl">Bonus</div>}
                    <div className="text-xl font-black text-[var(--text-main)] mb-1">¥{pkg.amount}</div>
                    <div className="text-[10px] font-bold text-[var(--text-dim)] opacity-60 uppercase">{pkg.label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(step === 'method') && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-widest text-indigo-400">{t.payment.selectPaymentMethod}</h4>
                {type === 'gems' && (
                  <button onClick={() => setStep('selection')} className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] hover:text-indigo-400">
                    {t.payment.changeAmount}
                  </button>
                )}
              </div>

              {error && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-500" />
                  <span className="text-sm text-rose-500">{error}</span>
                </div>
              )}

              {loadingMethods ? (
                <div className="py-8 flex flex-col items-center justify-center">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
                  <p className="text-xs text-[var(--text-dim)]">{t.payment.loadingMethods}</p>
                </div>
              ) : paymentMethods.length === 0 ? (
                <div className="py-8 flex flex-col items-center justify-center">
                  <AlertCircle className="w-12 h-12 text-amber-500 mb-3" />
                  <p className="text-sm text-[var(--text-main)] mb-1">{t.payment.noMethodsAvailable}</p>
                  <p className="text-xs text-[var(--text-dim)]">{t.payment.contactAdmin}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {paymentMethods.map((method) => {
                    const Icon = getPaymentIcon(method.provider);
                    const color = getPaymentColor(method.provider);
                    const label = getPaymentLabel(method, language);

                    return (
                      <button
                        key={method.code}
                        onClick={() => setSelectedPayMethod(method.code)}
                        className={`w-full flex items-center justify-between p-5 rounded-2xl border transition-all ${selectedPayMethod === method.code ? 'border-indigo-500 bg-indigo-500/10' : 'border-[var(--border-color)] bg-black/5 hover:bg-black/10'}`}
                        data-testid={`pay-method-${method.code}`}
                      >
                        <div className="flex items-center gap-4">
                          <Icon className={`w-5 h-5 ${color}`} />
                          <div className="text-left">
                            <span className="text-sm font-black text-[var(--text-main)] block">{label}</span>
                            {method.gateway !== 'direct' && (
                              <span className="text-[10px] text-[var(--text-dim)] opacity-60">
                                {language === 'zh' ? t.payment.thirdPartyGateway : 'Third-party gateway'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedPayMethod === method.code ? 'border-indigo-500 bg-indigo-500' : 'border-[var(--border-color)]'}`}>
                          {selectedPayMethod === method.code && <Check className="w-3 h-3 text-white" />}
                        </div>
                      </button>
                    );
                  })}

                  {/* Mock payment option (dev/test only) */}
                  {mockPayEnabled && (
                    <button
                      onClick={() => setSelectedPayMethod('mock_pay')}
                      className={`w-full flex items-center justify-between p-5 rounded-2xl border transition-all ${selectedPayMethod === 'mock_pay' ? 'border-amber-500 bg-amber-500/10' : 'border-dashed border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10'}`}
                      data-testid="pay-method-mock_pay"
                    >
                      <div className="flex items-center gap-4">
                        <FlaskConical className="w-5 h-5 text-amber-500" />
                        <div className="text-left">
                          <span className="text-sm font-black text-amber-500 block">{language === 'zh' ? '测试支付' : 'Mock Payment'}</span>
                          <span className="text-[10px] text-amber-500/60">{language === 'zh' ? '跳过真实支付，直接完成订单 (仅测试)' : 'Skip real payment, complete order directly (test only)'}</span>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedPayMethod === 'mock_pay' ? 'border-amber-500 bg-amber-500' : 'border-amber-500/30'}`}>
                        {selectedPayMethod === 'mock_pay' && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </button>
                  )}
                </div>
              )}

              <div className="pt-6">
                <button
                  disabled={!selectedPayMethod || loading || paymentMethods.length === 0}
                  onClick={handlePayment}
                  className="w-full py-4 bg-indigo-600 text-white text-xs font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-50 active:scale-95 transition-all"
                  data-testid="payment-confirm-btn"
                >
                {t.payment.confirmAndPay} ¥{amount}
                </button>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-6" />
              <h4 className="text-lg font-black text-[var(--text-main)] mb-2">{t.payment.connectingGateway}</h4>
              <p className="text-xs text-[var(--text-dim)] opacity-60 px-10">{t.payment.doNotCloseTab}</p>
            </div>
          )}

          {step === 'success' && (
            <div className="py-12 flex flex-col items-center justify-center text-center animate-in zoom-in-90" data-testid="payment-success">
              <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500 mb-6 shadow-2xl shadow-emerald-500/20">
                <BadgeCheck className="w-10 h-10" />
              </div>
              <h4 className="text-2xl font-black text-[var(--text-main)] mb-2">{t.payment.paymentSuccess}</h4>
              <p className="text-xs text-[var(--text-dim)] opacity-60 mb-10 px-12">
                {type === 'gems'
                  ? (language === 'zh' ? t.payment.gemsCredited.replace('{gems}', String(completedOrder?.gems ?? amount * 100)) : `Credited ${completedOrder?.gems ?? amount * 100} Gems to your vault.`)
                  : (language === 'zh' ? t.payment.vipUnlocked : `${completedOrder?.tier_type || 'VIP'} Privileges unlocked instantly.`)}
              </p>
              <button
                onClick={handleClose}
                className="w-full py-4 bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-main)] text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-black/5 transition-all"
                data-testid="payment-close-btn"
              >
                {language === 'zh' ? t.payment.returnToSystem : 'Return to Fleet'}
              </button>
            </div>
          )}

          {step === 'error' && (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center text-rose-500 mb-6">
                <AlertCircle className="w-10 h-10" />
              </div>
              <h4 className="text-2xl font-black text-[var(--text-main)] mb-2">{t.payment.paymentFailed}</h4>
              <p className="text-xs text-[var(--text-dim)] opacity-60 mb-10 px-12">{error}</p>
              <div className="w-full space-y-3">
                <button
                  onClick={() => { setStep('method'); setError(''); }}
                  className="w-full py-4 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-indigo-500 transition-all"
                >
                  {t.payment.tryAgain}
                </button>
                <button
                  onClick={handleClose}
                  className="w-full py-4 bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-main)] text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-black/5 transition-all"
                >
                  {t.payment.cancel}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
