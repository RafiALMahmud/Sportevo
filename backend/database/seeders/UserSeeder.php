<?php

namespace Database\Seeders;

use App\Models\Booking;
use App\Models\Review;
use App\Models\Role;
use App\Models\Sport;
use App\Models\Turf;
use App\Models\User;
use App\Models\WalletEntry;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $this->command->info('Seeding demo users, complexes and slots...');

        $superadminRole = Role::where('name', 'superadmin')->first();
        $adminRole = Role::where('name', 'admin')->first();
        $turfRole = Role::where('name', 'turf')->first();
        $userRole = Role::where('name', 'user')->first();

        $superadmin = $this->makeUser('Super Admin', 'superadmin@sportsevo.com', '0000000000', $superadminRole);
        $admin = $this->makeUser('Platform Admin', 'admin@sportsevo.com', '1111111111', $adminRole);

        // Two complex owners for variety
        $managerGreen = $this->makeUser('Complex Manager', 'manager@sportsevo.com', '2222222222', $turfRole);
        $managerCity = $this->makeUser('Sarah Khan', 'sarah@sportsevo.com', '2223334444', $turfRole);

        // Bookers so booking requests can be tested
        $regularUser = $this->makeUser('Regular User', 'user@sportsevo.com', '3333333333', $userRole);
        $jane = $this->makeUser('Jane Smith', 'jane@sportsevo.com', '4443332222', $userRole);
        $emma = $this->makeUser('Emma Watson', 'emma@sportsevo.com', '5551110000', $userRole);

        $football = Sport::where('slug', 'football')->first();
        $cricket = Sport::where('slug', 'cricket')->first();
        $badminton = Sport::where('slug', 'badminton')->first();
        $basketball = Sport::where('slug', 'basketball')->first();
        $tennis = Sport::where('slug', 'tennis')->first();
        $futsal = Sport::where('slug', 'futsal')->first();
        $volleyball = Sport::where('slug', 'volleyball')->first();
        $swimming = Sport::where('slug', 'swimming')->first();

        // --- Complexes ---
        $greenArena = $this->makeTurf(
            'Green Arena Sports Complex',
            'greenarena@sportsevo.com',
            '+1 555 200 1001',
            'Main Road 12, Downtown',
            $managerGreen->id,
            [$football?->id, $futsal?->id, $badminton?->id],
            price: 30.00,
            commission: 10.00
        );

        $peakFutsal = $this->makeTurf(
            'Peak Futsal Court',
            'peak@sportsevo.com',
            '+1 555 200 1002',
            'River Road 45, Northside',
            $managerGreen->id,
            [$cricket?->id, $football?->id, $futsal?->id],
            price: 22.50,
            commission: 10.00
        );

        $cityHub = $this->makeTurf(
            'City Center Sports Hub',
            'cityhub@sportsevo.com',
            '+1 555 200 1003',
            'Century Avenue 8, Central Business District',
            $managerCity->id,
            [$basketball?->id, $volleyball?->id, $tennis?->id],
            price: 45.00,
            commission: 12.50
        );

        $aquaFitness = $this->makeTurf(
            'Aqua & Fitness Complex',
            'aqua@sportsevo.com',
            '+1 555 200 1004',
            'Lakeview Road 3, Riverside',
            $managerCity->id,
            [$swimming?->id, $badminton?->id],
            price: 18.00,
            commission: 0.00
        );

        $eastsideCricket = $this->makeTurf(
            'Eastside Cricket Grounds',
            'eastside@sportsevo.com',
            '+1 555 200 1005',
            'Green Park 21, Eastside',
            $managerGreen->id,
            [$cricket?->id, $football?->id],
            price: 55.00,
            commission: 10.00
        );

        // --- Slots for the next 7 days so there is always something to book ---
        $complexes = [$greenArena, $peakFutsal, $cityHub, $aquaFitness, $eastsideCricket];
        foreach ($complexes as $complex) {
            $this->seedWeekOfSlots($complex);
        }

        // --- Sample bookings in different states (for admin/owner dashboards) ---
        $this->seedSampleBookings($greenArena, $peakFutsal, $aquaFitness, $regularUser, $jane, $emma);

        $this->command->info('');
        $this->command->info('Seeded accounts (password = password):');
        $this->command->info('  Superadmin: superadmin@sportsevo.com');
        $this->command->info('  Admin:      admin@sportsevo.com');
        $this->command->info('  Owner 1:    manager@sportsevo.com');
        $this->command->info('  Owner 2:    sarah@sportsevo.com');
        $this->command->info('  Bookers:    user@sportsevo.com, jane@sportsevo.com, emma@sportsevo.com');
    }

    private function makeUser(string $name, string $email, string $phone, $role): User
    {
        $user = User::firstOrCreate(
            ['email' => $email],
            [
                'name' => $name,
                'phone' => $phone,
                'password' => Hash::make('password'),
                'role_id' => $role?->id,
                'email_verified_at' => now(),
            ]
        );

        return $user;
    }

    private function makeTurf(string $name, string $email, string $phone, string $location, int $managerId, array $sportIds, float $price = 25.00, float $commission = 10.00): Turf
    {
        $turf = Turf::firstOrCreate(
            ['email' => $email],
            [
                'name' => $name,
                'phone' => $phone,
                'location' => $location,
                'is_approved' => true,
                'turf_manager_id' => $managerId,
                'price_per_slot' => $price,
                'commission_rate' => $commission,
            ]
        );

        if (count($sportIds) > 0) {
            $turf->sports()->sync(array_values(array_filter($sportIds)));
        }

        return $turf;
    }

    /**
     * Generate an hourly slot grid (09:00 -> 13:00) for the next 7 days.
     */
    private function seedWeekOfSlots(Turf $turf): void
    {
        foreach (range(0, 7) as $dayOffset) {
            $date = Carbon::now()->addDays($dayOffset)->toDateString();

            foreach (range(0, 3) as $i) {
                $slotStart = Carbon::parse($date)->setTime(9 + $i, 0);
                $slotEnd = $slotStart->copy()->addHour();

                $exists = Booking::where('turf_id', $turf->id)
                    ->where('start_time', $slotStart)
                    ->where('end_time', $slotEnd)
                    ->exists();

                if (!$exists) {
                    Booking::create([
                        'turf_id' => $turf->id,
                        'start_time' => $slotStart,
                        'end_time' => $slotEnd,
                        'status' => 'available',
                    ]);
                }
            }
        }
    }

    private function seedSampleBookings(Turf $green, Turf $peak, Turf $aqua, User $regularUser, User $jane, User $emma): void
    {
        // Helper to find an available slot on a given day
        $takeSlot = fn (Turf $turf, int $dayOffset, string $time) => Booking::where('turf_id', $turf->id)
            ->where('start_time', Carbon::now()->addDays($dayOffset)->setTime(...explode(':', $time)))
            ->where('status', 'available')
            ->first();

        // Snapshot the asking price + commission onto the request, exactly like BookingController::store does.
        $quote = function (Booking $slot, Turf $turf, User $user, string $status) {
            $rate = (float) $turf->commission_rate;
            $price = (float) $turf->price_per_slot;
            // Commission is charged when the request is accepted, so it sticks for booked/completed slots.
            $wasAccepted = in_array($status, ['booked', 'completed'], true);
            $commission = $wasAccepted ? round($price * $rate / 100, 2) : null;
            $slot->update([
                'user_id' => $user->id,
                'status' => $status,
                'price' => $price,
                'commission_rate' => $rate,
                'commission_amount' => $commission,
                'decided_at' => $wasAccepted ? now() : null,
            ]);

            // Accepted requests owe the platform commission -> wallet entry.
            if ($wasAccepted) {
                WalletEntry::firstOrCreate(['booking_id' => $slot->id], [
                    'turf_id' => $turf->id,
                    'type' => 'commission_charge',
                    'amount' => $commission,
                    'note' => "Commission for booking #{$slot->id}",
                    'created_by' => null,
                ]);
            }
        };

        // 1. A pending request (regular user -> Green Arena, tomorrow 09:00)
        $pendingSlot = $takeSlot($green, 1, '09:00');
        if ($pendingSlot) {
            $quote($pendingSlot, $green, $regularUser, 'pending');
        }

        // 2. A booked slot (jane -> Peak Futsal, day 2 10:00) already confirmed
        $bookedSlot = $takeSlot($peak, 2, '10:00');
        if ($bookedSlot) {
            $quote($bookedSlot, $peak, $jane, 'booked');
        }

        // 3. Another pending request (emma -> Aqua & Fitness, day 1 11:00)
        $pendingSlot2 = $takeSlot($aqua, 1, '11:00');
        if ($pendingSlot2) {
            $quote($pendingSlot2, $aqua, $emma, 'pending');
        }

        // 4. A completed booking in the past (regular user -> Green Arena)
        $pastCompleted = Booking::where('turf_id', $green->id)
            ->where('user_id', $regularUser->id)
            ->where('status', 'completed')
            ->first();

        if (!$pastCompleted) {
            $slot = Booking::create([
                'turf_id' => $green->id,
                'user_id' => $regularUser->id,
                'start_time' => Carbon::now()->subDays(2)->setTime(10, 0),
                'end_time' => Carbon::now()->subDays(2)->setTime(11, 0),
                'status' => 'available',
            ]);
            $quote($slot, $green, $regularUser, 'completed');
            Review::firstOrCreate(
                ['turf_id' => $green->id, 'user_id' => $regularUser->id],
                ['booking_id' => $slot->id, 'rating' => 5, 'comment' => 'Great turf, floodlights worked perfectly. Easy to book.']
            );
        }

        // 5. A cancelled booking in the past (jane -> City Hub) for history variety
        $pastCancelled = Booking::where('turf_id', $peak->id)
            ->where('status', 'cancelled')
            ->first();

        if (!$pastCancelled) {
            Booking::create([
                'turf_id' => $peak->id,
                'user_id' => $jane->id,
                'start_time' => Carbon::now()->subDays(1)->setTime(12, 0),
                'end_time' => Carbon::now()->subDays(1)->setTime(13, 0),
                'status' => 'cancelled',
                'price' => $peak->price_per_slot,
                'commission_rate' => $peak->commission_rate,
                'decided_at' => Carbon::now()->subDays(2),
            ]);
        }
    }
}