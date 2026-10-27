<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            // Offline reservations use the existing owner-blocked lifecycle.
            // They never masquerade as an accepted online customer booking.
            $table->string('unavailable_type', 32)->nullable();
        });
    }

    public function down(): void
    {
        if (DB::table('bookings')->where('unavailable_type', 'offline_booking')->exists()) {
            throw new RuntimeException('Reopen offline bookings before removing their classification.');
        }
        Schema::table('bookings', fn (Blueprint $table) => $table->dropColumn('unavailable_type'));
    }
};
