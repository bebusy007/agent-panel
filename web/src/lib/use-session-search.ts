import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Message, MessageRole } from './api';
import { canonicalTool } from './tool-aliases';

export type FilterRole = MessageRole | 'subagent' | 'image';
export const ALL_FILTERS: FilterRole[] = [
  'user',
  'assistant',
  'tool_use',
  'subagent',
  'tool_result',
  'system',
  'meta',
  'image',
];

function messageBodyText(m: Message): string {
  switch (m.role) {
    case 'assistant':
      return m.text || '';
    case 'tool_use':
      return m.toolInput != null
        ? typeof m.toolInput === 'string'
          ? m.toolInput
          : JSON.stringify(m.toolInput, null, 2)
        : '';
    case 'tool_result':
      return m.toolOutput || m.text || '';
    default:
      return m.text || '';
  }
}

function countOccurrences(haystack: string, needle: string): number {
  if (!haystack || !needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let count = 0;
  let from = 0;
  while (from < h.length) {
    const idx = h.indexOf(n, from);
    if (idx < 0) break;
    count++;
    from = idx + n.length;
  }
  return count;
}

export interface NavTarget {
  msgIdx: number;
  localIdx: number;
  nonce: number;
}

export interface SessionSearchState {
  search: string;
  setSearch: (q: string) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  selectedRoles: Set<FilterRole>;
  toggleRole: (r: FilterRole) => void;
  filtered: Message[];
  searchActive: boolean;
  searchMatchTotal: number;
  searchActiveIndex: number;
  navigateSearch: (direction: 'next' | 'prev') => void;
  navTarget: NavTarget | null;
}

export function useSessionSearch(allMessages: Message[]): SessionSearchState {
  const [selectedRoles, setSelectedRoles] = useState<Set<FilterRole>>(new Set(ALL_FILTERS));
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchActiveIndex, setSearchActiveIndex] = useState(-1);
  const [searchNavNonce, setSearchNavNonce] = useState(0);

  const filtered = useMemo(() => {
    let arr = allMessages;
    if (selectedRoles.size < ALL_FILTERS.length) {
      arr = arr.filter((m) => {
        const hasImages = (m.images?.length ?? 0) > 0;
        if (hasImages && !selectedRoles.has('image')) return false;
        const isSubagent = m.role === 'tool_use' && canonicalTool(m.toolName) === 'Task';
        if (isSubagent) return selectedRoles.has('subagent');
        if (m.role === 'tool_result' && m.toolUseId) {
          const parent = allMessages.find(
            (p) => p.role === 'tool_use' && p.toolUseId === m.toolUseId,
          );
          if (parent && canonicalTool(parent.toolName) === 'Task') {
            return selectedRoles.has('subagent');
          }
        }
        return selectedRoles.has(m.role);
      });
    }
    if (search.trim().length >= 2) {
      const q = search.toLowerCase();
      arr = arr.filter((m) => {
        if (m.text?.toLowerCase().includes(q)) return true;
        if (m.toolName?.toLowerCase().includes(q)) return true;
        if (m.toolOutput?.toLowerCase().includes(q)) return true;
        if (typeof m.toolInput === 'string' && m.toolInput.toLowerCase().includes(q)) return true;
        if (m.toolInput && typeof m.toolInput !== 'string') {
          try {
            if (JSON.stringify(m.toolInput).toLowerCase().includes(q)) return true;
          } catch {
            // unserializable — skip
          }
        }
        return false;
      });
    }
    return arr;
  }, [allMessages, selectedRoles, search]);

  const { messageCounts, cumOffsets, searchMatchTotal } = useMemo(() => {
    const q = search.trim();
    if (q.length < 2) {
      return {
        messageCounts: [] as number[],
        cumOffsets: [0],
        searchMatchTotal: 0,
      };
    }
    const counts = filtered.map((m) => countOccurrences(messageBodyText(m), q));
    const offsets: number[] = [0];
    for (let i = 0; i < counts.length; i++) offsets.push(offsets[i]! + counts[i]!);
    return {
      messageCounts: counts,
      cumOffsets: offsets,
      searchMatchTotal: offsets[offsets.length - 1]!,
    };
  }, [filtered, search]);

  useEffect(() => {
    setSearchActiveIndex(searchMatchTotal > 0 ? 0 : -1);
    setSearchNavNonce((n) => n + 1);
  }, [search, searchMatchTotal]);

  const navigateSearch = useCallback(
    (direction: 'next' | 'prev') => {
      if (searchMatchTotal <= 0) return;
      setSearchActiveIndex((cur) => {
        if (cur < 0) return 0;
        if (direction === 'next') return cur + 1 >= searchMatchTotal ? 0 : cur + 1;
        return cur - 1 < 0 ? searchMatchTotal - 1 : cur - 1;
      });
      setSearchNavNonce((n) => n + 1);
    },
    [searchMatchTotal],
  );

  const navTarget = useMemo(() => {
    if (searchActiveIndex < 0 || cumOffsets.length < 2) return null;
    for (let i = 0; i < messageCounts.length; i++) {
      if (searchActiveIndex >= cumOffsets[i]! && searchActiveIndex < cumOffsets[i + 1]!) {
        return {
          msgIdx: i,
          localIdx: searchActiveIndex - cumOffsets[i]!,
          nonce: searchNavNonce,
        };
      }
    }
    return null;
  }, [searchActiveIndex, cumOffsets, messageCounts, searchNavNonce]);

  const toggleRole = useCallback((r: FilterRole) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(r)) {
        if (next.size === 1) return prev;
        next.delete(r);
      } else {
        next.add(r);
      }
      return next;
    });
  }, []);

  const searchActive = !!search.trim();

  return {
    search,
    setSearch,
    searchOpen,
    setSearchOpen,
    selectedRoles,
    toggleRole,
    filtered,
    searchActive,
    searchMatchTotal,
    searchActiveIndex,
    navigateSearch,
    navTarget,
  };
}
