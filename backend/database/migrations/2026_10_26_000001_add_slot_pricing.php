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
            $table->string('slot_pricing_mode', 8)->nullable();
            $table->decimal('slot_rate', 10, 2)->nullable();
            $table->boolean('is_peak')->default(false);
        });
    }

    public function down(): void
    {
        if (DB::table('bookings')->whereNotNull('slot_rate')->exists()) {
            throw new RuntimeException('Slot-specific prices exist. Preserve those prices before rolling back.');
        }
        Schema::table('bookings', fn (Blueprint $table) => $table->dropColumn(['slot_pricing_mode', 'slot_rate', 'is_peak']));
    }
};
