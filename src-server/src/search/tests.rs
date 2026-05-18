#[cfg(test)]
mod tests {
    use super::super::full_text::*;
    use super::super::*;
    use std::fs;
    use std::io::Write;
    use tempfile::TempDir;

    fn sample_user_message(uuid: &str, session_id: &str, text: &str, ts: &str) -> String {
        format!(
            r#"{{"uuid":"{uuid}","sessionId":"{session_id}","type":"user","timestamp":"{ts}","message":{{"role":"user","content":"{text}"}}}}"#
        )
    }

    fn sample_assistant_message(uuid: &str, session_id: &str, text: &str, ts: &str) -> String {
        format!(
            r#"{{"uuid":"{uuid}","sessionId":"{session_id}","type":"assistant","timestamp":"{ts}","message":{{"role":"assistant","model":"claude-sonnet-4-20250514","content":[{{"type":"text","text":"{text}"}}]}}}}"#
        )
    }

    fn sample_tool_use_message(uuid: &str, session_id: &str, tool_name: &str, input_text: &str, ts: &str) -> String {
        format!(
            r#"{{"uuid":"{uuid}","sessionId":"{session_id}","type":"assistant","timestamp":"{ts}","message":{{"role":"assistant","content":[{{"type":"tool_use","name":"{tool_name}","input":{{"command":"{input_text}"}}}}]}}}}"#
        )
    }

    fn create_test_session(dir: &TempDir, project: &str, session_id: &str, lines: &[String]) -> std::path::PathBuf {
        let project_dir = dir.path().join("projects").join(project);
        fs::create_dir_all(&project_dir).unwrap();
        let file = project_dir.join(format!("{session_id}.jsonl"));
        let mut f = fs::File::create(&file).unwrap();
        for line in lines {
            writeln!(f, "{}", line).unwrap();
        }
        file
    }

    // Override home dir for tests by searching in a temp dir
    fn search_in_dir(dir: &std::path::Path, query: &str, filters: &SearchFilters, limit: Option<usize>) -> SearchResponse {
        use std::path::PathBuf;
        use walkdir::WalkDir;
        use rayon::prelude::*;
        use std::time::Instant;
        use aho_corasick::AhoCorasick;

        if query.is_empty() {
            return SearchResponse { query: query.to_string(), hits: vec![], total_matches: 0, search_time_ms: 0 };
        }

        let start = Instant::now();
        let max_results = limit.unwrap_or(100);
        let projects_path = dir.join("projects");

        let file_paths: Vec<PathBuf> = WalkDir::new(&projects_path)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("jsonl"))
            .map(|e| e.path().to_path_buf())
            .collect();

        let matcher = AhoCorasick::builder()
            .ascii_case_insensitive(true)
            .build([query])
            .unwrap();

        let mut all_hits: Vec<SearchHit> = file_paths
            .par_iter()
            .flat_map(|path| search_in_file(path, &matcher, query, filters))
            .collect();

        let total_matches = all_hits.len();
        all_hits.sort_by(|a, b| {
            let ta = a.timestamp.as_deref().unwrap_or("");
            let tb = b.timestamp.as_deref().unwrap_or("");
            tb.cmp(ta)
        });
        all_hits.truncate(max_results);

        SearchResponse {
            query: query.to_string(),
            hits: all_hits,
            total_matches,
            search_time_ms: start.elapsed().as_millis() as u64,
        }
    }

    #[test]
    fn test_basic_text_search() {
        let dir = TempDir::new().unwrap();
        create_test_session(&dir, "test-project", "session-1", &[
            sample_user_message("u1", "s1", "Hello Rust programming", "2026-05-01T10:00:00Z"),
            sample_assistant_message("a1", "s1", "Rust is a great language for systems programming", "2026-05-01T10:01:00Z"),
        ]);

        let filters = SearchFilters::default();
        let result = search_in_dir(dir.path(), "Rust", &filters, None);

        assert_eq!(result.total_matches, 2);
        assert!(result.hits[0].snippet.contains("<mark>"));
    }

    #[test]
    fn test_case_insensitive_search() {
        let dir = TempDir::new().unwrap();
        create_test_session(&dir, "proj", "s1", &[
            sample_user_message("u1", "s1", "HELLO World", "2026-05-01T10:00:00Z"),
        ]);

        let filters = SearchFilters::default();
        let result = search_in_dir(dir.path(), "hello", &filters, None);

        assert_eq!(result.total_matches, 1);
    }

    #[test]
    fn test_no_results() {
        let dir = TempDir::new().unwrap();
        create_test_session(&dir, "proj", "s1", &[
            sample_user_message("u1", "s1", "Hello World", "2026-05-01T10:00:00Z"),
        ]);

        let filters = SearchFilters::default();
        let result = search_in_dir(dir.path(), "nonexistent", &filters, None);

        assert_eq!(result.total_matches, 0);
        assert!(result.hits.is_empty());
    }

    #[test]
    fn test_message_type_filter_user_only() {
        let dir = TempDir::new().unwrap();
        create_test_session(&dir, "proj", "s1", &[
            sample_user_message("u1", "s1", "search term here", "2026-05-01T10:00:00Z"),
            sample_assistant_message("a1", "s1", "search term in response", "2026-05-01T10:01:00Z"),
        ]);

        let filters = SearchFilters {
            message_type: Some("user".to_string()),
            projects: vec![],
            date_from: None,
            date_to: None, ..Default::default()
        };
        let result = search_in_dir(dir.path(), "search term", &filters, None);

        assert_eq!(result.total_matches, 1);
        assert_eq!(result.hits[0].role, "user");
    }

    #[test]
    fn test_message_type_filter_assistant_only() {
        let dir = TempDir::new().unwrap();
        create_test_session(&dir, "proj", "s1", &[
            sample_user_message("u1", "s1", "search term here", "2026-05-01T10:00:00Z"),
            sample_assistant_message("a1", "s1", "search term in response", "2026-05-01T10:01:00Z"),
        ]);

        let filters = SearchFilters {
            message_type: Some("assistant".to_string()),
            projects: vec![],
            date_from: None,
            date_to: None, ..Default::default()
        };
        let result = search_in_dir(dir.path(), "search term", &filters, None);

        assert_eq!(result.total_matches, 1);
        assert_eq!(result.hits[0].role, "assistant");
    }

    #[test]
    fn test_project_filter() {
        let dir = TempDir::new().unwrap();
        create_test_session(&dir, "project-alpha", "s1", &[
            sample_user_message("u1", "s1", "target keyword", "2026-05-01T10:00:00Z"),
        ]);
        create_test_session(&dir, "project-beta", "s2", &[
            sample_user_message("u2", "s2", "target keyword", "2026-05-01T10:00:00Z"),
        ]);

        let filters = SearchFilters {
            message_type: None,
            projects: vec!["alpha".to_string()],
            date_from: None,
            date_to: None, ..Default::default()
        };
        let result = search_in_dir(dir.path(), "target keyword", &filters, None);

        assert_eq!(result.total_matches, 1);
        assert_eq!(result.hits[0].project_name, Some("project-alpha".to_string()));
    }

    #[test]
    fn test_date_filter() {
        let dir = TempDir::new().unwrap();
        create_test_session(&dir, "proj", "s1", &[
            sample_user_message("u1", "s1", "old message", "2026-01-01T10:00:00Z"),
            sample_user_message("u2", "s1", "new message", "2026-05-01T10:00:00Z"),
        ]);

        let filters = SearchFilters {
            message_type: None,
            projects: vec![],
            date_from: Some("2026-04-01T00:00:00Z".to_string()),
            date_to: None, ..Default::default()
        };
        let result = search_in_dir(dir.path(), "message", &filters, None);

        assert_eq!(result.total_matches, 1);
        assert!(result.hits[0].snippet.contains("new"));
    }

    #[test]
    fn test_limit() {
        let dir = TempDir::new().unwrap();
        let lines: Vec<String> = (0..50)
            .map(|i| sample_user_message(&format!("u{i}"), "s1", &format!("match item {i}"), "2026-05-01T10:00:00Z"))
            .collect();
        create_test_session(&dir, "proj", "s1", &lines);

        let filters = SearchFilters::default();
        let result = search_in_dir(dir.path(), "match item", &filters, Some(10));

        assert_eq!(result.total_matches, 50);
        assert_eq!(result.hits.len(), 10);
    }

    #[test]
    fn test_tool_use_content_search() {
        let dir = TempDir::new().unwrap();
        create_test_session(&dir, "proj", "s1", &[
            sample_tool_use_message("t1", "s1", "Bash", "npm install react", "2026-05-01T10:00:00Z"),
        ]);

        let filters = SearchFilters::default();
        let result = search_in_dir(dir.path(), "npm install", &filters, None);

        assert_eq!(result.total_matches, 1);
    }

    #[test]
    fn test_snippet_contains_highlight_mark() {
        let dir = TempDir::new().unwrap();
        create_test_session(&dir, "proj", "s1", &[
            sample_user_message("u1", "s1", "This is a test with keyword inside", "2026-05-01T10:00:00Z"),
        ]);

        let filters = SearchFilters::default();
        let result = search_in_dir(dir.path(), "keyword", &filters, None);

        assert_eq!(result.total_matches, 1);
        assert!(result.hits[0].snippet.contains("<mark>keyword</mark>"));
    }

    #[test]
    fn test_results_sorted_by_timestamp_desc() {
        let dir = TempDir::new().unwrap();
        create_test_session(&dir, "proj", "s1", &[
            sample_user_message("u1", "s1", "common word", "2026-01-01T10:00:00Z"),
            sample_user_message("u2", "s1", "common word", "2026-03-01T10:00:00Z"),
            sample_user_message("u3", "s1", "common word", "2026-05-01T10:00:00Z"),
        ]);

        let filters = SearchFilters::default();
        let result = search_in_dir(dir.path(), "common word", &filters, None);

        assert_eq!(result.total_matches, 3);
        // Most recent first
        assert!(result.hits[0].timestamp.as_deref().unwrap() > result.hits[1].timestamp.as_deref().unwrap());
        assert!(result.hits[1].timestamp.as_deref().unwrap() > result.hits[2].timestamp.as_deref().unwrap());
    }

    #[test]
    fn test_multi_file_parallel_search() {
        let dir = TempDir::new().unwrap();
        for i in 0..10 {
            create_test_session(&dir, &format!("project-{i}"), &format!("session-{i}"), &[
                sample_user_message(&format!("u{i}"), &format!("s{i}"), &format!("parallel test {i}"), "2026-05-01T10:00:00Z"),
            ]);
        }

        let filters = SearchFilters::default();
        let result = search_in_dir(dir.path(), "parallel test", &filters, None);

        assert_eq!(result.total_matches, 10);
    }

    #[test]
    fn test_chinese_text_search() {
        let dir = TempDir::new().unwrap();
        create_test_session(&dir, "proj", "s1", &[
            sample_user_message("u1", "s1", "我想搜索中文内容", "2026-05-01T10:00:00Z"),
            sample_assistant_message("a1", "s1", "这是中文响应", "2026-05-01T10:01:00Z"),
        ]);

        let filters = SearchFilters::default();
        let result = search_in_dir(dir.path(), "中文", &filters, None);

        assert_eq!(result.total_matches, 2);
    }

    #[test]
    fn test_empty_query_returns_nothing() {
        let dir = TempDir::new().unwrap();
        create_test_session(&dir, "proj", "s1", &[
            sample_user_message("u1", "s1", "some content", "2026-05-01T10:00:00Z"),
        ]);

        let filters = SearchFilters::default();
        let result = search_in_dir(dir.path(), "", &filters, None);

        assert_eq!(result.total_matches, 0);
    }

    #[test]
    fn test_search_response_includes_timing() {
        let dir = TempDir::new().unwrap();
        create_test_session(&dir, "proj", "s1", &[
            sample_user_message("u1", "s1", "timing test", "2026-05-01T10:00:00Z"),
        ]);

        let filters = SearchFilters::default();
        let result = search_in_dir(dir.path(), "timing", &filters, None);

        // search_time_ms should be a reasonable value (not 0 typically, but could be on fast systems)
        assert!(result.search_time_ms < 5000); // sanity: shouldn't take 5 seconds
    }
}
