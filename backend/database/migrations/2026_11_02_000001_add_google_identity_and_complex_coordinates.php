<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('google_subject')->nullable();
            $table->string('google_subject_hash', 64)->nullable()->unique();
        });
        Schema::table('turfs', function (Blueprint $table) {
            $table->decimal('latitude', 9, 6)->nullable();
            $table->decimal('longitude', 10, 6)->nullable();
            $table->index(['latitude', 'longitude']);
        });
    }

    public function down(): void
    {
        if (DB::table('users')->whereNotNull('google_subject_hash')->exists()
            || DB::table('turfs')->whereNotNull('latitude')->exists()) {
            throw new RuntimeException('Google connections or map pins exist. Export and remove them explicitly before rolling back.');
        }
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['google_subject_hash']);
            $table->dropColumn(['google_subject', 'google_subject_hash']);
        });
        Schema::table('turfs', function (Blueprint $table) {
            $table->dropIndex(['latitude', 'longitude']);
            $table->dropColumn(['latitude', 'longitude']);
        });
    }
};
