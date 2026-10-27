<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::table('turfs')->select('turf_manager_id')->groupBy('turf_manager_id')->havingRaw('COUNT(*) > 1')->exists()) {
            throw new RuntimeException('An owner has multiple complexes. Assign each existing complex to its own owner account before migrating. No complexes have been removed.');
        }
        Schema::table('turfs', function (Blueprint $table) {
            $table->softDeletes();
            $table->unique('turf_manager_id');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedInteger('auth_version')->default(0);
            $table->softDeletes();
            $table->text('phone')->nullable()->change();
        });
        Schema::create('fields', function (Blueprint $table) {
            $table->id();
            $table->foreignId('turf_id')->constrained()->restrictOnDelete();
            $table->string('name');
            $table->decimal('price_per_slot', 10, 2);
            $table->timestamps();
        });
        Schema::create('field_sport', function (Blueprint $table) {
            $table->foreignId('field_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sport_id')->constrained()->cascadeOnDelete();
            $table->primary(['field_id', 'sport_id']);
        });
        Schema::table('bookings', function (Blueprint $table) {
            $table->foreignId('field_id')->nullable()->constrained()->restrictOnDelete();
            $table->index(['field_id', 'start_time', 'end_time']);
        });
        Schema::table('turf_photos', function (Blueprint $table) {
            $table->foreignId('field_id')->nullable()->constrained()->cascadeOnDelete();
        });
        DB::table('turfs')->orderBy('id')->each(function ($turf) {
            $id = DB::table('fields')->insertGetId(['turf_id' => $turf->id, 'name' => 'Main field', 'price_per_slot' => $turf->price_per_slot, 'created_at' => now(), 'updated_at' => now()]);
            foreach (DB::table('sport_turf')->where('turf_id', $turf->id)->pluck('sport_id') as $sport) {
                DB::table('field_sport')->insert(['field_id' => $id, 'sport_id' => $sport]);
            }
            DB::table('bookings')->where('turf_id', $turf->id)->update(['field_id' => $id]);
            DB::table('turf_photos')->where('turf_id', $turf->id)->update(['field_id' => $id]);
        });
        Schema::create('cancellation_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->unique()->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('requested_by');
            $table->text('reason')->nullable();
            $table->string('owner_status')->default('pending');
            $table->string('refund_status')->default('awaiting_owner');
            $table->unsignedBigInteger('owner_decided_by')->nullable();
            $table->unsignedBigInteger('refund_decided_by')->nullable();
            $table->timestamp('owner_decided_at')->nullable();
            $table->timestamp('refund_decided_at')->nullable();
            $table->timestamps();
        });
        Schema::create('commission_refunds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('turf_id')->constrained()->restrictOnDelete();
            $table->decimal('amount', 10, 2);
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });
        Schema::create('turf_deletion_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('turf_id')->unique()->constrained()->restrictOnDelete();
            $table->text('reason');
            $table->string('status')->default('pending');
            $table->unsignedBigInteger('decided_by')->nullable();
            $table->timestamp('decided_at')->nullable();
            $table->timestamps();
        });
        Schema::table('reviews', function (Blueprint $table) {
            $table->boolean('is_hidden')->default(false);
        });
        Schema::create('activities', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('actor_id')->nullable()->index();
            $table->string('actor_name')->nullable();
            $table->string('actor_email')->nullable();
            $table->string('action')->index();
            $table->json('details');
            $table->timestamp('created_at')->useCurrent()->index();
        });
        Schema::create('email_deliveries', function (Blueprint $table) {
            $table->id();
            $table->string('recipient');
            $table->string('subject');
            $table->text('body');
            $table->string('status')->default('pending')->index();
            $table->unsignedInteger('attempts')->default(0);
            $table->text('last_error')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('auth_version');
            $table->dropSoftDeletes();
        });
        foreach (['email_deliveries', 'activities', 'turf_deletion_requests', 'commission_refunds', 'cancellation_requests'] as $name) {
            Schema::dropIfExists($name);
        }
        Schema::table('reviews', fn (Blueprint $table) => $table->dropColumn('is_hidden'));
        Schema::table('turf_photos', fn (Blueprint $table) => $table->dropConstrainedForeignId('field_id'));
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropIndex(['field_id', 'start_time', 'end_time']);
            $table->dropConstrainedForeignId('field_id');
        });
        Schema::dropIfExists('field_sport');
        Schema::dropIfExists('fields');
        Schema::table('turfs', function (Blueprint $table) {
            $table->dropUnique(['turf_manager_id']);
            $table->dropSoftDeletes();
        });
    }
};
