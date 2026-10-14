/**
 * AST Parser Worker - Centralized PHP parsing with caching
 * 
 * Provides a single entry point for parsing PHP test files with:
 * - LRU cache (50 files) to avoid re-parsing
 * - Version-based cache invalidation for VS Code documents
 * - Content hash fallback for non-document sources
 */

import { parseTestsFromPhp, ParsedTest } from '../phpAstParser';
import { LRUCache } from './throttle';

// Centralized cache for parsed files - shared across all components
const parseCache = new LRUCache<string, { hash: number; version?: number; result: ParsedTest[] }>(50);

/**
 * Simple hash function for content comparison
 */
function hashContent(content: string): number {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
}

/**
 * Parse PHP content with caching - THE single entry point for all parsing
 * 
 * @param content - The PHP file content
 * @param cacheKey - Unique key for caching (typically document URI)
 * @param version - Optional document version for faster cache lookup
 * @returns Array of parsed tests
 */
export function parsePhpCached(content: string, cacheKey: string, version?: number): ParsedTest[] {
    // Fast path: check by version first (for VS Code documents)
    if (version !== undefined) {
        const cached = parseCache.get(cacheKey);
        if (cached && cached.version === version) {
            return cached.result;
        }
    }
    
    // Check by content hash (handles external file changes)
    const contentHash = hashContent(content);
    const cached = parseCache.get(cacheKey);
    if (cached && cached.hash === contentHash) {
        // Update version in cache if provided (for next fast-path lookup)
        if (version !== undefined && cached.version !== version) {
            parseCache.set(cacheKey, { ...cached, version });
        }
        return cached.result;
    }
    
    // Cache miss - parse and store
    const result = parseTestsFromPhp(content);
    parseCache.set(cacheKey, { hash: contentHash, version, result });
    return result;
}

/**
 * Warmup the parser by pre-parsing content
 * Call this during extension activation for the active file
 */
export function warmupParse(content: string, cacheKey: string): void {
    const contentHash = hashContent(content);
    
    // Skip if already cached
    const cached = parseCache.get(cacheKey);
    if (cached && cached.hash === contentHash) {
        return;
    }
    
    // Parse and cache
    const result = parseTestsFromPhp(content);
    parseCache.set(cacheKey, { hash: contentHash, result });
}
