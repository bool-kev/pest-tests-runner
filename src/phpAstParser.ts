import * as parser from 'php-parser';

/**
 * Interface for parsed test information
 */
export interface ParsedTest {
    name: string;
    line: number;
    type: 'test' | 'it' | 'describe';
}

/**
 * Parse PHP file content using AST to extract test and describe blocks
 * This is more reliable than regex for complex cases like:
 * - Nested describes
 * - Multi-line test names
 * - Complex string concatenation
 * - Arrow functions vs closures
 */
export function parseTestsFromPhp(content: string): ParsedTest[] {
    const tests: ParsedTest[] = [];

    try {
        const phpParser = new parser.Engine({
            parser: {
                extractDoc: false,
                suppressErrors: true, // Don't throw on syntax errors
            },
            ast: {
                withPositions: true,
            },
        });

        const ast = phpParser.parseCode(content, 'test.php');

        // Traverse AST to find test() and describe() calls
        traverseAst(ast, tests);

    } catch (error) {
        console.error('[AST Parser] Error parsing PHP:', error);
        // Fall back to empty array - extension should still work
    }

    return tests;
}

/**
 * Recursively traverse AST nodes to find test/describe calls
 */
function traverseAst(node: any, tests: ParsedTest[]): void {
    if (!node || typeof node !== 'object') {
        return;
    }

    // Check if this is a function call
    if (node.kind === 'call') {
        const funcName = getFunctionName(node);

        if (funcName === 'test' || funcName === 'it' || funcName === 'describe') {
            // Extract first argument (test name)
            const testName = extractTestName(node);
            const line = node.loc?.start?.line || 0;

            if (testName) {
                tests.push({
                    name: testName,
                    line: line - 1, // Convert to 0-based line number
                    type: funcName as 'test' | 'it' | 'describe',
                });
            }
        }
    }

    // Recursively traverse all properties
    for (const key in node) {
        if (key === 'loc' || key === 'kind') {
            continue; // Skip metadata
        }

        const value = node[key];
        if (Array.isArray(value)) {
            value.forEach(item => traverseAst(item, tests));
        } else if (typeof value === 'object') {
            traverseAst(value, tests);
        }
    }
}

/**
 * Extract function name from call node
 */
function getFunctionName(callNode: any): string | null {
    if (!callNode.what) {
        return null;
    }

    // Direct function name (e.g., test(...))
    if (callNode.what.kind === 'name') {
        return callNode.what.name;
    }

    // Identifier (e.g., test(...))
    if (callNode.what.kind === 'identifier') {
        return callNode.what.name;
    }

    return null;
}

/**
 * Extract test name from first argument of test/describe call
 * Handles: strings, concatenation, variables (best effort)
 */
function extractTestName(callNode: any): string | null {
    if (!callNode.arguments || callNode.arguments.length === 0) {
        return null;
    }

    const firstArg = callNode.arguments[0];
    return extractStringValue(firstArg);
}

/**
 * Extract string value from AST node
 * Handles: string literals, concatenation, encapsed strings
 */
function extractStringValue(node: any): string | null {
    if (!node) {
        return null;
    }

    // String literal: 'simple string'
    if (node.kind === 'string') {
        return node.value || node.raw || null;
    }

    // Encapsed string (interpolated): "string with $var"
    if (node.kind === 'encapsed') {
        // For now, just concatenate parts - may not be perfect with variables
        return node.value
            ? node.value.map((part: any) => extractStringValue(part) || '').join('')
            : null;
    }

    // Binary operation: 'string1' . 'string2'
    if (node.kind === 'bin' && node.type === '.') {
        const left = extractStringValue(node.left);
        const right = extractStringValue(node.right);
        if (left && right) {
            return left + right;
        }
    }

    // Variable or complex expression - can't reliably extract
    // Return null to skip this test (better than wrong name)
    return null;
}

/**
 * Decode escaped characters in test/describe names
 * Converts: "nom avec l\'apostrophe" -> "nom avec l'apostrophe"
 * This is still needed for names captured from AST that contain escapes
 */
export function decodeTestName(rawName: string): string {
    return rawName
        .replace(/\\'/g, "'")   // \' -> '
        .replace(/\\"/g, '"')   // \" -> "
        .replace(/\\\\/g, '\\') // \\ -> \
        .replace(/\\n/g, '\n')  // \n -> newline
        .replace(/\\r/g, '\r')  // \r -> carriage return
        .replace(/\\t/g, '\t'); // \t -> tab
}
