/**
 * 广告调度管理 Hook
 *
 * 职责：
 * - 监听广告触发事件（面板打开、空闲、对话间隔、会话建立）
 * - 按规则优先级和频率控制决定是否展示
 * - 生成 AdMessage 注入消息流
 * - 管理广告开关状态（VIP/SVIP 用户可关闭）
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { User, TierType } from '@/utils/types';
import { AIOpsMessage } from '@/features/terminal/types';
import { AdMessage, AdTriggerType } from '@/core/ad/types';
import { adService } from '@/core/ad/adService';
import { commerceService } from '@/core/commerce/commerceService';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.UI });

// ==================== 模块级持久存储 ====================
// 组件重挂载时 useState 会重置，用模块级变量保持广告消息跨生命周期存活
let _persistedAdMessages: AdMessage[] = [];
let _rulesLoaded = false;
let _loading = false;

interface UseAdManagerOptions {
  user: User | null;
  messages: AIOpsMessage[];
  isPanelVisible: boolean;
  sessionId?: string;
}

interface UseAdManagerReturn {
  /** 当前待展示的广告消息列表 */
  adMessages: AdMessage[];
  /** 广告是否正在展示 */
  shouldShowAd: boolean;
  /** 用户是否有权关闭广告 */
  canDisableAd: boolean;
  /** 广告开关当前状态 */
  adEnabled: boolean;
  /** 切换广告开关 */
  toggleAd: () => void;
  /** 游客是否应该禁止关闭面板 */
  guestCannotClose: boolean;
  /** 游客是否应该禁止使用 AI 功能 */
  guestCannotUseAI: boolean;
}

export function useAdManager({
  user,
  messages,
  isPanelVisible,
  sessionId,
}: UseAdManagerOptions): UseAdManagerReturn {
  // 从模块级变量恢复（组件重挂载时不丢失）
  const [adMessages, setAdMessages] = useState<AdMessage[]>(_persistedAdMessages);
  const [adEnabled, setAdEnabled] = useState(() => {
    return localStorage.getItem('termcat_ad_disabled') !== 'true';
  });

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMessageCountRef = useRef(0);
  const prevSessionIdRef = useRef<string | undefined>(undefined);
  const prevPanelVisibleRef = useRef(false);

  // 用户等级
  const tier: TierType | 'guest' = user?.tier || 'guest';
  const isGuest = user === null;

  // 权限判定
  const canDisableAd = commerceService.isAdFree() || tier === 'Pro' || tier === 'Adv';
  const shouldShowAd = adEnabled || !canDisableAd;
  const guestCannotClose = isGuest;
  const guestCannotUseAI = isGuest;

  // 用 ref 保存最新值，避免 effect 因闭包过期重建
  const shouldShowAdRef = useRef(shouldShowAd);
  shouldShowAdRef.current = shouldShowAd;
  const tierRef = useRef(tier);
  tierRef.current = tier;
  const isGuestRef = useRef(isGuest);
  isGuestRef.current = isGuest;
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // 注入广告消息（稳定引用，读 ref 而非闭包值）
  const injectAd = useCallback(async (triggerType: AdTriggerType) => {
    if (!shouldShowAdRef.current) return;

    const currentTier = tierRef.current;
    const currentIsGuest = isGuestRef.current;

    const matchingRules = adService.getMatchingRules(
      triggerType,
      currentIsGuest ? 'guest' : currentTier,
    );
    if (matchingRules.length === 0) return;

    const rule = matchingRules[0];
    const context = {
      tier: currentIsGuest ? ('guest' as const) : currentTier,
      language: 'zh' as const,
      triggerType,
      sessionId: sessionIdRef.current,
    };

    // 第三方平台：从平台 API 拉取；自建平台：使用规则自带 message
    let content = rule.content;
    if (rule.platform !== 'self_hosted') {
      const platformContents = await adService.fetchAdContent(rule.platform, context);
      if (platformContents.length > 0) {
        content = platformContents[0];
      } else if (!content.message) {
        return;
      }
    } else if (!content.message) {
      return;
    }

    const adMessage: AdMessage = {
      id: `ad_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ruleId: rule.id,
      platform: rule.platform,
      content,
      timestamp: Date.now(),
    };

    setAdMessages((prev) => {
      const next = [...prev, adMessage];
      _persistedAdMessages = next; // 持久化到模块级变量
      return next;
    });
    adService.reportImpression(content.adId, rule.platform, rule.id);
    log.info('ad.impression', 'Ad displayed', {
      ruleId: rule.id,
      platform: rule.platform,
      trigger: triggerType,
    });
  }, []); // 无外部依赖，通过 ref 读取最新值

  // 拉取规则（稳定引用，使用模块级标志防止重复加载）
  const loadRules = useCallback(async () => {
    if (_loading || _rulesLoaded) return;
    _loading = true;
    try {
      await adService.fetchRules();
      // fetchRules 内部已调用 initPlatforms，这里不再重复调用
      _rulesLoaded = true;
    } catch {
      // 静默失败
    } finally {
      _loading = false;
    }
  }, []);

  // 触发器：面板打开（仅依赖 isPanelVisible）
  useEffect(() => {
    if (isPanelVisible && !prevPanelVisibleRef.current) {
      // 已有持久化广告时跳过（组件重挂载场景）
      if (_persistedAdMessages.length > 0) {
        prevPanelVisibleRef.current = isPanelVisible;
        return;
      }
      loadRules().then(() => {
        injectAd('panel_open');
      });
    }
    prevPanelVisibleRef.current = isPanelVisible;
  }, [isPanelVisible, loadRules, injectAd]);

  // 触发器：新会话
  useEffect(() => {
    if (sessionId && sessionId !== prevSessionIdRef.current && prevSessionIdRef.current !== undefined) {
      adService.resetSessionCounts();
      injectAd('session_start');
    }
    prevSessionIdRef.current = sessionId;
  }, [sessionId, injectAd]);

  // 触发器：对话间隔
  useEffect(() => {
    if (!_rulesLoaded || !shouldShowAdRef.current) return;

    const userMsgCount = messages.filter((m) => m.role === 'user').length;
    if (userMsgCount <= lastMessageCountRef.current) {
      lastMessageCountRef.current = userMsgCount;
      return;
    }
    lastMessageCountRef.current = userMsgCount;

    const currentIsGuest = isGuestRef.current;
    const currentTier = tierRef.current;
    const gapRules = adService.getMatchingRules(
      'conversation_gap',
      currentIsGuest ? 'guest' : currentTier,
    );
    for (const rule of gapRules) {
      const interval = rule.trigger.params.messageInterval || 5;
      if (userMsgCount > 0 && userMsgCount % interval === 0) {
        injectAd('conversation_gap');
        break;
      }
    }
  }, [messages.length, injectAd]);

  // 触发器：空闲
  useEffect(() => {
    if (!_rulesLoaded || !shouldShowAdRef.current || !isPanelVisible) return;

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }

    const currentIsGuest = isGuestRef.current;
    const currentTier = tierRef.current;
    const idleRules = adService.getMatchingRules('idle', currentIsGuest ? 'guest' : currentTier);
    if (idleRules.length === 0) return;

    const idleSeconds = idleRules[0].trigger.params.idleSeconds || 60;
    idleTimerRef.current = setTimeout(() => {
      injectAd('idle');
    }, idleSeconds * 1000);

    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [messages.length, isPanelVisible, injectAd]);

  // 切换广告开关
  const toggleAd = useCallback(() => {
    if (!canDisableAd) return;
    setAdEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('termcat_ad_disabled', (!next).toString());
      log.info('ad.toggle', 'Ad toggled', { enabled: next });
      return next;
    });
  }, [canDisableAd]);

  return {
    adMessages,
    shouldShowAd,
    canDisableAd,
    adEnabled,
    toggleAd,
    guestCannotClose,
    guestCannotUseAI,
  };
}
