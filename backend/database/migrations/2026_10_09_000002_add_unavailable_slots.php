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
            DB::statement("ALTER TABLE bookings MODIFY COLUMN status ENUM('available','unavailable','pending','booked','rejected','cancelled','completed') NOT NULL DEFAULT 'available'");
        }
        Schema::table('bookings', function (Blueprint $table) {
            $table->string('unavailable_reason', 500)->nullable();
            $table->unsignedBigInteger('unavailable_by')->nullable();
            $table->timestamp('unavailable_at')->nullable();
        });
    }

    public function down(): void
    {
        if (DB::table('bookings')->where('status', 'unavailable')->exists()) {
            throw new RuntimeException('Reopen unavailable slots before rolling back this migration. No availability history has been removed.');
        }
        if (DB::connection()->getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE bookings MODIFY COLUMN status ENUM('available','pending','booked','rejected','cancelled','completed') NOT NULL DEFAULT 'available'");
        }
        Schema::table('bookings', fn (Blueprint $table) => $table->dropColumn(['unavailable_reason', 'unavailable_by', 'unavailable_at']));
    }
};
