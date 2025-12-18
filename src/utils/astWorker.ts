/**
 * AST Parser Worker - Runs PHP parsing in a separate context to avoid blocking UI
 * 
 * Note: VS Code extensions run in a single Node.js process, so we use
 * a promise-based approach with setImmediate to yield to the event loop
 * for large files, preventing UI freezes.
 */

import { parseTestsFromPhp, ParsedTest } from '../phpAstParser';

// Cache for parsed files to avoid re-parsing
const parseCache = new Map<string, { hash: number; result: ParsedTest[] }>();

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
 * Parse PHP content asynchronously, yielding to event loop for large files
 * Uses caching to avoid re-parsing unchanged content
 */
export async function parsePhpAsync(content: string, cacheKey?: string): Promise<ParsedTest[]> {
    const contentHash = hashContent(content);

    // Check cache first
    if (cacheKey) {
        const cached = parseCache.get(cacheKey);
        if (cached && cached.hash === contentHash) {
            return cached.result;
        }
    }

    // For small files (< 10KB), parse synchronously
    if (content.length < 10000) {
        const result = parseTestsFromPhp(content);
        if (cacheKey) {
            parseCache.set(cacheKey, { hash: contentHash, result });
        }
        return result;
    }

    // For larger files, yield to event loop before parsing
    return new Promise((resolve) => {
        setImmediate(() => {
            const result = parseTestsFromPhp(content);
            if (cacheKey) {
                parseCache.set(cacheKey, { hash: contentHash, result });
            }
            resolve(result);
        });
    });
}

/**
 * Clear the parse cache for a specific file or all files
 */
export function clearParseCache(cacheKey?: string): void {
    if (cacheKey) {
        parseCache.delete(cacheKey);
    } else {
        parseCache.clear();
    }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; keys: string[] } {
    return {
        size: parseCache.size,
        keys: Array.from(parseCache.keys())
    };
}
