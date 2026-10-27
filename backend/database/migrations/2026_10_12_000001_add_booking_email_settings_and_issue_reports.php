<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('turfs', function (Blueprint $table) {
            $table->boolean('booking_request_emails')->default(true);
        });
        Schema::create('issue_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->text('subject');
            $table->longText('message');
            $table->string('status', 20)->default('open')->index();
            $table->longText('admin_reply')->nullable();
            $table->foreignId('handled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['user_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('issue_reports');
        Schema::table('turfs', fn (Blueprint $table) => $table->dropColumn('booking_request_emails'));
    }
};
