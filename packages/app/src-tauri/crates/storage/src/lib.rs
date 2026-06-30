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
