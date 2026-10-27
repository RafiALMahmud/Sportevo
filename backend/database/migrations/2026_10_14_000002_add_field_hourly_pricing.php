<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fields', function (Blueprint $table) {
            $table->string('pricing_mode', 10)->default('slot');
            $table->decimal('price_per_hour', 10, 2)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('fields', fn (Blueprint $table) => $table->dropColumn(['pricing_mode', 'price_per_hour']));
    }
};
