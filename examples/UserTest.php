<?php<?php


use function Pest\Laravel\{get, post};

describe('User Authentication', function () {
    test('user can view login page', function () {
        get('/login')
            ->assertStatus(200)
            ->assertSee('Login');
    });

    test('user can login with valid credentials', function () {
        $user = User::factory()->create([
            'email' => 'test@example.com',
            'password' => bcrypt('password123'),
        ]);

        post('/login', [
            'email' => 'test@example.com',
            'password' => 'password123',
        ])
            ->assertRedirect('/dashboard')
            ->assertSessionHas('success');
    });

    it('fails with invalid credentials', function () {
        post('/login', [
            'email' => 'wrong@example.com',
            'password' => 'wrongpassword',
        ])
            ->assertStatus(422)
            ->assertSessionHasErrors('email');
    });

    it('requires email field', function () {
        post('/login', [
            'password' => 'password123',
        ])
            ->assertStatus(422)
            ->assertSessionHasErrors('email');
    });
});

describe('User Registration', function () {
    test('user can view registration page', function () {
        get('/register')
            ->assertStatus(200)
            ->assertSee('Register');
    });

    test('user can register with valid data', function () {
        post('/register', [
            'name' => 'John Doe',
            'email' => 'john@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])
            ->assertRedirect('/dashboard');

        expect(User::where('email', 'john@example.com')->exists())->toBeTrue();
    });

    it('requires password confirmation', function () {
        post('/register', [
            'name' => 'John Doe',
            'email' => 'john@example.com',
            'password' => 'password123',
        ])
            ->assertStatus(422)
            ->assertSessionHasErrors('password');
    });
});

test('guest user is redirected to login', function () {
    get('/dashboard')
        ->assertRedirect('/login');
});

test('authenticated user can access dashboard', function () {
    $user = User::factory()->create();

    actingAs($user)
        ->get('/dashboard')
        ->assertStatus(200)
        ->assertSee('Dashboard');
});
