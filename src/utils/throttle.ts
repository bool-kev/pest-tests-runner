/**
 * Utility functions for performance optimization
 */

/**
 * Throttle a function to execute at most once every `delay` milliseconds
 * Uses trailing edge execution to ensure the last call is always executed
 */
export function throttle<T extends (...args: any[]) => void>(
    fn: T,
    delay: number
): T & { flush: () => void; cancel: () => void } {
    let lastCall = 0;
    let timeoutId: NodeJS.Timeout | undefined;
    let lastArgs: Parameters<T> | undefined;

    const throttled = ((...args: Parameters<T>) => {
        const now = Date.now();
        const remaining = delay - (now - lastCall);

        lastArgs = args;

        if (remaining <= 0) {
            // Execute immediately
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = undefined;
            }
            lastCall = now;
            fn(...args);
        } else if (!timeoutId) {
            // Schedule trailing call
            timeoutId = setTimeout(() => {
                lastCall = Date.now();
                timeoutId = undefined;
                if (lastArgs) {
                    fn(...lastArgs);
                }
            }, remaining);
        }
    }) as T & { flush: () => void; cancel: () => void };

    throttled.flush = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
            if (lastArgs) {
                lastCall = Date.now();
                fn(...lastArgs);
            }
        }
    };

    throttled.cancel = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
        }
    };

    return throttled;
}

/**
 * Debounce a function to execute only after `delay` milliseconds of inactivity
 */
export function debounce<T extends (...args: any[]) => void>(
    fn: T,
    delay: number
): T & { flush: () => void; cancel: () => void } {
    let timeoutId: NodeJS.Timeout | undefined;
    let lastArgs: Parameters<T> | undefined;

    const debounced = ((...args: Parameters<T>) => {
        lastArgs = args;

        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(() => {
            timeoutId = undefined;
            fn(...args);
        }, delay);
    }) as T & { flush: () => void; cancel: () => void };

    debounced.flush = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
            if (lastArgs) {
                fn(...lastArgs);
            }
        }
    };

    debounced.cancel = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
        }
    };

    return debounced;
}

/**
 * Simple LRU Cache implementation
 */
export class LRUCache<K, V> {
    private cache = new Map<K, V>();

    constructor(private maxSize: number) { }

    get(key: K): V | undefined {
        if (!this.cache.has(key)) {
            return undefined;
        }

        // Move to end (most recently used)
        const value = this.cache.get(key)!;
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key: K, value: V): void {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Delete oldest (first) entry
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(key, value);
    }

    has(key: K): boolean {
        return this.cache.has(key);
    }

    delete(key: K): boolean {
        return this.cache.delete(key);
    }

    clear(): void {
        this.cache.clear();
    }

    get size(): number {
        return this.cache.size;
    }
}
