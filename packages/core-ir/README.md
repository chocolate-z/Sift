# @sift/core-ir — 统一规则中间表示(Rule IR)

Sift 架构的**基石**(开发文档 §5.2①):点选(线 A)、书源(线 B)、手写规则三种输入都**编译**到同一个 `Rule` 结构,采集引擎**只认 IR**、与输入来源解耦。新增输入方式 = 新增一个转译器,引擎不变。

- 纯类型包,**零运行时依赖**(仅一个 `CURRENT_IR_VERSION` 常量 + `isRule` 结构守卫)。
- **JSON 可序列化,IR 内不含任何函数/闭包**;脚本以 id 引用(phase-3 沙箱)。
- TS 先行,后续在 Rust 引擎以 `serde` 1:1 镜像(每个 §5.1 层一个文件,便于映射)。

## Rule 形态

```
Rule { irVersion, meta, entry, vars[], steps[], output, defaults?, scripts?, capabilities?, x? }
  CollectStep { id, name, request, parse, inputs?, produces?, fanout?, pagination?, optional? }
    request: RequestConfig  // ① 请求层:url(template|extracted|static)/headers/credentialRef/encoding/followRedirect/retry/rateLimit/urlReplaceRules
    parse:   ParseSpec      // ② 解析层:shape(page|list)/list(container,item)/fields{ SelectorExpr{engine,expr,fallbacks,extract,pipeline} }/limit/contentFilters
    pipeline: PipelineOp[]  // ③ 管线层:regex|base64Decode|urlReplace|resolveUrl|trim|join|script(phase-3)
  output: OutputSpec        // 友好列(name ← fromStep/fromField)+ 导出格式 + 下载
```

- **变量传递**:`vars` 声明 + 步骤 `produces`/`inputs` + `UrlSource.template` 的 `placeholders`(按 stepId 解析,非下标,重排安全);`fanout: perItem(overStep)` 驱动逐项迭代。
- **解析器派发**(§5.2②):每个 `SelectorExpr` 带 `engine`(css|xpath|jsonpath,开放字符串并集),引擎据此分发。jQuery 伪类 `:gt/:lt/:eq` 作为**原始 CSS 字符串**保留,切片算法归引擎的伪类层,IR 不携带预翻译结果。
- **凭据**:只存加密库的引用 id(`credentialRef`/`proxyRef`),**绝不明文**(为规则市场分享留安全底线)。

## 三入口映射(M1 转译器据此实现)

- **线 A(visual-picker)**:单步 `Rule`,`entry:url`;`RepeatStructure → parse.shape='list'`(container/item),每个 `ColumnSelector → fields[key]`,`AttributeSuggestion → selector.extract`;稳健性评分**不进 IR**(只决定写哪个选择器字符串,可挂 `x`)。
- **线 B(source-parser)**:`ParseResult → Rule`,`CollectStep[]` 同 id 映射;`urlSource template/extracted` 一一对应;`UrlDirectives → request.encoding/followRedirect`;`parseMode json/css → SelectorExpr.engine`;`DecodedFilter → parse.contentFilters`;`multi_page/next_btn/next_val → pagination.nextButton`;`unknownFields → meta.x`(容错)。
- **手写规则**:直接产出同一个 `Rule`——它是最直白的生产者,也是「IR 即契约」的证明(引擎对手写与编译产物一视同仁)。点选↔手写**双向同步**因两端都序列化到同一 `Rule` 而成立。

## MVP vs 后置

- **MVP(M1 必须实现)**:多步链路 + 变量传递;请求层(模板/抽取 URL、headers、加密凭据、gb2312 编码、302、超时/重试/限速);解析层 css(含伪类)/xpath/jsonpath + 列表/单页 + fallback + 属性提取;管线 regex/base64/urlReplace/resolveUrl/trim/join;`fanout once|perItem`;`pagination nextButton|pageParam`;输出 records + csv/json/xlsx/txt。
- **后置但可表达(加字段即可,不改核心)**:代理 `proxyRef`、动态渲染 `render`、嗅探 `sniff`、调度 `capabilities.schedule`、增量 `incremental`、通知 `notify`、图片/视频下载 `output.download`、EPUB/zip/cbz/pdf、JS 沙箱 `{op:'script'}+scripts`、API 游标分页。`irVersion` + 每对象 `x?` 逃生舱保证向前兼容(未知 facet 跳过+告警,不崩)。

## 冻结 irVersion 1 前需在引擎集成阶段确认的风险(设计评议产出)

1. **伪类执行位置**:IR 携带原始 `:gt/:eq`,切片归 Rust CSS 库的伪类层;若该库无法承载,可能需回退到 IR 内预翻译片段。
2. **fallback 语义**:线 B 把"搜索结果页 + 书详情页"两套选择器混在一个逗号列里;若实为两套页面上下文,转译器需拆到不同步骤而非当 fallback。
3. **分页 combine 推断**:`appendRows` vs `appendContent` 目前据 `chapter_content_type` 编译期推断,该字段语义未完全验证。
4. **url_replace 作用目标**:规则可作用于请求 URL 或抽取出的 href 值,转译器需要明确的判定矩阵。
5. **fanout 笛卡尔风险**:`perItem` 逐项迭代须与限速/并发上限协同,界定扇出边界,避免请求量失控。
6. **POST body 模板**:`body(form/json/raw)` 已建模但两源都没 POST 搜索,占位编码契约未验证。
7. **同名字段冲突**:跨步骤 `fields` 键可重名,引擎内部作用域须一致用 `${stepId}.${field}` 命名。
8. **凭据入库握手**:导入带内联 Cookie 的书源时须在导入期迁移进加密库,只留 `credentialRef`,防明文泄入可分享规则。

> 完整设计依据见技术决策与第 5 节;本 IR 为 M0「Rule IR 类型定稿」出口。
