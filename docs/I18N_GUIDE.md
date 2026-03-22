# TermCat 多语言系统使用指南

## 📚 目录结构

```
src/
├── locales/              # 多语言配置目录
│   ├── index.ts         # 导出配置和工具函数
│   ├── zh.ts            # 中文语言包
│   ├── en.ts            # 英文语言包
│   └── [新语言].ts      # 添加新语言只需创建新文件
├── contexts/
│   └── I18nContext.tsx  # 多语言 Context 和 Hook
```

## 🚀 快速开始

### 1. 在应用根组件中使用 I18nProvider

```tsx
import { I18nProvider } from './contexts/I18nContext';

function App() {
  return (
    <I18nProvider initialLanguage="zh">
      <YourApp />
    </I18nProvider>
  );
}
```

### 2. 在组件中使用翻译

```tsx
import { useI18n } from '../contexts/I18nContext';

function MyComponent() {
  const { t, language, setLanguage } = useI18n();

  return (
    <div>
      {/* 使用翻译 */}
      <button>{t.common.save}</button>
      <h1>{t.dashboard.title}</h1>

      {/* 切换语言 */}
      <button onClick={() => setLanguage('en')}>
        English
      </button>
      <button onClick={() => setLanguage('zh')}>
        中文
      </button>

      {/* 显示当前语言 */}
      <p>Current: {language}</p>
    </div>
  );
}
```

### 3. 仅使用翻译（不需要切换语言功能）

```tsx
import { useTranslation } from '../contexts/I18nContext';

function SimpleComponent() {
  const t = useTranslation();

  return <button>{t.common.confirm}</button>;
}
```

## 📝 添加新语言

### 步骤 1: 创建新语言文件

在 `src/locales/` 目录下创建新文件，例如 `ja.ts`（日语）：

```typescript
/**
 * Japanese Language Pack
 * 日语语言包
 */

import { TranslationKeys } from './zh';

export const ja: TranslationKeys = {
  common: {
    confirm: '確認',
    cancel: 'キャンセル',
    save: '保存',
    // ... 其他翻译
  },
  // ... 其他分类
};
```

### 步骤 2: 在 index.ts 中注册新语言

```typescript
// src/locales/index.ts
import { zh } from './zh';
import { en } from './en';
import { ja } from './ja'; // 导入新语言

export type Language = 'zh' | 'en' | 'ja'; // 添加新语言类型

export const translations = {
  zh,
  en,
  ja, // 注册新语言
} as const;

export const supportedLanguages = [
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' }, // 添加新语言信息
];
```

### 步骤 3: 使用新语言

```tsx
<button onClick={() => setLanguage('ja')}>日本語</button>
```

## 🎯 翻译键的组织结构

翻译按功能模块组织，主要分类：

- `common` - 通用词汇（保存、取消、确认等）
- `app` - 应用标题
- `sidebar` - 侧边栏
- `dashboard` - 仪表板/主机管理
- `terminal` - 终端
- `aiOps` - AI 运维
- `settings` - 设置
- `login` - 登录
- `payment` - 支付
- `fileBrowser` - 文件浏览器
- `transfer` - 文件传输
- `monitoring` - 系统监控
- `commandLibrary` - 命令库
- `errors` - 错误消息
- `success` - 成功消息
- `confirmations` - 确认消息

## 💡 最佳实践

### 1. 使用嵌套访问

```tsx
// ✅ 推荐
<button>{t.common.save}</button>
<h1>{t.dashboard.title}</h1>

// ❌ 不推荐
<button>保存</button>
<h1>主机管理</h1>
```

### 2. 动态文本插值

对于需要插入变量的文本，使用模板字符串：

```tsx
// 语言包中定义
app: {
  titleWithHost: 'TERMCAT-AI ({host})',
}

// 组件中使用
<span>{t.app.titleWithHost.replace('{host}', hostName)}</span>

// 或者使用辅助函数
function formatMessage(template: string, params: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => params[key] || '');
}

<span>{formatMessage(t.app.titleWithHost, { host: hostName })}</span>
```

### 3. 条件翻译

```tsx
// 根据用户等级显示不同文本
<span>
  {user.tier === 'VIP' ? t.sidebar.vipMember : t.sidebar.freeMember}
</span>
```

### 4. 列表渲染

```tsx
const menuItems = [
  { id: 'dashboard', label: t.sidebar.fleet },
  { id: 'terminal', label: t.sidebar.shell },
  { id: 'settings', label: t.sidebar.setup },
];

return (
  <nav>
    {menuItems.map(item => (
      <button key={item.id}>{item.label}</button>
    ))}
  </nav>
);
```

## 🔧 高级用法

### 创建翻译辅助函数

```typescript
// src/utils/i18nHelpers.ts

/**
 * 格式化带参数的翻译文本
 */
export function formatMessage(
  template: string,
  params: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return params[key]?.toString() || '';
  });
}

/**
 * 获取复数形式（英文）
 */
export function pluralize(
  count: number,
  singular: string,
  plural: string
): string {
  return count === 1 ? singular : plural;
}

// 使用示例
const message = formatMessage(t.dashboard.confirmDeleteHost, { name: 'Server1' });
const itemText = pluralize(count, 'item', 'items');
```

### 类型安全的翻译键

TypeScript 会自动提供类型检查和自动补全：

```tsx
// ✅ 类型安全，有自动补全
<button>{t.common.save}</button>

// ❌ 编译错误：属性不存在
<button>{t.common.notExist}</button>
```

## 📋 完整示例

```tsx
import React from 'react';
import { useI18n } from '../contexts/I18nContext';

export const ExampleComponent: React.FC = () => {
  const { t, language, setLanguage } = useI18n();
  const [hostName, setHostName] = React.useState('');

  const handleDelete = () => {
    const message = t.dashboard.confirmDeleteHost.replace('{name}', hostName);
    if (confirm(message)) {
      // 执行删除
    }
  };

  return (
    <div>
      {/* 标题 */}
      <h1>{t.dashboard.title}</h1>

      {/* 输入框 */}
      <input
        placeholder={t.dashboard.searchPlaceholder}
        value={hostName}
        onChange={(e) => setHostName(e.target.value)}
      />

      {/* 按钮 */}
      <button onClick={handleDelete}>
        {t.common.delete}
      </button>

      {/* 语言切换 */}
      <div>
        <button
          onClick={() => setLanguage('zh')}
          disabled={language === 'zh'}
        >
          中文
        </button>
        <button
          onClick={() => setLanguage('en')}
          disabled={language === 'en'}
        >
          English
        </button>
      </div>

      {/* 条件渲染 */}
      {hostName ? (
        <p>{t.success.saved}</p>
      ) : (
        <p>{t.errors.invalidInput}</p>
      )}
    </div>
  );
};
```

## 🎨 与现有代码集成

如果你的组件已经使用了 `language` prop，可以逐步迁移：

```tsx
// 旧代码
interface Props {
  language: 'zh' | 'en';
}

function OldComponent({ language }: Props) {
  return <button>{language === 'zh' ? '保存' : 'Save'}</button>;
}

// 新代码（推荐）
function NewComponent() {
  const { t } = useI18n();
  return <button>{t.common.save}</button>;
}
```

## 🚨 注意事项

1. **所有用户可见的文本都应该使用翻译系统**
2. **不要在代码中硬编码中文或英文文本**
3. **添加新文本时，同时更新所有语言文件**
4. **保持翻译键的结构一致性**
5. **使用有意义的键名，便于理解和维护**

## 📚 参考资源

- 中文语言包：`src/locales/zh.ts`
- 英文语言包：`src/locales/en.ts`
- Context 实现：`src/contexts/I18nContext.tsx`
- 类型定义：`src/locales/index.ts`
