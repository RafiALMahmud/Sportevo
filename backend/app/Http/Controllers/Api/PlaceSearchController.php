<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\PlaceSearch;
use Illuminate\Http\Request;

class PlaceSearchController extends Controller
{
    public function __invoke(Request $request, PlaceSearch $places)
    {
        $input = $request->validate(['q' => ['required', 'string', 'min:3', 'max:200']]);
        return response()->json(['data' => $places->search($input['q'])]);
    }
}
