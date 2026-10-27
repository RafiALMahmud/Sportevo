<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::transaction(function () {
            $matches = DB::table('sports')->whereRaw('LOWER(TRIM(name)) IN (?, ?)', ['football', 'futsal'])
                ->orWhereIn('name', ['ফুটবল', 'ফুটসাল'])
                ->orWhereRaw('LOWER(slug) IN (?, ?)', ['football', 'futsal'])->orderBy('id')->get();
            if ($matches->isEmpty()) {
                return;
            }
            $football = $matches->firstWhere('slug', 'football') ?? $matches->first(fn ($sport) => strtolower(trim($sport->name)) === 'football');
            $id = $football?->id ?? DB::table('sports')->insertGetId(['name' => 'Football', 'slug' => 'football', 'created_at' => now(), 'updated_at' => now()]);
            DB::table('sports')->where('id', $id)->update(['name' => 'Football', 'slug' => 'football']);
            $aliases = $matches->where('id', '!=', $id)->pluck('id')->all();
            if (! $aliases) {
                return;
            }
            foreach (['field_sport' => 'field_id', 'sport_turf' => 'turf_id'] as $table => $foreign) {
                foreach (DB::table($table)->whereIn('sport_id', $aliases)->orderBy($foreign)->cursor() as $row) {
                    // Includes archived fields and complexes; ignore duplicate Football assignments.
                    DB::table($table)->insertOrIgnore([$foreign => $row->$foreign, 'sport_id' => $id]);
                }
                DB::table($table)->whereIn('sport_id', $aliases)->delete();
            }
            DB::table('sports')->whereIn('id', $aliases)->delete();
        });
    }

    public function down(): void
    {
        throw new RuntimeException('Football and Futsal selections were merged. Restore a pre-merge backup to reverse the classification without guessing previous selections.');
    }
};
