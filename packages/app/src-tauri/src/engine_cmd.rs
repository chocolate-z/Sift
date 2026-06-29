//! 采集引擎的 Tauri 命令接缝。前端 `invoke('engine_run_rule', { rule, inputs })`
//! 即可执行一条 Rule IR 拿到结构化结果。错误统一降为字符串供 IPC 序列化。
//!
//! 限速暂用不限速 client(规则级 rateLimit 接入待后续);凭据由前端传入已解密的
//! credentialRef→Cookie 映射,加密库握手待凭据存储小步。

use sift_engine::{run_rule, Credentials, HttpClient, Rule, RunOutput, VarScope};

/// 执行整条规则,返回友好列记录 + 每步原始记录 + 告警。
#[tauri::command]
pub async fn engine_run_rule(
    rule: Rule,
    inputs: Option<VarScope>,
    credentials: Option<Credentials>,
) -> Result<RunOutput, String> {
    let client = HttpClient::unlimited().map_err(|e| e.to_string())?;
    run_rule(
        &client,
        &rule,
        inputs.unwrap_or_default(),
        &credentials.unwrap_or_default(),
    )
    .await
    .map_err(|e| e.to_string())
}

/// 引擎版本(冒烟用,确认 IPC 接缝可达)。
#[tauri::command]
pub fn engine_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
