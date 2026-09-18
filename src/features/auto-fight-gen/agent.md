# Agent 任务：给「导入 AutoFightGen 表格...」加首次引导

## 一、任务目标

在现有的「导入 AutoFightGen 表格...」菜单项里，**不新增任何菜单项**。点击它时：

- 如果用户**没有**跳过过引导 → 先弹出新手指导弹窗。
- 如果用户**已经**跳过过引导 → 直接打开文件选择器。

新手指导弹窗底部只有一个按钮：

- **「我知道了」**：关闭弹窗，打开文件选择器，同时**写入 localStorage 记住跳过状态**（下次不再弹）。

---

## 二、技术上下文

- React + TypeScript
- UI 库：`@blueprintjs/core`（Button、Dialog、DialogBody、MenuItem）
- 参考文件：`features/auto-fight-gen/XlsxImporter.tsx`
- 国际化：项目自带 `useTranslation`，路径 `i18n/i18n`
- 需要用 `localStorage` 存跳过状态
- 不引入新依赖

---

## 三、状态与存储

### 新增 state
```tsx
const [isGuideOpen, setIsGuideOpen] = useState(false);
```

### localStorage key
```
import.guide.skipped
```

- 值为 `"1"` 表示用户点过「我知道了」。
- 值不存在或为空表示未跳过。
- 读写要 try/catch，避免隐私模式报错。

### 读取与写入辅助
```tsx
const isGuideSkipped = (): boolean => {
  try {
    return localStorage.getItem("import.guide.skipped") === "1";
  } catch {
    return false;
  }
};

const setGuideSkipped = () => {
  try {
    localStorage.setItem("import.guide.skipped", "1");
  } catch {
    // 忽略
  }
};
```

---

## 四、点击流程

### 原本的点击行为
```tsx
onClick={() => inputRef.current?.click()}
```

### 改动后
```tsx
onClick={() => {
  if (isGuideSkipped()) {
    inputRef.current?.click();
    return;
  }
  setIsGuideOpen(true);
}}
```

**不新增菜单项。** 只在原来那个 `MenuItem` 的 `onClick` 里加一层判断。

---

## 五、新手指导弹窗

### 组件
新建 `features/auto-fight-gen/NewUserGuide.tsx`。

### Props
```ts
interface NewUserGuideProps {
  isOpen: boolean;
  onAcknowledge: () => void;  // 「我知道了」：写跳过状态 + 关闭 + 打开文件选择器
  onClose: () => void;  // 点遮罩关闭，不写跳过状态
}
```

### 在 XlsxImporter 里渲染
```tsx
<NewUserGuide
  isOpen={isGuideOpen}
  onAcknowledge={() => {
    setGuideSkipped();
    setIsGuideOpen(false);
    inputRef.current?.click();
  }}
  onClose={() => setIsGuideOpen(false)}
/>
```

**只有「我知道了」一个按钮：点击后会写 localStorage、关闭弹窗并打开文件选择器。**

---

## 六、新手指导内容

### 弹窗结构
- `Dialog` + `DialogBody`，标题「表格填写指南」。
- 内容可滚动，`max-height: 70vh`。
- 弹窗 Portal 层级要高于「导入 AutoFightGen 表格...」所在的 Popover2，`portalClassName="z-[3110]"`。
- 底部只有一个按钮：`「我知道了」`（主要）。

### 内容分区（按下面顺序）

#### 1. 动作符号表

| 动作类型  | 支持的符号                | 推荐写法 |
| --------- | ------------------------- | -------- |
| 大招/上拉 | `↑`、`大`、`个`、`W`、`w` | `↑`      |
| 下拉/防御 | `↓`、`防`、`S`、`s`       | `↓`      |
| 普攻      | `A`、`a`、`普`            | `A`      |
| 圈/特殊   | `O`、`o`、`圈`、`M`       | `O`      |

#### 2. 每格内容限制
- 不要有空格、换行、标点与其他文字字母。

#### 3. 切换敌人
- 切换敌人通过表格颜色实现。

---

## 七、视觉规范

- 标题用 `<h4>`，分区之间用 `<Divider />` 或 margin 分隔。
- 符号用 `<code>` 或等宽字体渲染。
- 表格用 `<table>` 或等宽字体，保持对齐。
- 配色跟随 MaaYuanShare 当前主题：复用 `bg-white`、`text-slate-700`、`dark:*` 等现有主题映射，适配浅色、MaaYuan 和深色背景。
- 只用 `@blueprintjs/core` 已有的组件。

---

## 八、国际化

- 所有文案走 `useTranslation`。
- i18n key 建议放在：
  ```
  components.editor.source.XlsxImporter.newUserGuide.*
  ```
- 至少覆盖：
  - `title`
  - `acknowledge_button`（我知道了）
  - 各分区标题与正文
- 若不确定英文翻译，可先写中文，用注释标注 `// TODO: i18n`。

---

## 九、验收标准

- **不新增任何菜单项。**
- 点「导入 AutoFightGen 表格...」时：
  - 未跳过 → 先弹新手指导。
  - 已跳过 → 直接打开文件选择器。
- 弹窗内「我知道了」能触发文件选择器，并写入 `localStorage`，刷新页面后依然生效。
- 3 个内容分区全部渲染，顺序正确。
- 引导弹窗显示在「导入 AutoFightGen 表格...」菜单之上，不被 Popover2 遮挡。
- 不引入新依赖。
- 不修改 `convert.ts` 或 `config.ts`。

---

## 十、边界情况

- 用户点「导入」后弹出引导，又点弹窗外的遮罩关闭 → 仅关闭弹窗，不写跳过状态，不打开文件选择器。可选择再点一次「导入」。
- `localStorage` 不可用（隐私模式）→ 辅助函数已经 try/catch，退化为每次都弹。
- 用户已跳过引导，想重新查看 → 提供手动入口？**本次不加**，如需再加。
- 弹窗内容较长时，`DialogBody` 内部滚动，不撑破视口。

---

## 十一、不要做的事

- 不要新增菜单项。
- 不要改 `convert.ts` 的逻辑。
- 不要改 `config.ts` 的符号表。
- 不要新增 npm 包。
- 不要写测试文件（除非明确要求）。
- 不要用 `any` 类型。
