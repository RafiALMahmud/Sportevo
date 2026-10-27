<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\IssueReport;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class IssueReportController extends Controller
{
    public function index(Request $request)
    {
        return response()->json(IssueReport::where('user_id', $request->user()->id)->latest('id')->paginate(20));
    }

    public function store(Request $request)
    {
        $data = $request->validate(['subject' => ['required', 'string', 'max:160'], 'message' => ['required', 'string', 'max:5000']]);
        $report = IssueReport::create($data + ['user_id' => $request->user()->id]);

        return response()->json(['message' => 'Report sent to the platform admins.', 'report' => $report], 201);
    }

    public function adminIndex(Request $request)
    {
        $request->validate(['status' => ['nullable', Rule::in(['open', 'in_progress', 'resolved'])]]);
        $query = IssueReport::with('user:id,name,email,role_id', 'user.role')->latest('id');
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return response()->json($query->paginate(20));
    }

    public function update(Request $request, IssueReport $issueReport)
    {
        $data = $request->validate(['status' => ['required', Rule::in(['open', 'in_progress', 'resolved'])],
            'admin_reply' => ['nullable', 'string', 'max:5000']]);
        $issueReport->update($data + ['handled_by' => $request->user()->id]);

        return response()->json(['message' => 'Report updated.', 'report' => $issueReport]);
    }
}
