<?php

return [
    // Used only when manually creating new platform admins; never resets existing passwords.
    'passwords' => [
        1 => env('PLATFORM_ADMIN_1_PASSWORD'),
        2 => env('PLATFORM_ADMIN_2_PASSWORD'),
    ],
];
