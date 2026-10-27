<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE bookings MODIFY COLUMN status ENUM('available','pending','booked','rejected','cancelled','completed') NOT NULL DEFAULT 'available'");

            return;
        }

        // SQLite cannot MODIFY an enum: drop the restrictive CHECK constraint
        // by changing the column to a plain string (validation lives in the app).
        Schema::table('bookings', function (Blueprint $table) {
            $table->string('status')->default('available')->change();
        });
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE bookings MODIFY COLUMN status ENUM('available','booked','cancelled','completed') NOT NULL DEFAULT 'available'");

            return;
        }

        Schema::table('bookings', function (Blueprint $table) {
            $table->string('status')->default('available')->change();
        });
    }
};
