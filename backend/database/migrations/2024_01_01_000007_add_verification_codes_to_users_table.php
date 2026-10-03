<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('verification_code')->nullable()->after('password');
            $table->timestamp('verification_code_expires_at')->nullable()->after('verification_code');
            $table->string('password_reset_code')->nullable()->after('verification_code_expires_at');
            $table->timestamp('password_reset_code_expires_at')->nullable()->after('password_reset_code');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'verification_code',
                'verification_code_expires_at',
                'password_reset_code',
                'password_reset_code_expires_at',
            ]);
        });
    }
};