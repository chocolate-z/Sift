<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <section class="view import">
    <header class="head">
      <h1>导入采集规则</h1>
      <p class="sub">用一份采集规则告诉 Sift「抓什么」:目标 URL、列表选择器、要提取的字段。规则在本地解析与执行。</p>
    </header>

    <div class="body">
      <div class="cards">
        <button type="button" class="card primary" @click="router.push('/import/paste')">
          <div class="card-ico">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round">
              <path d="M8 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
              <path d="M9 3h6v3H9zM9 11h6M9 15h4" />
            </svg>
          </div>
          <div class="card-t">粘贴规则 JSON</div>
          <div class="card-d">粘贴一份采集规则,现场解析出采集链路与字段映射,输入关键词即可预览采集结果。</div>
          <span class="card-cta">去粘贴 ›</span>
        </button>

        <div class="card disabled">
          <div class="card-ico">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round">
              <path d="M3 3l7 17 2.5-7.5L20 10z" />
            </svg>
          </div>
          <div class="card-t">点选采集</div>
          <div class="card-d">在网页上直接点选元素自动生成规则,无需手写选择器。</div>
          <span class="card-cta muted">即将支持</span>
        </div>
      </div>

      <div class="hint">
        支持 CSS / JSONPath 选择器、多步链路(列表 → 子页)、翻页,以及字段管线(正则清洗、Base64 解码、URL 解析等)。
      </div>
    </div>
  </section>
</template>

<style scoped>
.import {
  display: flex;
  flex-direction: column;
  height: 100%;
  line-height: normal;
}
.head {
  flex: none;
  padding: 22px 28px 6px;
}
.head h1 {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.sub {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  max-width: 640px;
  line-height: 1.6;
}
.body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 28px 28px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  max-width: 720px;
}
.card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 20px;
  border-radius: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  text-align: left;
}
.card.primary {
  cursor: pointer;
}
.card.primary:hover {
  border-color: var(--accent);
  box-shadow: 0 4px 18px rgba(124, 92, 252, 0.18);
}
.card.disabled {
  opacity: 0.6;
}
.card-ico {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(124, 92, 252, 0.14);
  color: var(--accent-text);
}
.card-t {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}
.card-d {
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.6;
}
.card-cta {
  margin-top: 4px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--accent-text);
}
.card-cta.muted {
  color: #6a6a76;
}
.hint {
  margin-top: 18px;
  max-width: 720px;
  font-size: 12px;
  color: #6a6a76;
  line-height: 1.7;
}
</style>
