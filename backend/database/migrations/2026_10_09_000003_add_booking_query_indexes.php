<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->index(['turf_id', 'status', 'start_time'], 'bookings_turf_status_time');
            $table->index(['field_id', 'status', 'start_time'], 'bookings_field_status_time');
            $table->index(['user_id', 'start_time'], 'bookings_customer_time');
            $table->index(['status', 'start_time'], 'bookings_status_time');
        });
        Schema::table('reviews', fn (Blueprint $table) => $table->index(['turf_id', 'is_hidden'], 'reviews_public_turf'));
        Schema::table('turf_photos', fn (Blueprint $table) => $table->index(['turf_id', 'sort_order'], 'photos_turf_order'));
        Schema::table('turfs', fn (Blueprint $table) => $table->index(['deleted_at', 'is_approved'], 'turfs_public_approval'));
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            foreach (['bookings_turf_status_time', 'bookings_field_status_time', 'bookings_customer_time', 'bookings_status_time'] as $index) {
                $table->dropIndex($index);
            }
        });
        Schema::table('reviews', fn (Blueprint $table) => $table->dropIndex('reviews_public_turf'));
        Schema::table('turf_photos', fn (Blueprint $table) => $table->dropIndex('photos_turf_order'));
        Schema::table('turfs', fn (Blueprint $table) => $table->dropIndex('turfs_public_approval'));
    }
};
