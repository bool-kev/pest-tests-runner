<?php


test('basic example test', function () {
    expect(true)->toBeTrue();
});

test('addition works correctly', function () {
    $result = 2 + 2;
    expect($result)->toBe(4);
});

it('can check string equality', function () {
    $greeting = 'Hello World';
    expect($greeting)->toBe('Hello World');
});

describe('Array operations', function () {
    test('array has correct length', function () {
        $array = [1, 2, 3, 4, 5];
        expect($array)->toHaveCount(5);
    });

    test('array contains value', function () {
        $fruits = ['apple', 'banana', 'orange'];
        expect($fruits)->toContain('banana');
    });

    it('can merge arrays', function () {
        $array1 = [1, 2, 3];
        $array2 = [4, 5, 6];
        $merged = array_merge($array1, $array2);

        expect($merged)->toHaveCount(6)
            ->and($merged)->toContain(1)
            ->and($merged)->toContain(6);
    });
});

describe('String manipulation', function () {
    test('string can be uppercased', function () {
        $text = 'hello';
        expect(strtoupper($text))->toBe('HELLO');
    });

    test('string can be reversed', function () {
        $text = 'hello';
        expect(strrev($text))->toBe('olleh');
    });

    it('checks string length', function () {
        $text = 'Pest Testing';
        expect(strlen($text))->toBe(12);
    });
});

test('callable function works', function () {
    $callback = fn($x) => $x * 2;
    expect($callback(5))->toBe(10);
});

it('validates email format', function () {
    $email = 'test@example.com';
    expect(filter_var($email, FILTER_VALIDATE_EMAIL))->toBe($email);
});
