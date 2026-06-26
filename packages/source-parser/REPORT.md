# @sift/source-parser · 技术验证报告(线 B · 书源解析)

> 对应开发文档第 6 节《技术验证规范》6.3。本报告记录线 B 解析器的验证结论、关键输出示例、HTML 解析库选型与遗留风险。

## 概述

- **验证对象**:书源(兼容小说"书源"DSL)解析器 —— 源类型识别、JSON 路径归一、指令剥离、占位符提取、多步骤链路、Base64 解码、jQuery 伪类转译、多选择器 fallback、url_replace、未知字段容错、完整性校验。
- **约束遵守**:全程**不发起任何真实网络请求**。两个真实书源(七猫 API 源 / 旧钢笔网页源)以静态对象写入 `test/fixtures.ts`,与文档 §6.3 JSON 逐字一致;HTML 仅用构造的模拟片段(`makeChapterListHtml` / `makeTwoListHtml`)。
- **测试**:`pnpm vitest run packages/source-parser` —— **38 项全部通过**;`tsc --noEmit` 类型检查通过;prettier / eslint 通过。另对一份真实书源清单做了补充抽样验证(见第五节)。
- **源码**:`src/{types,decoders,pseudo,parser,index}.ts`;测试:`test/{fixtures,parser.test}.ts`。

## 一、验证项结论

| #   | 验证项                                                         | 结论    | 证据(`parser.test.ts` 用例)                                                                                                       |
| --- | -------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 源类型识别(`source_type:"2"`→API;CSS→网页;`key$$`→API)         | ✅ 通过 | `item 1 · source-type detection`(含「纯 key$$ 不得判为 web」反例,且断言 `confidence>0`/`reasons~/CSS selector/`,排除默认兜底假绿) |
| 2   | JSON 路径归一(`key$$data.key$$search_list`→`data.search_list`) | ✅ 通过 | `item 2 · JSON path normalization`                                                                                                |
| 3   | 前缀指令剥离(`{{302}}{{gb2312}}` → 指令数组 + 纯 URL)          | ✅ 通过 | `item 3 · URL directive stripping`                                                                                                |
| 4   | 占位符提取(`###keyword###` 等,去重有序)                        | ✅ 通过 | `item 4 · placeholder extraction`(含 `###k###/###k###`→`['k']` 去重证明)                                                          |
| 5   | 多步骤链路(search→目录→正文,记录 URL/占位依赖/规则/解析模式)   | ✅ 通过 | `item 5 · multi-step chain`(API 链路与网页 selector 链路双覆盖)                                                                   |
| 6   | content_filter Base64 解码(失败保留并标记)                     | ✅ 通过 | `item 6`(钉住三条真实解码值 + 非规范 base64 触发 round-trip 守卫的反例)                                                           |
| 7   | jQuery 伪类转译(`:gt/:lt/:eq`;15 元素 `:gt(8)` 取后 6)         | ✅ 通过 | `item 7`(纯算法 + node-html-parser 端到端 + **跨父全局匹配集**语义证明)                                                           |
| 8   | 多选择器 fallback(逗号分隔,命中即止)                           | ✅ 通过 | `item 8`(含括号/引号内逗号保护:`a[data-x='1,2'], .b:not(.c, .d), .e`→3 项)                                                        |
| 9   | url_replace_rules(`http://m%%http://www`)                      | ✅ 通过 | `item 9`(数组形 + 真实**字符串形 / `&&` 多规则** + 无匹配透传 / 无 `%%` / 非法输入边界)                                           |
| 10  | 未知字段容错(收入容错集,不报错)                                | ✅ 通过 | `item 10 · unknown-field tolerance`                                                                                               |
| 11  | 完整性校验(缺字段产 warnings,状态 ok/warning/error)            | ✅ 通过 | `item 11`(ok / warning / **error** 三档均可达且被测)                                                                              |

> 类型完整性(§6.7):`src/types.ts` 导出 `RawBookSource`、`ParseResult`、`CollectStep`、`UrlDirectives`、`DecodedFilter`、`TranslatedSelector` 等完整契约,供入口 B「规则导入工作台」UI 直接复用。

## 二、关键输出示例

### 1) `parseBookSource(qimao)` —— API 源,三步链路

```jsonc
{
  "status": "ok",
  "sourceType": {
    "type": "api",
    "confidence": 1,
    "reasons": ["source_type=\"2\" → API (JSON) source"]
  },
  "placeholders": ["book_id", "item_id", "keyword"],
  "searchResult": {
    "limit": 7,
    "listSelector": "data.search_list",
    "fields": { "name": { "jsonPath": "title" }, "...": "..." }
  },
  "contentFilters": [],
  "steps": [
    {
      "id": "search",
      "urlSource": "template",
      "parseMode": "json",
      "placeholderDeps": [{ "name": "keyword", "satisfiedBy": "input" }],
      "produces": ["book_id"]
    },
    {
      "id": "book",
      "urlSource": "template",
      "parseMode": "json",
      "urlTemplate": ".../chapter-list?book_id=###book_id###",
      "placeholderDeps": [{ "name": "book_id", "satisfiedBy": 0 }],
      "produces": ["item_id"],
      "rules": { "book_menu": "data.chapters", "item_id": "id", "item_name": "title" }
    },
    {
      "id": "chapter",
      "urlSource": "template",
      "parseMode": "css",
      "urlTemplate": ".../shuku/###book_id###-###item_id###/",
      "placeholderDeps": [
        { "name": "book_id", "satisfiedBy": 0 },
        { "name": "item_id", "satisfiedBy": 1 }
      ],
      "notes": ["chapter_content_type=1"]
    }
  ]
}
```

要点:`key$$` 前缀/嵌套路径已归一(`data.chapters`);变量传递被显式解析(`book_id` 由步 0 产出、步 1/2 消费;`item_id` 由步 1 产出、步 2 消费);同一源**混合解析模式**(搜索/目录走 JSON,正文页 `body` 走 CSS)。

### 2) `parseBookSource(jiugangbi)` —— 网页源,指令 + 解码

```jsonc
{
  "status": "ok",
  "sourceType": {
    "type": "web",
    "confidence": 1,
    "reasons": ["8 field(s) look like CSS selectors, no JSON-path syntax"]
  },
  "steps": [
    {
      "id": "search",
      "parseMode": "css",
      "directives": {
        "instructions": ["302", "gb2312"],
        "followRedirect": true,
        "encoding": "gb2312"
      },
      "urlTemplate": ".../modules/article/search.php?searchkey=###keyword###&an=搜索"
    },
    { "id": "book", "urlSource": "extracted", "parseMode": "css" }, // 下一跳 URL 由选择器从上页抽取
    {
      "id": "chapter",
      "urlSource": "extracted",
      "parseMode": "css",
      "notes": ["multi_page=true · next: \"下一页\" (.sytlet_footer_buttom ul li.buttom_next a)"]
    }
  ],
  "searchResult": {
    "listSelector": ".toplist_list .list_ul li",
    "listFallbacks": [".indexyfw_novel"],
    "urlReplaceRules": [{ "from": "http://m", "to": "http://www" }]
  },
  "contentFilters": [
    { "status": "decoded", "decoded": "www.jiugangbi.com提供的.+页\\)" },
    { "status": "decoded", "decoded": "--.+本章未完，请点击下一页继续阅读." },
    { "status": "decoded", "decoded": "【请收藏.+的小说】" }
  ]
}
```

要点:`{{302}}{{gb2312}}` 被剥离为结构化指令;三条 content_filter 正确解码为可读正则(失败会原样保留并标记 `kept`);网页源的链路由**选择器抽取下一跳 URL**(`urlSource:"extracted"`),与 API 源的模板占位链路区分。

### 3) jQuery 伪类转译(DOM 库无关核心 + 端到端)

```text
translatePseudo('.indexyfw_listbox .listchapter ul li:gt(8) a')
  → segments[0] = { selector: '.indexyfw_listbox .listchapter ul li', op: gt(8)→slice(9..) }, rest: 'a'
applyPositionalOp([0..14], gt(8))            → [9,10,11,12,13,14]            (纯数组,无 DOM)
htmlQuerySelectorAll(15×<li>, '…li:gt(8) a') → 第10..15章                    (node-html-parser 端到端)
htmlQuerySelectorAll(2×<ul>×3, '.wrap ul li:gt(1) a') → [A3,B1,B2,B3]        (全局匹配集,非每父)
```

最后一行证明本实现复现 jQuery 的**全局匹配集**语义(对合并后的 6 个 `<li>` 取 `slice(2)`),而非天真的每父 `slice`(那会得 `[A3,B3]`)。

## 三、HTML 解析库选型结论与理由

**结论:采用 `node-html-parser` + 自实现伪类转译层。**

| 候选                       | 评估                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **node-html-parser**(选用) | 纯 JS、零原生依赖、纯内存解析、API 轻量;`querySelectorAll` 覆盖标准 CSS(标签/类/id/后代/子代/属性/`nth-of-type`)。体积小、启动快,适合在 Tauri WebView / 前端预览侧运行。 |
| cheerio                    | 功能更全(jQuery 风格 API),但依赖 `parse5` + `css-select`,体积更大;其 `:gt/:eq` 等"扩展伪类"历史上行为不稳定且各版本不一,不宜直接依赖。                                   |
| 标准 `querySelector`       | 不支持 `:gt/:lt/:eq` 等 jQuery 位置伪类,无法直接解析书源选择器。                                                                                                         |

**关键设计:伪类转译与 DOM 库解耦。** `pseudo.ts` 的 `translatePseudo` / `applyPositionalOp` 是纯函数(无任何 DOM 依赖,可用纯数组验证核心算法);真正的 DOM 查询通过 `QueryAdapter` 接缝注入,`index.ts` 才把 `node-html-parser` 接上(`htmlQuerySelectorAll`)。因此**更换底层解析库不影响核心算法**,也满足 §6.3「伪类转译逻辑须独立可测」。

## 四、遗留风险(待真实环境验证)

| 风险            | 说明                                                                                            | 验证阶段         |
| --------------- | ----------------------------------------------------------------------------------------------- | ---------------- |
| 真实编码 / 反爬 | `gb2312` 解码与 `302` 跟随在真实请求中的表现(本阶段仅把指令解析为结构化标记,未真正解码字节流)   | 引擎集成阶段(M1) |
| 伪类执行库      | 确认 `node-html-parser` 在更大规模真实页面上的 CSS 覆盖度;必要时以替换库或补齐属性运算符        | 引擎实现阶段(M1) |
| 选择器覆盖边界  | 真实书源可能使用本阶段未覆盖的扩展语法(如 `:contains`、复杂属性运算);需在引擎阶段补齐或降级提示 | 引擎实现阶段(M1) |

> jQuery 位置伪类目前实现非负索引(真实书源均为非负);负索引虽可解析但不在覆盖范围,留待按需启用。

## 五、真实环境抽样验证(补充)

为检验解析器对真实数据的健壮性,对一份公开真实书源清单整体跑了一遍解析。**仅下载该规则文件本身,未对其中任何书站发起采集请求**(守住 §6.1 边界)。

- **样本**:77 个真实书源(同一套 DSL),含 12 个 API 源、65 个网页源。
- **结果**:**0 崩溃,全部 `status: ok`**;834 条 `content_filter` 中 **833 条成功 Base64 解码**为可读文本、1 条按非 base64 原样保留;30 个源的 `{{302}}/{{gb2312}}` 指令被正确解析;39 个源含文档未列的扩展字段(`book_menu_multi`、`headers`、`cookie`、`selector_filter` 等),全部经容错吸收不报错。
- **据此发现并修复一处健壮性缺陷**:`url_replace_rules` 在真实数据中是**字符串**(且常用 `&&` 串接多条,如 `m.feibzw%%www.feibzw&&book-%%Html/`),而文档样例只给了数组形 `["http://m%%http://www"]`。已让 `parseUrlReplaceRules` 同时接受数组形 / 字符串形 / `&&` 多规则,并对 `content_filter` 非数组、整体解析异常加了边界守卫 + 顶层 `try/catch`,保证**任意 loosely-typed 输入降级为 `error` 结果而非崩溃**(已固化为回归测试 `item 9` / `item 6`)。

> 结论:文档两源(七猫 / 旧钢笔)代表的 DSL 在真实大样本上覆盖良好;核心解析逻辑健壮,扩展字段差异由容错层吸收。

## 六、复现方式

```bash
pnpm install
pnpm vitest run packages/source-parser   # 38 passed
pnpm --filter @sift/source-parser typecheck
```
