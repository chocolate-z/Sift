<script setup lang="ts">
// 凭据本地 AES-256 加密,明文仅在请求时于内存临时解密。
interface Cred {
  name: string
  domain: string
  icon: 'lock' | 'proxy'
  iconColor: 'amber' | 'green' | 'mutedred'
  type: 'Cookie' | '代理' | 'Token'
  status: 'valid' | 'expiring' | 'invalid'
  lastUse: string
}
const creds: Cred[] = [
  {
    name: '七猫账号 Cookie',
    domain: 'www.qimao.com',
    icon: 'lock',
    iconColor: 'amber',
    type: 'Cookie',
    status: 'valid',
    lastUse: '2 分钟前'
  },
  {
    name: '旧钢笔会话',
    domain: 'www.jiugangbi.com',
    icon: 'lock',
    iconColor: 'amber',
    type: 'Cookie',
    status: 'expiring',
    lastUse: '1 小时前'
  },
  {
    name: '本地代理',
    domain: 'http://127.0.0.1:7890',
    icon: 'proxy',
    iconColor: 'green',
    type: '代理',
    status: 'valid',
    lastUse: '使用中'
  },
  {
    name: '书城 API Token',
    domain: 'book.example.com',
    icon: 'lock',
    iconColor: 'mutedred',
    type: 'Token',
    status: 'invalid',
    lastUse: '3 天前'
  }
]
const statusMeta = {
  valid: { label: '有效', cls: 'valid' },
  expiring: { label: '即将过期', cls: 'expiring' },
  invalid: { label: '已失效', cls: 'invalid' }
}
const iconStroke = { amber: '#E0A85A', green: '#5dd9b8', mutedred: '#9a6a72' }
</script>

<template>
  <section class="view creds">
    <header class="head">
      <div class="head-row">
        <div>
          <h1>凭据管理</h1>
          <p class="sub">Cookie、Token 与代理凭据 · 本地 AES-256 加密,绝不上传</p>
        </div>
        <button type="button" class="btn-new">+ 新增凭据</button>
      </div>
    </header>

    <div class="body">
      <div class="info-bar">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#9d83ff" stroke-width="1.5">
          <rect x="3.2" y="7" width="9.6" height="6.5" rx="1.4" />
          <path d="M5.3 7V5a2.7 2.7 0 0 1 5.4 0v2" />
        </svg>
        <span class="ib-text">凭据使用系统密钥链加密存储。明文仅在发起请求时于内存中临时解密。</span>
      </div>

      <div class="table">
        <div class="t-head">
          <span>凭据 / 域名</span>
          <span>类型</span>
          <span>状态</span>
          <span>最近使用</span>
          <span class="r">操作</span>
        </div>
        <div v-for="(c, i) in creds" :key="c.name" class="t-row" :class="{ last: i === creds.length - 1 }">
          <div class="cred-id">
            <svg
              v-if="c.icon === 'lock'"
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              :stroke="iconStroke[c.iconColor]"
              stroke-width="1.5"
              class="ci">
              <rect x="3.5" y="7" width="9" height="6" rx="1.2" />
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
            </svg>
            <svg
              v-else
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              :stroke="iconStroke[c.iconColor]"
              stroke-width="1.5"
              class="ci">
              <circle cx="6" cy="6" r="2.6" />
              <path d="M7.9 7.9L12.5 12.5M11 10.5l1.6 1.6" />
            </svg>
            <div class="ci-text">
              <div class="cred-name">{{ c.name }}</div>
              <div class="cred-domain mono">{{ c.domain }}</div>
            </div>
          </div>
          <span class="type-cell">
            <span class="type-chip">{{ c.type }}</span>
          </span>
          <span class="status" :class="statusMeta[c.status].cls">
            <span class="sdot" />
            {{ statusMeta[c.status].label }}
          </span>
          <span class="last-use">{{ c.lastUse }}</span>
          <span class="actions">
            <span class="act-edit">编辑</span>
            <span class="act-del">删除</span>
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.creds {
  display: flex;
  flex-direction: column;
  height: 100%;
  line-height: normal;
}
.head {
  flex: none;
  padding: 22px 28px 16px;
}
.head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
.btn-new {
  height: 38px;
  padding: 0 16px;
  border-radius: 9px;
  border: none;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(124, 92, 252, 0.3);
}

.body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 28px 28px;
}

/* 加密提示条 */
.info-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(124, 92, 252, 0.07);
  border: 1px solid #2e2747;
  border-radius: 10px;
  padding: 11px 14px;
  margin-bottom: 16px;
}
.ib-text {
  font-size: 12px;
  color: #bdb4d8;
}

/* 表格 */
.table {
  background: #14141b;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}
.t-head,
.t-row {
  display: grid;
  grid-template-columns: 1fr 150px 130px 150px 90px;
  align-items: center;
}
.t-head {
  font-size: 11px;
  color: var(--text-dim);
  padding: 11px 16px;
  border-bottom: 1px solid #20202a;
  letter-spacing: 0.03em;
}
.t-head .r {
  text-align: right;
}
.t-row {
  padding: 13px 16px;
  border-bottom: 1px solid #1c1c24;
}
.t-row.last {
  border-bottom: 0;
}
.t-row:hover {
  background: #191921;
}
.cred-id {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.ci {
  flex: none;
}
.ci-text {
  min-width: 0;
}
.cred-name {
  font-size: 13px;
  color: var(--text);
}
.cred-domain {
  font-size: 10.5px;
  color: #8a86a6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.type-chip {
  font-size: 11px;
  color: #9a9aa6;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px 9px;
}
.status {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
}
.status.valid {
  color: #5dd9b8;
}
.status.expiring {
  color: #d8b27a;
}
.status.invalid {
  color: #f1837d;
}
.sdot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.status.valid .sdot {
  background: #34d399;
}
.status.expiring .sdot {
  background: var(--warning);
}
.status.invalid .sdot {
  background: var(--danger);
}
.last-use {
  font-size: 11.5px;
  color: var(--text-secondary);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  font-size: 11.5px;
  color: #7a7a87;
}
.act-edit {
  cursor: pointer;
}
.act-edit:hover {
  color: var(--accent-text);
}
.act-del {
  color: #cf8a8e;
  cursor: pointer;
}
.act-del:hover {
  color: var(--danger);
}
</style>
