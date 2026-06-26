<script setup lang="ts">
const accents = ['#7C5CFC', '#2DD4BF', '#E0A85A', '#4A8FE0']
const themes = ['浅色', '深色', '跟随系统']
const capabilities = ['并发上限 8', '定时任务', 'EPUB 导出']
</script>

<template>
  <section class="view settings">
    <header class="head">
      <h1>设置</h1>
      <p class="sub">外观、许可与通用偏好 · 全部本地保存</p>
    </header>

    <div class="body">
      <div class="stack">
        <!-- 许可 -->
        <div class="panel">
          <div class="panel-head">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="#9d83ff">
              <path d="M8 1l2 4.6 5 .5-3.8 3.3 1.2 4.9L8 11.7 3.6 14.3l1.2-4.9L1 6.1l5-.5z" />
            </svg>
            <span class="panel-title">许可</span>
            <span class="pro-badge">PRO</span>
          </div>
          <div class="lic-body">
            <div class="lic-info">
              <div class="lic-ver">
                <span class="lv-label">当前版本</span>
                <span class="lv-edition">Sift Pro</span>
                <span class="lv-active">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="#34D399"
                    stroke-width="2.4"
                    stroke-linecap="round"
                    stroke-linejoin="round">
                    <path d="M3 8.5l3 3 7-7" />
                  </svg>
                  已激活
                </span>
              </div>
              <div class="lic-meta">
                绑定设备 1 / 3 · 有效期至
                <span class="mono">2027-06-30</span>
              </div>
            </div>
            <div class="lic-key">
              <span class="lk-label">激活码</span>
              <div class="lk-row">
                <div class="lk-code mono">SIFT-PRO-••••-••••-9F2C</div>
                <button type="button" class="btn-soft">更换</button>
              </div>
            </div>
          </div>
          <div class="caps">
            <span v-for="c in capabilities" :key="c" class="cap">{{ c }}</span>
            <span class="cap upsell">升级 Max 解锁无限并发 →</span>
          </div>
        </div>

        <!-- 外观 + 通用 -->
        <div class="grid2">
          <div class="panel">
            <div class="panel-head">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#9d83ff" stroke-width="1.4">
                <circle cx="8" cy="8" r="3.4" />
                <path
                  d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1M12.6 12.6l-1.1-1.1M4.5 4.5L3.4 3.4" />
              </svg>
              <span class="panel-title">外观</span>
            </div>
            <div class="row theme-row">
              <span class="row-label">主题</span>
              <div class="seg">
                <span v-for="t in themes" :key="t" :class="{ on: t === '深色' }">{{ t }}</span>
              </div>
            </div>
            <div class="row accent-row">
              <div>
                <div class="row-label">强调色</div>
                <div class="row-hint">用于按钮、高亮与链接</div>
              </div>
              <div class="dots">
                <span
                  v-for="(c, i) in accents"
                  :key="c"
                  class="dot"
                  :class="{ on: i === 0 }"
                  :style="{ background: c }" />
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head plain">通用</div>
            <div class="gen-body">
              <div class="gen-row bordered">
                <span class="row-label">默认下载目录</span>
                <div class="gen-right">
                  <span class="gen-path mono">~/Sift/Downloads</span>
                  <button type="button" class="btn-soft sm">更改</button>
                </div>
              </div>
              <div class="gen-row bordered">
                <span class="row-label">启动时检查更新</span>
                <span class="toggle on"><i /></span>
              </div>
              <div class="gen-row">
                <span class="row-label">完成后发送系统通知</span>
                <span class="toggle on"><i /></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.settings {
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

/* 卡片通用 */
.panel {
  background: #14141b;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}
.panel-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 13px 16px;
  border-bottom: 1px solid #20202a;
}
.panel-head.plain {
  font-size: 14px;
  font-weight: 600;
}
.panel-title {
  font-size: 14px;
  font-weight: 600;
}
.pro-badge {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-radius: 5px;
  padding: 2px 9px;
  box-shadow: 0 1px 6px rgba(124, 92, 252, 0.4);
}

/* 许可 */
.lic-body {
  display: flex;
  gap: 18px;
  align-items: center;
  flex-wrap: wrap;
  padding: 16px;
}
.lic-info {
  flex: 1;
  min-width: 260px;
}
.lic-ver {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 7px;
}
.lv-label {
  font-size: 13px;
  color: #cdccd8;
}
.lv-edition {
  font-size: 12px;
  color: var(--accent-text);
  font-weight: 600;
}
.lv-active {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: #5dd9b8;
}
.lic-meta {
  font-size: 11.5px;
  color: #7a7a87;
  line-height: 1.6;
}
.lic-meta .mono {
  color: #a9a4c9;
}
.lic-key {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 240px;
}
.lk-label {
  font-size: 11px;
  color: #7a7a87;
}
.lk-row {
  display: flex;
  gap: 8px;
}
.lk-code {
  flex: 1;
  display: flex;
  align-items: center;
  background: var(--bg);
  border: 1px solid #2a2a34;
  border-radius: 8px;
  padding: 8px 11px;
  font-size: 12px;
  color: #a9a4c9;
  letter-spacing: 1px;
}
.btn-soft {
  height: 36px;
  padding: 0 14px;
  border-radius: 8px;
  background: var(--bg-elevated);
  border: 1px solid #2e2e38;
  color: #cdccd8;
  font-size: 12px;
  cursor: pointer;
}
.btn-soft:hover {
  border-color: #3a3a46;
}
.btn-soft.sm {
  height: 30px;
  padding: 0 11px;
  border-radius: 7px;
  font-size: 11.5px;
}
.caps {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 0 16px 14px;
}
.cap {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--accent-text);
  background: rgba(124, 92, 252, 0.08);
  border: 1px solid #2e2747;
  border-radius: 13px;
  padding: 3px 11px;
}
.cap.upsell {
  color: #7a7a87;
  background: var(--bg-card);
  border-color: var(--border);
}

/* 外观 + 通用 两栏 */
.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
}
.accent-row {
  border-top: 1px solid #1c1c24;
  padding-top: 14px;
}
.row-label {
  font-size: 13px;
  color: #cdccd8;
}
.row-hint {
  font-size: 11px;
  color: #7a7a87;
  margin-top: 2px;
}
.seg {
  display: flex;
  background: var(--bg);
  border: 1px solid #2a2a34;
  border-radius: 8px;
  padding: 3px;
}
.seg span {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 5px 14px;
  border-radius: 6px;
  cursor: pointer;
}
.seg span.on {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
}
.dots {
  display: flex;
  gap: 8px;
  align-items: center;
}
.dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
}
.dot.on {
  outline: 2px solid var(--accent-text);
  outline-offset: 2px;
}

/* 通用 */
.gen-body {
  padding: 6px 16px;
}
.gen-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 0;
}
.gen-row.bordered {
  border-bottom: 1px solid #1c1c24;
}
.gen-right {
  display: flex;
  align-items: center;
  gap: 9px;
}
.gen-path {
  font-size: 11.5px;
  color: #8a86a6;
}
.toggle {
  width: 30px;
  height: 17px;
  border-radius: 9px;
  background: var(--accent);
  position: relative;
  flex: none;
}
.toggle i {
  position: absolute;
  top: 2px;
  left: 15px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
</style>
