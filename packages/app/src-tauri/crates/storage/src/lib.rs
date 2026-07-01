//! Sift 本地持久化(SQLite / rusqlite)。把引擎跑出的数据集存盘、列出、读回、删除,
//! 跨重启留存。`columns`/`rows` 以 JSON 字符串透明存储,存储层不关心其结构(前端序列化)。
//!
//! 连接以 `Mutex` 包裹以满足 Tauri State 的 Send+Sync(rusqlite Connection 非 Sync)。

use std::path::Path;
use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;

pub type Result<T> = std::result::Result<T, rusqlite::Error>;

/// 已存数据集的元信息(列表用)。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatasetMeta {
    pub id: i64,
    pub name: String,
    pub source: String,
    pub row_count: i64,
    pub created_at: String,
}

/// 数据集主体(读回用):列与行的 JSON 字符串。
#[derive(Debug, Clone, Serialize)]
pub struct DatasetBlob {
    pub columns: String,
    pub rows: String,
}

/// 一条已完成记录(导出/下载产物;列表 + 跨重启留存用)。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletedRow {
    pub id: i64,
    pub name: String,
    pub file_type: String,
    pub icon: String,
    pub path: String,
    pub size: String,
    pub count: String,
    pub source: String,
    pub created_at: String,
}

/// 已存采集规则的元信息(列表用;规则 JSON 主体另存)。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleMeta {
    pub id: i64,
    pub name: String,
    pub created_at: String,
}

/// 一条凭据的元信息(**不含密文**——密文进 OS 钥匙串,这里只存可列出的元数据)。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialRow {
    pub id: i64,
    pub name: String,
    pub domain: String,
    pub cred_type: String,
    pub status: String,
    pub created_at: String,
}

pub struct Db {
    conn: Mutex<Connection>,
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS saved_datasets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    source     TEXT NOT NULL DEFAULT '',
    columns    TEXT NOT NULL,
    rows       TEXT NOT NULL,
    row_count  INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS completed_records (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    file_type  TEXT NOT NULL DEFAULT '',
    icon       TEXT NOT NULL DEFAULT '',
    path       TEXT NOT NULL DEFAULT '',
    size       TEXT NOT NULL DEFAULT '',
    count      TEXT NOT NULL DEFAULT '',
    source     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS credentials (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    domain     TEXT NOT NULL DEFAULT '',
    cred_type  TEXT NOT NULL DEFAULT 'Cookie',
    status     TEXT NOT NULL DEFAULT 'valid',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS saved_rules (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    json       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"#;

impl Db {
    /// 打开磁盘库(自动建父目录由调用方负责)并迁移。
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        Self::from_conn(conn)
    }

    /// 内存库(测试)。
    pub fn open_in_memory() -> Result<Self> {
        Self::from_conn(Connection::open_in_memory()?)
    }

    fn from_conn(conn: Connection) -> Result<Self> {
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().expect("db mutex poisoned")
    }

    /// 存一个数据集,返回新 id。
    pub fn save_dataset(
        &self,
        name: &str,
        source: &str,
        columns: &str,
        rows: &str,
        row_count: i64,
    ) -> Result<i64> {
        let conn = self.lock();
        conn.execute(
            "INSERT INTO saved_datasets (name, source, columns, rows, row_count) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![name, source, columns, rows, row_count],
        )?;
        Ok(conn.last_insert_rowid())
    }

    /// 列出已存数据集(新→旧)。
    pub fn list_datasets(&self) -> Result<Vec<DatasetMeta>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT id, name, source, row_count, created_at FROM saved_datasets ORDER BY id DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(DatasetMeta {
                id: r.get(0)?,
                name: r.get(1)?,
                source: r.get(2)?,
                row_count: r.get(3)?,
                created_at: r.get(4)?,
            })
        })?;
        rows.collect()
    }

    /// 按 id 读回数据集主体;不存在返回 None。
    pub fn load_dataset(&self, id: i64) -> Result<Option<DatasetBlob>> {
        let conn = self.lock();
        let mut stmt = conn.prepare("SELECT columns, rows FROM saved_datasets WHERE id = ?1")?;
        let mut rows = stmt.query(rusqlite::params![id])?;
        match rows.next()? {
            Some(r) => Ok(Some(DatasetBlob {
                columns: r.get(0)?,
                rows: r.get(1)?,
            })),
            None => Ok(None),
        }
    }

    /// 删除一个数据集,返回是否删到。
    pub fn delete_dataset(&self, id: i64) -> Result<bool> {
        let conn = self.lock();
        let n = conn.execute(
            "DELETE FROM saved_datasets WHERE id = ?1",
            rusqlite::params![id],
        )?;
        Ok(n > 0)
    }

    /// 存一条已完成记录,返回新 id。
    #[allow(clippy::too_many_arguments)]
    pub fn save_completed(
        &self,
        name: &str,
        file_type: &str,
        icon: &str,
        path: &str,
        size: &str,
        count: &str,
        source: &str,
    ) -> Result<i64> {
        let conn = self.lock();
        conn.execute(
            "INSERT INTO completed_records (name, file_type, icon, path, size, count, source) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![name, file_type, icon, path, size, count, source],
        )?;
        Ok(conn.last_insert_rowid())
    }

    /// 列出已完成记录(新→旧)。
    pub fn list_completed(&self) -> Result<Vec<CompletedRow>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT id, name, file_type, icon, path, size, count, source, created_at \
             FROM completed_records ORDER BY id DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(CompletedRow {
                id: r.get(0)?,
                name: r.get(1)?,
                file_type: r.get(2)?,
                icon: r.get(3)?,
                path: r.get(4)?,
                size: r.get(5)?,
                count: r.get(6)?,
                source: r.get(7)?,
                created_at: r.get(8)?,
            })
        })?;
        rows.collect()
    }

    /// 删除一条已完成记录,返回是否删到。
    pub fn delete_completed(&self, id: i64) -> Result<bool> {
        let conn = self.lock();
        let n = conn.execute(
            "DELETE FROM completed_records WHERE id = ?1",
            rusqlite::params![id],
        )?;
        Ok(n > 0)
    }

    /// 存一条凭据元信息(密文另存钥匙串),返回新 id。
    pub fn save_credential(
        &self,
        name: &str,
        domain: &str,
        cred_type: &str,
        status: &str,
    ) -> Result<i64> {
        let conn = self.lock();
        conn.execute(
            "INSERT INTO credentials (name, domain, cred_type, status) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![name, domain, cred_type, status],
        )?;
        Ok(conn.last_insert_rowid())
    }

    /// 列出凭据元信息(新→旧;不含密文)。
    pub fn list_credentials(&self) -> Result<Vec<CredentialRow>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT id, name, domain, cred_type, status, created_at FROM credentials ORDER BY id DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(CredentialRow {
                id: r.get(0)?,
                name: r.get(1)?,
                domain: r.get(2)?,
                cred_type: r.get(3)?,
                status: r.get(4)?,
                created_at: r.get(5)?,
            })
        })?;
        rows.collect()
    }

    /// 更新一条凭据元信息(密文另在钥匙串更新),返回是否更到。
    pub fn update_credential(
        &self,
        id: i64,
        name: &str,
        domain: &str,
        cred_type: &str,
        status: &str,
    ) -> Result<bool> {
        let conn = self.lock();
        let n = conn.execute(
            "UPDATE credentials SET name = ?2, domain = ?3, cred_type = ?4, status = ?5 WHERE id = ?1",
            rusqlite::params![id, name, domain, cred_type, status],
        )?;
        Ok(n > 0)
    }

    /// 删除一条凭据元信息,返回是否删到。
    pub fn delete_credential(&self, id: i64) -> Result<bool> {
        let conn = self.lock();
        let n = conn.execute("DELETE FROM credentials WHERE id = ?1", rusqlite::params![id])?;
        Ok(n > 0)
    }

    /// 存一条采集规则(name + 原始 JSON 文本),返回新 id。
    pub fn save_rule(&self, name: &str, json: &str) -> Result<i64> {
        let conn = self.lock();
        conn.execute(
            "INSERT INTO saved_rules (name, json) VALUES (?1, ?2)",
            rusqlite::params![name, json],
        )?;
        Ok(conn.last_insert_rowid())
    }

    /// 列出已存规则(新→旧;不含 JSON 主体)。
    pub fn list_rules(&self) -> Result<Vec<RuleMeta>> {
        let conn = self.lock();
        let mut stmt =
            conn.prepare("SELECT id, name, created_at FROM saved_rules ORDER BY id DESC")?;
        let rows = stmt.query_map([], |r| {
            Ok(RuleMeta {
                id: r.get(0)?,
                name: r.get(1)?,
                created_at: r.get(2)?,
            })
        })?;
        rows.collect()
    }

    /// 按 id 读回规则 JSON 主体;不存在返回 None。
    pub fn load_rule(&self, id: i64) -> Result<Option<String>> {
        let conn = self.lock();
        let mut stmt = conn.prepare("SELECT json FROM saved_rules WHERE id = ?1")?;
        let mut rows = stmt.query(rusqlite::params![id])?;
        match rows.next()? {
            Some(r) => Ok(Some(r.get(0)?)),
            None => Ok(None),
        }
    }

    /// 删除一条规则,返回是否删到。
    pub fn delete_rule(&self, id: i64) -> Result<bool> {
        let conn = self.lock();
        let n = conn.execute("DELETE FROM saved_rules WHERE id = ?1", rusqlite::params![id])?;
        Ok(n > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_list_load_delete_roundtrip() {
        let db = Db::open_in_memory().unwrap();
        let id = db
            .save_dataset(
                "七猫·剑来",
                "七猫中文网",
                r#"[{"name":"书名","field":"书名"}]"#,
                r#"[{"书名":"剑来"}]"#,
                1,
            )
            .unwrap();
        assert!(id > 0);

        let list = db.list_datasets().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "七猫·剑来");
        assert_eq!(list[0].row_count, 1);
        assert!(!list[0].created_at.is_empty());

        let blob = db.load_dataset(id).unwrap().unwrap();
        assert!(blob.rows.contains("剑来"));
        assert!(blob.columns.contains("书名"));

        assert!(db.delete_dataset(id).unwrap());
        assert!(db.load_dataset(id).unwrap().is_none());
        assert_eq!(db.list_datasets().unwrap().len(), 0);
    }

    #[test]
    fn completed_save_list_delete_roundtrip() {
        let db = Db::open_in_memory().unwrap();
        let id = db
            .save_completed("示例列表.txt", "文本", "txt", "/dl/Sift/a.txt", "12 KB", "8 条", "示例源")
            .unwrap();
        assert!(id > 0);

        let list = db.list_completed().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "示例列表.txt");
        assert_eq!(list[0].icon, "txt");
        assert_eq!(list[0].count, "8 条");
        assert!(!list[0].created_at.is_empty());

        assert!(db.delete_completed(id).unwrap());
        assert_eq!(db.list_completed().unwrap().len(), 0);
        assert!(!db.delete_completed(999).unwrap());
    }

    #[test]
    fn credential_meta_crud_roundtrip() {
        let db = Db::open_in_memory().unwrap();
        let id = db.save_credential("站点 Cookie", "www.example.com", "Cookie", "valid").unwrap();
        assert!(id > 0);

        let list = db.list_credentials().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "站点 Cookie");
        assert_eq!(list[0].cred_type, "Cookie");
        assert!(!list[0].created_at.is_empty());

        assert!(db.update_credential(id, "站点 Cookie", "www.example.com", "Token", "expiring").unwrap());
        let updated = db.list_credentials().unwrap();
        assert_eq!(updated[0].cred_type, "Token");
        assert_eq!(updated[0].status, "expiring");

        assert!(db.delete_credential(id).unwrap());
        assert_eq!(db.list_credentials().unwrap().len(), 0);
        assert!(!db.delete_credential(999).unwrap());
    }

    #[test]
    fn rule_save_list_load_delete_roundtrip() {
        let db = Db::open_in_memory().unwrap();
        let id = db.save_rule("示例采集源", r#"{"source_name":"示例采集源","search_url":"x"}"#).unwrap();
        assert!(id > 0);

        let list = db.list_rules().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "示例采集源");
        assert!(!list[0].created_at.is_empty());

        let json = db.load_rule(id).unwrap().unwrap();
        assert!(json.contains("示例采集源"));
        assert!(json.contains("search_url"));

        assert!(db.delete_rule(id).unwrap());
        assert!(db.load_rule(id).unwrap().is_none());
        assert_eq!(db.list_rules().unwrap().len(), 0);
        assert!(!db.delete_rule(999).unwrap());
    }

    #[test]
    fn list_orders_newest_first() {
        let db = Db::open_in_memory().unwrap();
        db.save_dataset("a", "s", "[]", "[]", 0).unwrap();
        let id2 = db.save_dataset("b", "s", "[]", "[]", 0).unwrap();
        let list = db.list_datasets().unwrap();
        assert_eq!(list[0].id, id2);
        assert_eq!(list[0].name, "b");
    }

    #[test]
    fn delete_missing_returns_false() {
        let db = Db::open_in_memory().unwrap();
        assert!(!db.delete_dataset(999).unwrap());
    }
}
