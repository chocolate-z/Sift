<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

// 外链 / 应用内子页(更新日志、合规指南等)需 Tauri 外部打开或独立路由,现给瞬时反馈
const flash = ref<string | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | undefined
function showFlash(key: string) {
  flash.value = key
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (flash.value = null), 1300)
}
onBeforeUnmount(() => {
  if (flashTimer) clearTimeout(flashTimer)
})

const faqs = [
  {
    q: '抓取到的文本有乱码怎么办?',
    a: '多为 GB2312 / GBK 编码的站点。在请求配置中确认编码处理已启用,或在采集规则的 URL 前缀加 {{gb2312}} 指令,Sift 会在请求时自动转码为 UTF-8。'
  },
  {
    q: '如何应对懒加载图片?',
    a: '点选图片时若真实地址在 data-src,Sift 会提示改取 @data-src 属性;也可在字段的属性提取中手动指定懒加载属性。'
  },
  {
    q: '下载中断后能否断点续传?',
    a: '可以。下载器默认保存断点,暂停或意外中断后,在下载队列点「续传」即可从断点继续,无需整批重下。'
  }
]
const links = ['更新日志', '官网', '反馈问题']

const open = ref(faqs.map(() => false))
function toggleFaq(i: number) {
  open.value[i] = !open.value[i]
}
</script>

<template>
  <section class="view help">
    <header class="head">
      <h1>帮助</h1>
      <p class="sub">快速上手、常见问题与合规说明</p>
    </header>

    <div class="body">
      <div class="stack">
        <!-- 快速上手 -->
        <div class="grid2">
          <div class="guide" @click="router.push('/pick')">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="#9d83ff" class="g-ico">
              <path d="M3 2l9 3.6-3.7 1.2L7 11.8 3 2z" />
            </svg>
            <div class="g-title">点选采集入门</div>
            <div class="g-desc">像圈图一样在网页上点击元素即可生成字段,自动匹配整列。</div>
          </div>
        </div>

        <!-- 常见问题 -->
        <div class="panel">
          <div class="panel-head">常见问题</div>
          <div class="faq-body">
            <div v-for="(f, i) in faqs" :key="f.q" class="faq-item" :class="{ last: i === faqs.length - 1 }">
              <div class="faq-row" @click="toggleFaq(i)">
                <span class="faq-q">{{ f.q }}</span>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="#6a6a76"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="faq-chev"
                  :class="{ open: open[i] }">
                  <path d="M4 6l4 4 4-4" />
                </svg>
              </div>
              <div v-if="open[i]" class="faq-a">{{ f.a }}</div>
            </div>
          </div>
        </div>

        <!-- 合规提示 -->
        <div class="notice">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="#9d83ff"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="n-ico">
            <circle cx="8" cy="8" r="6.2" />
            <path d="M8 7.4v3.4M8 5.2v.01" />
          </svg>
          <span class="n-text">
            Sift 是中立的采集工具。请遵守目标站点的服务条款与 robots 协议,仅采集你有权访问的数据。
            <span class="n-link" @click="showFlash('compliance')">
              {{ flash === 'compliance' ? '合规指南即将上线 ✓' : '查看合规指南 →' }}
            </span>
          </span>
        </div>

        <!-- 底部链接 -->
        <div class="foot">
          <span class="ver mono">Sift Pro v0.1.0</span>
          <span v-for="l in links" :key="l" class="foot-link" @click="showFlash(l)">
            {{ flash === l ? '即将打开…' : l }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.help {
  display: flex;
  flex-direction: column;
  height: 100%;
  line-height: normal;
}
.head {
  flex: none;
  padding: 22px 28px 16px;
}
.head h1 {
  margin: 0 0 3px;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.head .sub {
  font-size: 13px;
  color: var(--text-secondary);
}
.body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 28px 28px;
}
.stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 快速上手 */
.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.guide {
  background: #14141b;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
}
.guide:hover {
  border-color: #3a3066;
}
.g-ico {
  margin-bottom: 9px;
}
.g-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}
.g-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* 常见问题 */
.panel {
  background: #14141b;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}
.panel-head {
  padding: 13px 16px;
  border-bottom: 1px solid #20202a;
  font-size: 14px;
  font-weight: 600;
}
.faq-body {
  padding: 4px 16px;
}
.faq-item {
  border-bottom: 1px solid #1c1c24;
}
.faq-item.last {
  border-bottom: 0;
}
.faq-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 0;
  cursor: pointer;
}
.faq-q {
  font-size: 13px;
  color: #cdccd8;
}
.faq-chev {
  flex: none;
  transition: transform 0.15s;
}
.faq-chev.open {
  transform: rotate(180deg);
}
.faq-a {
  padding: 0 0 14px;
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.65;
}

/* 合规提示 */
.notice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba(124, 92, 252, 0.07);
  border: 1px solid #2e2747;
  border-radius: 10px;
  padding: 13px 15px;
}
.n-ico {
  flex: none;
  margin-top: 1px;
}
.n-text {
  font-size: 12px;
  color: #bdb4d8;
  line-height: 1.6;
}
.n-link {
  color: var(--accent-text);
  cursor: pointer;
}

/* 底部链接 */
.foot {
  display: flex;
  align-items: center;
  gap: 18px;
  font-size: 11.5px;
  color: #7a7a87;
  padding-left: 2px;
}
.foot-link {
  cursor: pointer;
}
.foot-link:hover {
  color: var(--accent-text);
}
</style>
