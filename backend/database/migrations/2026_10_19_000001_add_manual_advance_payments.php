<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('turfs', function (Blueprint $table) {
            // Existing complexes opt in after supplying a real payment account.
            $table->boolean('advance_enabled')->default(false);
            $table->decimal('advance_amount', 10, 2)->default(500);
            $table->unsignedInteger('advance_window_minutes')->default(60);
            $table->string('payment_provider', 80)->default('bKash');
            $table->text('payment_number')->nullable();
        });
        Schema::table('bookings', function (Blueprint $table) {
            // Previously accepted bookings retain their existing commission/terms.
            $table->boolean('advance_required')->default(false);
            $table->string('advance_status', 32)->default('not_required');
            $table->decimal('advance_amount', 10, 2)->default(0);
            $table->unsignedInteger('advance_window_minutes')->nullable();
            $table->string('payment_provider', 80)->nullable();
            $table->text('payment_number')->nullable();
            $table->dateTime('advance_due_at')->nullable();
            $table->text('payment_reference')->nullable();
            $table->dateTime('payment_submitted_at')->nullable();
            $table->dateTime('payment_confirmed_at')->nullable();
            $table->foreignId('payment_confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('payment_note')->nullable();
            $table->index(['status', 'advance_status', 'advance_due_at'], 'bookings_advance_expiry_index');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropIndex('bookings_advance_expiry_index');
            $table->dropConstrainedForeignId('payment_confirmed_by');
            $table->dropColumn(['advance_required', 'advance_status', 'advance_amount', 'advance_window_minutes', 'payment_provider',
                'payment_number', 'advance_due_at', 'payment_reference', 'payment_submitted_at', 'payment_confirmed_at', 'payment_note']);
        });
        Schema::table('turfs', fn (Blueprint $table) => $table->dropColumn(['advance_enabled', 'advance_amount', 'advance_window_minutes', 'payment_provider', 'payment_number']));
    }
};
