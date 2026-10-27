<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fields', function (Blueprint $table) {
            $table->unsignedSmallInteger('players_per_side')->nullable();
        });
    }

    public function down(): void
    {
        if (DB::table('fields')->whereNotNull('players_per_side')->exists()) {
            throw new RuntimeException('Player counts exist. Preserve them before rolling back this migration.');
        }
        Schema::table('fields', fn (Blueprint $table) => $table->dropColumn('players_per_side'));
    }
};
