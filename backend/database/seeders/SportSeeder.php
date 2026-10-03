<?php

namespace Database\Seeders;

use App\Models\Sport;
use Illuminate\Database\Seeder;

class SportSeeder extends Seeder
{
    public function run(): void
    {
        $sports = [
            ['name' => 'Football', 'slug' => 'football'],
            ['name' => 'Cricket', 'slug' => 'cricket'],
            ['name' => 'Badminton', 'slug' => 'badminton'],
            ['name' => 'Basketball', 'slug' => 'basketball'],
            ['name' => 'Tennis', 'slug' => 'tennis'],
            ['name' => 'Futsal', 'slug' => 'futsal'],
            ['name' => 'Volleyball', 'slug' => 'volleyball'],
            ['name' => 'Swimming', 'slug' => 'swimming'],
            ['name' => 'Boxing', 'slug' => 'boxing'],
            ['name' => 'Table Tennis', 'slug' => 'table-tennis'],
        ];

        foreach ($sports as $sport) {
            Sport::updateOrCreate(['slug' => $sport['slug']], $sport);
        }
    }
}