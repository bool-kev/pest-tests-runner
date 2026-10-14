import * as parser from 'php-parser';

/**
 * Interface for parsed test information
 */
export interface ParsedTest {
    /** Name as written in the source (PHP escapes already resolved) */
    name: string;
    /** 0-based line of the call */
    line: number;
    type: 'test' | 'it' | 'describe';
    /** 0-based last line of the call, including chained methods (->with(), ->skip()...) */
    endLine: number;
    /** Names of the enclosing describe blocks, outermost first */
    parents: string[];
    /**
     * Full description as reported by Pest (and used in Teamcity locationHint), e.g.
     * "`Outer` → `Inner` → it does something". For describes: "`Outer` → `Inner`".
     */
    pestId: string;
    /** Methods chained on the call, e.g. ['with', 'skip'] */
    modifiers: string[];
}

const TEST_FUNCTIONS = new Set(['test', 'it', 'describe']);
const QUICK_CHECK = /\b(?:test|it|describe)\s*\(/;
const DESCRIBE_SEPARATOR = ' → ';

let engine: parser.Engine | undefined;

function getEngine(): parser.Engine {
    if (!engine) {
        engine = new parser.Engine({
            parser: {
                extractDoc: false,
                suppressErrors: true, // Don't throw on syntax errors
            },
            ast: {
                withPositions: true,
            },
        });
    }
    return engine;
}

/**
 * Parse PHP file content using AST to extract test and describe blocks
 */
export function parseTestsFromPhp(content: string): ParsedTest[] {
    const tests: ParsedTest[] = [];

    // Fast path: files without any test()/it()/describe() call don't need an AST
    if (!QUICK_CHECK.test(content)) {
        return tests;
    }

    try {
        const ast = getEngine().parseCode(content, 'test.php');
        traverse(ast, [], new Map(), tests);
    } catch (error) {
        console.error('[AST Parser] Error parsing PHP:', error);
    }

    return tests;
}

/**
 * Build the Pest description of a test or describe block
 */
export function buildPestId(type: ParsedTest['type'], name: string, parents: string[]): string {
    const ownPart = type === 'describe' ? `\`${name}\`` : type === 'it' ? `it ${name}` : name;
    const parentPart = parents.map(parent => `\`${parent}\``);
    return [...parentPart, ownPart].join(DESCRIBE_SEPARATOR);
}

/**
 * Recursively traverse AST nodes to find test/describe calls.
 * `chains` maps a test call node to the methods chained on it and the end line of the whole chain.
 */
function traverse(
    node: any,
    parents: string[],
    chains: Map<any, { modifiers: string[]; endLine: number }>,
    tests: ParsedTest[]
): void {
    if (!node || typeof node !== 'object') {
        return;
    }

    if (node.kind === 'call') {
        recordChain(node, chains);

        const funcName = getFunctionName(node);
        if (funcName && TEST_FUNCTIONS.has(funcName)) {
            const type = funcName as ParsedTest['type'];
            const name = extractTestName(node);
            const chain = chains.get(node);

            if (name !== null) {
                tests.push({
                    name,
                    line: (node.loc?.start?.line || 1) - 1,
                    endLine: (chain?.endLine ?? node.loc?.end?.line ?? 1) - 1,
                    type,
                    parents,
                    pestId: buildPestId(type, name, parents),
                    modifiers: chain?.modifiers ?? [],
                });
            }

            if (type === 'describe') {
                // Tests inside a describe whose name can't be resolved can't be matched with Pest output
                if (name !== null) {
                    const childParents = [...parents, name];
                    for (const arg of node.arguments || []) {
                        traverse(arg, childParents, chains, tests);
                    }
                }
                return;
            }
        }
    }

    for (const key in node) {
        if (key === 'loc' || key === 'kind') {
            continue;
        }

        const value = node[key];
        if (Array.isArray(value)) {
            for (const item of value) {
                traverse(item, parents, chains, tests);
            }
        } else if (typeof value === 'object') {
            traverse(value, parents, chains, tests);
        }
    }
}

/**
 * For a chained call like test(...)->with(...)->skip(), remember on the inner test() node
 * which methods were chained and where the whole statement ends.
 * Called on the outermost call first (pre-order traversal), so the end line is the chain's end.
 */
function recordChain(node: any, chains: Map<any, { modifiers: string[]; endLine: number }>): void {
    if (node.what?.kind !== 'propertylookup' && node.what?.kind !== 'nullsafepropertylookup') {
        return;
    }

    const modifiers: string[] = [];
    let current = node;
    while (current?.kind === 'call' &&
        (current.what?.kind === 'propertylookup' || current.what?.kind === 'nullsafepropertylookup')) {
        const methodName = current.what.offset?.name;
        if (typeof methodName === 'string') {
            modifiers.unshift(methodName);
        }
        current = current.what.what;
    }

    if (current?.kind === 'call' && !chains.has(current)) {
        chains.set(current, { modifiers, endLine: node.loc?.end?.line ?? current.loc?.end?.line ?? 1 });
    }
}

/**
 * Extract function name from call node
 */
function getFunctionName(callNode: any): string | null {
    const what = callNode.what;
    if (what && (what.kind === 'name' || what.kind === 'identifier') && typeof what.name === 'string') {
        return what.name;
    }
    return null;
}

/**
 * Extract test name from first argument of test/describe call
 */
function extractTestName(callNode: any): string | null {
    if (!callNode.arguments || callNode.arguments.length === 0) {
        return null;
    }
    return extractStringValue(callNode.arguments[0]);
}

/**
 * Extract string value from AST node
 * Handles: string literals, concatenation. Interpolated strings and variables can't be
 * resolved statically and return null (better no test than a wrong name).
 */
function extractStringValue(node: any): string | null {
    if (!node) {
        return null;
    }

    if (node.kind === 'string') {
        // php-parser's own unescaping of double-quoted strings is unreliable, decode from raw
        if (typeof node.raw === 'string' && node.raw.length >= 2) {
            const quote = node.raw[0];
            const body = node.raw.slice(1, -1);
            if (quote === "'") {
                return unescapeSingleQuoted(body);
            }
            if (quote === '"') {
                return unescapeDoubleQuoted(body);
            }
        }
        return typeof node.value === 'string' ? node.value : null;
    }

    if (node.kind === 'nowdoc') {
        return typeof node.value === 'string' ? node.value : null;
    }

    if (node.kind === 'bin' && node.type === '.') {
        const left = extractStringValue(node.left);
        const right = extractStringValue(node.right);
        if (left !== null && right !== null) {
            return left + right;
        }
    }

    return null;
}

/**
 * PHP single-quoted string semantics: only \' and \\ are escapes
 */
export function unescapeSingleQuoted(body: string): string {
    return body.replace(/\\([\\'])/g, '$1');
}

const DOUBLE_QUOTED_ESCAPES: Record<string, string> = {
    n: '\n', t: '\t', r: '\r', v: '\v', e: '\x1b', f: '\f', '\\': '\\', $: '$', '"': '"',
};

/**
 * PHP double-quoted string semantics (without interpolation): \n \t \r \v \e \f \\ \$ \"
 * plus octal, hex and unicode escapes. Unknown escapes keep their backslash.
 */
export function unescapeDoubleQuoted(body: string): string {
    return body.replace(
        /\\(u\{[0-9a-fA-F]+\}|x[0-9a-fA-F]{1,2}|[0-7]{1,3}|.)/g,
        (whole, seq: string) => {
            if (seq.length > 1 && seq[0] === 'u') {
                return String.fromCodePoint(parseInt(seq.slice(2, -1), 16));
            }
            if (seq.length > 1 && seq[0] === 'x') {
                return String.fromCharCode(parseInt(seq.slice(1), 16));
            }
            if (/^[0-7]+$/.test(seq)) {
                return String.fromCharCode(parseInt(seq, 8) & 0xff);
            }
            return DOUBLE_QUOTED_ESCAPES[seq] ?? whole;
        }
    );
}

/**
 * Decode escaped characters in test/describe names (single pass)
 * Converts: "nom avec l\'apostrophe" -> "nom avec l'apostrophe"
 * Kept for compatibility: names returned by parseTestsFromPhp are already decoded.
 */
export function decodeTestName(rawName: string): string {
    const map: Record<string, string> = { "'": "'", '"': '"', '\\': '\\', n: '\n', r: '\r', t: '\t' };
    return rawName.replace(/\\(['"\\nrt])/g, (_whole, char: string) => map[char]);
}
