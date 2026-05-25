/// 结构化错误码定义
///
/// 格式：{PREFIX}-{NNN}: {message}
/// 用于日志中的 grep-friendly 错误定位。
///
/// 用法：
/// ```rust
/// tracing::error!(code = error_codes::SCAN_001, path = %path, "failed to parse JSONL");
/// ```
///
/// 排查时：`grep "SCAN-001" logs/agent-panel.*.log`

// Session 扫描
pub const SCAN_001: &str = "SCAN-001"; // JSONL 解析失败
pub const SCAN_002: &str = "SCAN-002"; // 项目目录不可读
pub const SCAN_003: &str = "SCAN-003"; // 缓存文件损坏

// 数据加载
pub const LOAD_001: &str = "LOAD-001"; // Session 文件不存在
pub const LOAD_002: &str = "LOAD-002"; // 消息解析失败
pub const LOAD_003: &str = "LOAD-003"; // Subagent 文件不存在

// WebSocket
pub const WS_001: &str = "WS-001"; // 连接建立失败
pub const WS_002: &str = "WS-002"; // 消息发送失败
pub const WS_003: &str = "WS-003"; // 连接意外断开

// 搜索
pub const SRCH_001: &str = "SRCH-001"; // 搜索索引损坏
pub const SRCH_002: &str = "SRCH-002"; // mmap 映射失败

// 文件操作
pub const FILE_001: &str = "FILE-001"; // 软删除失败
pub const FILE_002: &str = "FILE-002"; // 恢复失败
pub const FILE_003: &str = "FILE-003"; // 永久删除安全检查失败

// 收藏
pub const FAV_001: &str = "FAV-001"; // 收藏文件写入失败
pub const FAV_002: &str = "FAV-002"; // 收藏文件读取失败

// 用量
pub const USG_001: &str = "USG-001"; // JSONL 扫描中断
pub const USG_002: &str = "USG-002"; // Token 计算异常
