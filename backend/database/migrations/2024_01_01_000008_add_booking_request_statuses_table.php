<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function ($table) {
            // no structural change; status enum handled below
        });

        DB::statement("ALTER TABLE bookings MODIFY COLUMN status ENUM('available','pending','booked','rejected','cancelled','completed') NOT NULL DEFAULT 'available'");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE bookings MODIFY COLUMN status ENUM('available','booked','cancelled','completed') NOT NULL DEFAULT 'available'");
    }
};