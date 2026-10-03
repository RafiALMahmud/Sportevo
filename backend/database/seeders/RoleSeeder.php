<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        Role::updateOrCreate(['name' => 'superadmin']);
        Role::updateOrCreate(['name' => 'admin']);
        Role::updateOrCreate(['name' => 'turf']);
        Role::updateOrCreate(['name' => 'user']);
    }
}
