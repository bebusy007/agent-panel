//! Persistent search index with incremental updates.
//!
//! Inspired by OpenCovibe's manifest-based approach:
//! - Stores index as prompt-index.jsonl on disk
//! - Manifest tracks each file's mtime + size
//! - Only re-scans files that changed since last build
//!
//! This is used for pre-built lookups (autocomplete, stats).
//! For full-text search, we use the direct mmap scanner (full_text.rs)
//! which is fast enough in real-time.

// TODO: implement persistent index for autocomplete and stats
// For now, the full_text.rs direct scanner handles all search needs.
