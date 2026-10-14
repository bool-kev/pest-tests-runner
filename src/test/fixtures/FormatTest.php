<?php

it('top level it', function () { expect(true)->toBeTrue(); });
test('top level test', function () { expect(1)->toBe(1); });
test("nom avec l'apostrophe et é", function () { expect(1)->toBe(1); });
test('parens (x) and @user #1 a.b', function () { expect(1)->toBe(1); });
test('fails compare', function () { expect(['a' => 1])->toBe(['a' => 2]); });
test('skipped one', function () {})->skip('raison du skip');
test('todo one')->todo();

describe('Outer', function () {
    it('works', function () { expect(true)->toBeTrue(); });
    test('test inside', function () { expect(true)->toBeTrue(); });
    describe('Inner', function () {
        it('works', function () { expect(true)->toBeFalse(); });
    });
    it('after inner', function () { expect(true)->toBeTrue(); });
});

it('has dataset', function ($v) { expect($v)->toBeInt(); })->with([1, 'two']);
it('named dataset', function ($v) { expect($v)->toBeInt(); })->with(['one' => 1, 'deux' => 2]);
test('Foo::bar() with :: inside', function () { expect(1)->toBe(1); });
