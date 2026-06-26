# @sift/visual-picker · 技术验证报告(线 A · 可视化点选)

> 对应开发文档第 6 节《技术验证规范》6.4。本报告记录线 A 选择器生成与重复结构识别算法的验证结论、关键输出、库选型与**遗留风险(§6.6)**。

## 概述

- **验证对象**:可视化点选的核心算法 —— 稳健选择器生成、重复结构识别、从一个到整列、多字段联动、属性提取、稳健性评分。
- **约束遵守**:**不依赖真实浏览器、不发起任何网络请求**。按 §6.4 以纯对象 `VNode`(含 `parent` 引用)构造电商列表 DOM(`body > header + div.product-list#list(5×div.product-card{a.title[href]+span.price+img.cover[data-src]}) + footer`)。
- **测试**:`pnpm vitest run packages/visual-picker` —— **20 项全部通过**;`tsc --noEmit` 通过;prettier / eslint 通过。
- **源码**:`src/{types,selector-gen,repeat-detect,index}.ts`;测试:`test/{fixtures,picker.test}.ts`。

## 一、验证项结论

| #   | 验证项                                                        | 结论    | 证据(`picker.test.ts` 用例)                                                      |
| --- | ------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------- |
| 1   | 稳健选择器生成(id>语义class>nth-of-type,跳过随机/纯数字 id)   | ✅ 通过 | `item 1`(`#list`;`item-a3f9b2c1`/`1024` 被跳过;命中唯一性 `length 1` + 身份断言) |
| 2   | 重复结构识别(回溯列表容器,返回容器/项标签class/项数/项内路径) | ✅ 通过 | `item 2`(深层目标与"目标即列表项"两种;无重复结构返回 `null`)                     |
| 3   | 从一个到整列(点选第 3 张卡标题 → 匹配全部 5 个标题)           | ✅ 通过 | `item 3`(`#list div.product-card a.title` 命中全部 5 个标题且有序)               |
| 4   | 多字段联动(标题/价格/图片各自列选择器,**同一容器**)           | ✅ 通过 | `item 4`(三列同容器 `#list`;**跨两个列表的点选被拒为 `null`**)                   |
| 5   | 属性提取(`<a>`→`@href`;懒加载 `<img>`→`@data-src`)            | ✅ 通过 | `item 5`(含「占位 `src` + `data-src`」仍优先 `@data-src` 的真实懒加载场景)       |
| 6   | 稳健性评分(id/语义class 高分,nth-of-type 低分)                | ✅ 通过 | `item 6`(`id/class`→`high`、`nth-of-type`→`low`、`tag`→`medium`,断言精确等级)    |

> 另含 `VNode CSS 引擎` 健全性测试(标签/类/id/后代/子代/属性/`nth-of-type` 按标签计数),为 item 3/4 的"匹配 5 项"提供可信底座,避免引擎自身缺陷造成假绿。
>
> 类型完整性(§6.7):`src/types.ts` 导出 `VNode`、`GeneratedSelector`、`RepeatStructure`、`ColumnSelector`、`AttributeSuggestion`、`RobustnessScore` 等完整契约,供入口 A「点选工作台」UI 直接复用。

## 二、关键输出示例

```text
generateSelector(productList) → { selector: '#list', strategies: ['id'], score: 100, grade: 'high' }
generateSelector(card3)       → { selector: 'div.product-card:nth-of-type(3)', score: 45, grade: 'low' }  // 唯一命中 card3
generateSelector(card3Title)  → 'div.product-card:nth-of-type(3) > a.title'                                // 唯一命中标题

detectRepeat(card3Title) → {
  container: productList, itemTag: 'div', itemClass: 'product-card',
  count: 5, pathWithinItem: 'a.title', targetIndex: 2
}

generateColumnSelector(...) → { columnSelector: '#list div.product-card a.title', matchCount: 5 }

buildFieldColumns([title, price, image]) → {
  containerSelector: '#list', itemSelector: 'div.product-card',
  columns: [ '…a.title'(5), '…span.price'(5), '…img.cover'(5) ]      // 三列同容器
}
buildFieldColumns([listA.title, listB.price]) → null                  // 跨容器被拒(§6.4.4 不变式)

suggestAttribute(<a href>)                 → { mode:'attr', attr:'href' }
suggestAttribute(<img data-src 无src>)     → { mode:'attr', attr:'data-src', reason:'lazy…' }
suggestAttribute(<img src=占位 + data-src>) → { mode:'attr', attr:'data-src' }   // 懒加载优先
suggestAttribute(<span.price>)             → { mode:'text' }

scoreStrategies(['id'])=high(100)  ['class']=high  ['tag']=medium(70)  ['nth-of-type']=low(45)
```

**评分标定说明**:罚分校准为 `class -10 / tag -30 / nth-of-type -55`(等级带 `high≥80 / medium≥50 / low<50`),使任何含 `nth-of-type` 的位置选择器落入 `low`,落实 §6.4.6「nth-of-type 得低分」。

## 三、HTML 解析库选型(线 A 视角)

线 A 算法**完全不绑定具体 DOM 库**:全部基于框架无关的 `VNode`(纯对象 + `parent` 引用)与内置的轻量 `VNode` CSS 引擎(`queryAll`/`matches`)。集成期由上层把"真实 DOM / HTML 快照 / `node-html-parser` 结果"映射为 `VNode` 即可复用,与线 B 选用的 `node-html-parser` 一致、无额外依赖。本阶段不引入浏览器或 jsdom。

## 四、遗留风险(待真实环境验证)

以下为 §6.6 列明、本阶段无法覆盖、须在对应阶段验证的真实环境项:

| 风险             | 说明                                                      | 验证阶段       |
| ---------------- | --------------------------------------------------------- | -------------- |
| WebView 脚本注入 | 点选需向目标页注入 JS 监听悬停 / 点击,部分站点 CSP 会拦截 | Tauri 集成阶段 |
| 真实编码 / 反爬  | GB2312 解码、302 跟随在真实请求中的表现                   | 引擎集成阶段   |
| 动态渲染体积     | 复用 WebView 或内置 Chromium 的权衡                       | 第二阶段预研   |
| 伪类执行库       | 确认 `node-html-parser` + 转译层或替换库                  | 引擎实现阶段   |

**降级方案(CSP 拦截)**:若 WebView 注入被站点 CSP 拦截,采用「抓取 HTML 快照点选」模式 —— 后端抓取静态 HTML,前端在快照上点选,不依赖注入。本包算法对此天然友好:只要把快照 HTML 映射为 `VNode` 树即可复用全部选择器生成 / 重复结构识别逻辑。

补充(非 §6.6,留作实现期参考):

- `isRandomId` 对"无数字的纯小写哈希类 id"存在良性漏判(文档要求的 `item-a3f9b2c1` / 纯数字 id 已正确跳过);真实集成期可加熵/辅音串启发式增强。
- 生成的选择器为 mockup 级 `VNode` 引擎所验证;接真实 DOM 时建议加唯一性回归与手动修正入口(与文档风险登记"选择器鲁棒性"一致)。

## 五、复现方式

```bash
pnpm install
pnpm vitest run packages/visual-picker   # 20 passed
pnpm --filter @sift/visual-picker typecheck
```
