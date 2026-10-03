<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('turfs', function (Blueprint $table) {
            $table->decimal('price_per_slot', 10, 2)->default(0)->after('location');
            $table->decimal('commission_rate', 5, 2)->default(10)->after('price_per_slot');
        });

        Schema::table('bookings', function (Blueprint $table) {
            $table->decimal('price', 10, 2)->nullable()->after('status');
            $table->decimal('commission_rate', 5, 2)->nullable()->after('price');
            $table->decimal('commission_amount', 10, 2)->nullable()->after('commission_rate');
            $table->timestamp('decided_at')->nullable()->after('commission_amount');
        });

        Schema::create('turf_photos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('turf_id')->constrained()->cascadeOnDelete();
            $table->string('path');
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('turf_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('booking_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedTinyInteger('rating');
            $table->text('comment')->nullable();
            $table->timestamps();
            $table->unique(['turf_id', 'user_id']);
            $table->unique('booking_id');
        });

        Schema::create('wallet_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('turf_id')->constrained()->cascadeOnDelete();
            $table->foreignId('booking_id')->nullable()->constrained()->nullOnDelete();
            $table->enum('type', ['commission_charge', 'settlement']);
            $table->decimal('amount', 10, 2);
            $table->string('note')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique('booking_id');
            $table->index(['turf_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wallet_entries');
        Schema::dropIfExists('reviews');
        Schema::dropIfExists('turf_photos');
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn(['price', 'commission_rate', 'commission_amount', 'decided_at']);
        });
        Schema::table('turfs', function (Blueprint $table) {
            $table->dropColumn(['price_per_slot', 'commission_rate']);
        });
    }
};
