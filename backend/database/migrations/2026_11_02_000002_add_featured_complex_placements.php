<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('featured_settings', function (Blueprint $table) {
            $table->unsignedTinyInteger('id')->primary();
            $table->text('payment_details')->nullable();
            $table->text('instructions')->nullable();
            $table->timestamps();
        });
        DB::table('featured_settings')->insert(['id' => 1, 'created_at' => now(), 'updated_at' => now()]);
        Schema::create('featured_placements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('turf_id')->unique()->constrained()->restrictOnDelete();
            $table->boolean('is_enabled')->default(true);
            $table->boolean('is_sponsored')->default(false);
            $table->unsignedSmallInteger('priority')->default(100);
            $table->dateTime('starts_at');
            $table->dateTime('ends_at');
            $table->text('admin_note')->nullable();
            $table->foreignId('updated_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
            $table->index(['is_enabled', 'ends_at']);
        });
        Schema::create('featured_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('turf_id')->constrained()->restrictOnDelete();
            $table->foreignId('owner_id')->constrained('users')->restrictOnDelete();
            $table->unsignedSmallInteger('days');
            $table->decimal('amount', 10, 2);
            $table->string('provider', 20);
            $table->text('receiver_number');
            $table->text('payment_reference')->nullable();
            $table->string('status', 24)->default('awaiting_payment');
            $table->dateTime('submitted_at')->nullable();
            $table->foreignId('decided_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->dateTime('decided_at')->nullable();
            $table->dateTime('starts_at')->nullable();
            $table->dateTime('ends_at')->nullable();
            $table->text('decision_note')->nullable();
            $table->timestamps();
            $table->index(['status', 'id']);
            $table->index(['turf_id', 'status']);
        });
    }

    public function down(): void
    {
        if (DB::table('featured_requests')->exists() || DB::table('featured_placements')->exists()
            || DB::table('featured_settings')->whereNotNull('payment_details')->exists()) {
            throw new RuntimeException('Featured payment settings or history exist. Export and remove them explicitly before rollback.');
        }
        Schema::dropIfExists('featured_requests');
        Schema::dropIfExists('featured_placements');
        Schema::dropIfExists('featured_settings');
    }
};
