//! 凭据加密命令:元信息(名称/域名/类型/状态)存 SQLite,**密文(Cookie/Token)存 OS 钥匙串**
//! (Windows 凭据管理器 / macOS Keychain)。credentialRef = 钥匙串账户 `cred-{id}`;密文绝不入
//! SQLite、也绝不出现在可分享的规则 JSON(core-ir 风险 #8 的分享安全底线)。

use keyring::Entry;
use serde::Deserialize;
use sift_storage::{CredentialRow, Db};
use tauri::State;

const KEYRING_SERVICE: &str = "Sift";

fn entry(id: i64) -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, &format!("cred-{id}")).map_err(|e| e.to_string())
}

/// 凭据元信息入参(单结构避多词命令参数坑;camelCase 对齐前端)。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CredInput {
    pub name: String,
    pub domain: String,
    pub cred_type: String,
    pub status: String,
}

/// 存一条凭据:元信息落库拿 id,密文写钥匙串;写钥匙串失败则回滚库行。返回 id。
#[tauri::command]
pub fn cred_save(db: State<Db>, meta: CredInput, secret: String) -> Result<i64, String> {
    let id = db
        .save_credential(&meta.name, &meta.domain, &meta.cred_type, &meta.status)
        .map_err(|e| e.to_string())?;
    if let Err(e) = entry(id).and_then(|en| en.set_password(&secret).map_err(|e| e.to_string())) {
        let _ = db.delete_credential(id);
        return Err(format!("密文写入钥匙串失败: {e}"));
    }
    Ok(id)
}

/// 更新一条凭据:元信息更新;仅当 secret 非空才更新钥匙串密文(编辑留空 = 保持原密文)。
#[tauri::command]
pub fn cred_update(
    db: State<Db>,
    id: i64,
    meta: CredInput,
    secret: String,
) -> Result<bool, String> {
    let ok = db
        .update_credential(id, &meta.name, &meta.domain, &meta.cred_type, &meta.status)
        .map_err(|e| e.to_string())?;
    if !secret.is_empty() {
        entry(id).and_then(|en| en.set_password(&secret).map_err(|e| e.to_string()))?;
    }
    Ok(ok)
}

/// 列出凭据元信息(不含密文)。
#[tauri::command]
pub fn cred_list(db: State<Db>) -> Result<Vec<CredentialRow>, String> {
    db.list_credentials().map_err(|e| e.to_string())
}

/// 读回密文(供运行时按 credentialRef 解密;UI 列表不调用)。
#[tauri::command]
pub fn cred_get(id: i64) -> Result<String, String> {
    entry(id)?.get_password().map_err(|e| e.to_string())
}

/// 删除:钥匙串密文 + 库元信息(钥匙串条目不存在则忽略)。
#[tauri::command]
pub fn cred_delete(db: State<Db>, id: i64) -> Result<bool, String> {
    if let Ok(en) = entry(id) {
        let _ = en.delete_credential();
    }
    db.delete_credential(id).map_err(|e| e.to_string())
}
