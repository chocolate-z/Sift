<script setup lang="ts">
const faqs = ['抓取到的正文有乱码怎么办?', '如何应对懒加载图片?', '下载中断后能否断点续传?']
const links = ['更新日志', '官网', '反馈问题']
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
          <div class="guide">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="#9d83ff" class="g-ico">
              <path d="M3 2l9 3.6-3.7 1.2L7 11.8 3 2z" />
            </svg>
            <div class="g-title">点选采集入门</div>
            <div class="g-desc">像圈图一样在网页上点击元素即可生成字段,自动匹配整列。</div>
          </div>
          <div class="guide">
            <svg
              width="20"
              height="20"
              viewBox="0 0 16 16"
              fill="none"
              stroke="#9d83ff"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="g-ico">
              <path d="M6.4 2.5C5 2.5 5 4 5 5c0 1-.6 2-1.6 2 1 0 1.6 1 1.6 2 0 1 0 2.5 1.4 2.5" />
              <path d="M9.6 2.5C11 2.5 11 4 11 5c0 1 .6 2 1.6 2-1 0-1.6 1-1.6 2 0 1 0 2.5-1.4 2.5" />
            </svg>
            <div class="g-title">导入第三方规则</div>
            <div class="g-desc">粘贴 API 源或网页源规则,Sift 自动解码并还原采集链路。</div>
          </div>
        </div>

        <!-- 常见问题 -->
        <div class="panel">
          <div class="panel-head">常见问题</div>
          <div class="faq-body">
            <div v-for="(q, i) in faqs" :key="q" class="faq-row" :class="{ last: i === faqs.length - 1 }">
              <span class="faq-q">{{ q }}</span>
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                stroke="#6a6a76"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round">
                <path d="M4 6l4 4 4-4" />
              </svg>
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
            <span class="n-link">查看合规指南 →</span>
          </span>
        </div>

        <!-- 底部链接 -->
        <div class="foot">
          <span class="ver mono">Sift Pro v0.1.0</span>
          <span v-for="l in links" :key="l" class="foot-link">{{ l }}</span>
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
.faq-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 0;
  border-bottom: 1px solid #1c1c24;
  cursor: pointer;
}
.faq-row.last {
  border-bottom: 0;
}
.faq-q {
  font-size: 13px;
  color: #cdccd8;
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
