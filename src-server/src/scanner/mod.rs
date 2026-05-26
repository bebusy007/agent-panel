pub mod extensions;
pub mod mcps;
pub mod session_loader;
pub mod sessions;
pub mod sessions_multi;
pub mod skills;

use std::path::PathBuf;
use std::sync::Mutex;

static HOME_OVERRIDE: Mutex<Option<PathBuf>> = Mutex::new(None);

/// 获取 HOME 目录，测试环境可通过 set_home_override 注入临时路径
pub fn home_dir() -> Option<PathBuf> {
    HOME_OVERRIDE
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .or_else(dirs::home_dir)
}

/// 仅测试使用：注入临时 HOME 路径以隔离文件系统操作
#[cfg(test)]
pub fn set_home_override(path: PathBuf) {
    if let Ok(mut g) = HOME_OVERRIDE.lock() {
        *g = Some(path);
    }
}
