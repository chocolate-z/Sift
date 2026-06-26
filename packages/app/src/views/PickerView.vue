<script setup lang="ts">
import { ChevronDown, Pencil, Search, TriangleAlert } from 'lucide-vue-next'
import { useRouter } from 'vue-router'

const router = useRouter()

const books = [
  { title: '剑来', price: '¥39.00' },
  { title: '大奉打更人', price: '¥28.00', picked: true },
  { title: '诡秘之主', price: '¥45.00' },
  { title: '凡人修仙传', price: '¥32.00' },
  { title: '三体', price: '¥35.00' }
]

interface Field {
  name: string
  selector: string
  type: string
  robust: number
  robustLabel: string
  attr: string
  dot: string
  lazy?: boolean
}
const fields: Field[] = [
  {
    name: '标题',
    selector: '.product-card .title',
    type: '文本',
    robust: 3,
    robustLabel: '良好',
    attr: '文本',
    dot: 'var(--accent)'
  },
  {
    name: '价格',
    selector: '.product-card .price',
    type: '数字',
    robust: 4,
    robustLabel: '优秀',
    attr: '文本',
    dot: '#2dd4bf'
  },
  {
    name: '封面图',
    selector: '.product-card img',
    type: '图片',
    robust: 2,
    robustLabel: '一般',
    attr: '@data-src',
    dot: 'var(--accent)',
    lazy: true
  }
]
</script>

<template>
  <section class="view pick">
    <header class="view-head">
      <div>
        <h1>点选采集</h1>
        <p class="sub">在左侧页面点击元素即可选取 · 像圈图一样选数据</p>
      </div>
    </header>

    <!-- url toolbar -->
    <div class="urlbar">
      <div class="url-input">
        <Search :size="15" class="ico" />
        <span class="mono">https://book.example.com/list?cat=novel</span>
      </div>
      <span class="chip ok">
        <i class="dot ok" />
        已加载
      </span>
      <button type="button" class="btn ghost">打开</button>
      <button type="button" class="btn">完成</button>
      <span class="muted">加载中</span>
      <label class="toggle-wrap">
        <span>点选模式</span>
        <span class="toggle on"><i /></span>
      </label>
    </div>

    <!-- legend bar -->
    <div class="subbar">
      <span class="legend">
        <i class="sq hover" />
        悬停
      </span>
      <span class="legend">
        <i class="sq col" />
        已选整列
      </span>
      <span class="spacer" />
      <span class="muted">实时预览 · 双向同步</span>
    </div>

    <div class="pick-body">
      <!-- preview: rendered target page -->
      <div class="preview">
        <div class="mini-head">
          <span class="mini-brand">书阁 BookHall</span>
          <div class="mini-search">搜索书名 / 作者…</div>
          <nav class="mini-nav">
            <a>分类</a>
            <a>排行</a>
            <a class="active">小说</a>
          </nav>
        </div>
        <div class="crumb">首页 / 小说 / 玄幻 · 共 128 本</div>
        <div class="grid">
          <div v-for="b in books" :key="b.title" class="pcard" :class="{ picked: b.picked }">
            <div class="pimg" />
            <div class="ptitle-wrap">
              <span v-if="b.picked" class="tag">a.title · 同列 5</span>
              <div class="ptitle">{{ b.title }}</div>
            </div>
            <div class="pprice">{{ b.price }}</div>
          </div>
        </div>
        <div class="pager">
          <span class="pg active">1</span>
          <span class="pg">2</span>
          <span class="pg">3</span>
          <span class="pg next">下一页 ›</span>
        </div>
      </div>

      <!-- selected fields panel -->
      <aside class="fields">
        <div class="fields-head">
          <span class="fh-title">
            已选字段
            <b>3</b>
          </span>
          <span class="fh-ok">✓ 每列匹配 5 项</span>
        </div>

        <div class="fields-scroll">
          <div v-for="f in fields" :key="f.name" class="fcard">
            <div class="fc-top">
              <i class="fdot" :style="{ background: f.dot }" />
              <div class="fname">{{ f.name }}</div>
              <span class="fc-label">字段名</span>
            </div>
            <div class="fc-sel">
              <span class="sel-k">选择器</span>
              <span class="sel-v mono">{{ f.selector }}</span>
              <Pencil :size="13" class="sel-edit" />
            </div>
            <div class="fc-row">
              <span class="dd">
                {{ f.type }}
                <ChevronDown :size="13" />
              </span>
              <span class="chip ok sm">✓ 匹配 5 项</span>
            </div>
            <div v-if="f.lazy" class="fc-warn">
              <TriangleAlert :size="13" />
              检测到懒加载,已自动取 @data-src
            </div>
            <div class="fc-bottom">
              <span class="robust">
                稳健性
                <i v-for="n in 5" :key="n" class="rdot" :class="{ on: n <= f.robust }" />
                {{ f.robustLabel }}
              </span>
              <span class="dd sm">
                取属性 {{ f.attr }}
                <ChevronDown :size="13" />
              </span>
              <button type="button" class="del">删除</button>
            </div>
          </div>
        </div>

        <div class="fields-actions">
          <div class="add-row">
            <button type="button" class="add">+ 手动添加字段</button>
            <button type="button" class="add">+ 分页规则</button>
          </div>
          <div class="fields-foot">
            <button type="button" class="btn primary wide" @click="router.push('/data')">预览数据</button>
            <button type="button" class="btn ghost">保存为任务</button>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.pick {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* url toolbar */
.view-head {
  padding: 14px 24px 6px;
  border-bottom: 0;
}
.urlbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 24px;
}
.url-input {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 9px;
  color: var(--text-secondary);
}
.url-input .mono {
  font-size: 12.5px;
  color: var(--text);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 9px;
  border-radius: 7px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-card);
  border: 1px solid var(--border);
}
.chip.ok {
  color: var(--success);
}
.chip.sm {
  padding: 2px 7px;
  font-size: 11px;
}
.btn {
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}
.btn.ghost {
  background: none;
}
.btn:hover {
  border-color: var(--text-dim);
}
.btn.primary {
  border: 0;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #fff;
  font-weight: 600;
}
.btn.wide {
  flex: 1;
  height: 38px;
}
.muted {
  color: var(--text-dim);
  font-size: 12.5px;
}
.toggle-wrap {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
}
.toggle {
  width: 38px;
  height: 21px;
  border-radius: 11px;
  background: var(--border);
  position: relative;
}
.toggle.on {
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
}
.toggle i {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: #fff;
  transition: left 0.15s;
}
.toggle.on i {
  left: 19px;
}

/* legend bar */
.subbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 4px 24px 0;
  font-size: 12px;
  color: var(--text-secondary);
}
.subbar .spacer {
  flex: 1;
}
.legend {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.sq {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  border: 1.5px solid var(--accent);
}
.sq.col {
  border-color: var(--success);
}

/* body split */
.pick-body {
  flex: 1;
  display: flex;
  gap: 16px;
  padding: 12px 24px 20px;
  min-height: 0;
}

/* preview panel */
.preview {
  flex: 1;
  min-width: 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px 20px;
  overflow-y: auto;
}
.mini-head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-subtle);
}
.mini-brand {
  font-weight: 700;
  color: var(--accent-text);
  font-size: 14px;
}
.mini-search {
  width: 220px;
  height: 30px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-dim);
  font-size: 12px;
}
.mini-nav {
  display: flex;
  gap: 16px;
  margin-left: auto;
  font-size: 13px;
  color: var(--text-secondary);
}
.mini-nav .active {
  color: var(--text);
  font-weight: 600;
}
.crumb {
  padding: 14px 0;
  color: var(--text-secondary);
  font-size: 12.5px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}
.pcard {
  border: 1px solid transparent;
  border-radius: 8px;
}
.pcard.picked {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.pimg {
  height: 116px;
  border-radius: 6px;
  background: repeating-linear-gradient(45deg, #e6e6ec, #e6e6ec 5px, #dcdce4 5px, #dcdce4 10px);
}
.ptitle-wrap {
  position: relative;
  margin-top: 10px;
}
.tag {
  position: absolute;
  top: -16px;
  left: 0;
  padding: 1px 6px;
  background: var(--accent);
  color: #fff;
  border-radius: 5px;
  font-size: 10.5px;
  white-space: nowrap;
}
.ptitle {
  padding: 3px 6px;
  border: 1.5px solid var(--success);
  border-radius: 5px;
  font-size: 13px;
  color: var(--text);
}
.pcard.picked .ptitle {
  border-color: var(--accent);
}
.pprice {
  margin-top: 6px;
  padding-left: 6px;
  color: var(--text-secondary);
  font-size: 13px;
}
.pager {
  display: flex;
  gap: 6px;
  margin-top: 18px;
}
.pg {
  min-width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 12.5px;
}
.pg.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.pg.next {
  color: var(--text-dim);
}

/* fields panel */
.fields {
  width: 358px;
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.fields-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.fields-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
}
.fields-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.fh-title {
  font-size: 14px;
  font-weight: 600;
}
.fh-title b {
  color: var(--accent-text);
}
.fh-ok {
  font-size: 12px;
  color: var(--success);
}
.fcard {
  padding: 12px 13px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.fc-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.fdot {
  width: 9px;
  height: 9px;
  border-radius: 3px;
}
.fname {
  flex: 1;
  padding: 5px 9px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 7px;
  font-size: 13px;
  font-weight: 600;
}
.fc-label {
  color: var(--text-dim);
  font-size: 11.5px;
}
.fc-sel {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 9px;
  padding: 6px 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 7px;
}
.sel-k {
  color: var(--text-dim);
  font-size: 11.5px;
}
.sel-v {
  flex: 1;
  font-size: 12px;
  color: var(--accent-text);
}
.sel-edit {
  color: var(--text-dim);
  cursor: pointer;
}
.fc-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 9px;
}
.dd {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 7px;
  font-size: 12px;
  color: var(--text);
  cursor: pointer;
}
.dd.sm {
  font-size: 11.5px;
  padding: 3px 8px;
}
.fc-warn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 9px;
  padding: 6px 9px;
  background: rgba(224, 168, 90, 0.1);
  border: 1px solid rgba(224, 168, 90, 0.3);
  border-radius: 7px;
  color: var(--warning);
  font-size: 11.5px;
}
.fc-bottom {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 11px;
}
.robust {
  flex: 1;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11.5px;
  color: var(--text-secondary);
}
.rdot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--border);
}
.rdot.on {
  background: var(--accent);
}
.del {
  background: none;
  border: 0;
  color: var(--text-dim);
  font-size: 11.5px;
  cursor: pointer;
}
.del:hover {
  color: var(--danger);
}
.add-row {
  display: flex;
  gap: 10px;
}
.add {
  flex: 1;
  padding: 8px;
  background: none;
  border: 1px dashed var(--border);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 12.5px;
  cursor: pointer;
}
.add:hover {
  border-color: var(--accent);
  color: var(--text);
}
.fields-foot {
  display: flex;
  gap: 10px;
}
</style>
