<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ContactMessage;
use App\Models\User;
use App\Services\TrackedMail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ContactMessageController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email:rfc', 'max:254'],
            'type' => ['required', Rule::in(['complaint', 'information', 'other'])],
            'subject' => ['required', 'string', 'max:160'],
            'message' => ['required', 'string', 'min:10', 'max:5000'],
            'website' => ['nullable', 'string', 'max:0'],
        ]);
        unset($data['website']);
        $message = DB::transaction(function () use ($data, $request) {
            $message = ContactMessage::create($data + ['user_id' => $request->user()?->id]);
            $url = rtrim(config('app.frontend_url') ?: config('app.url'), '/').'/dashboard/platform?tab=messages';
            $html = '<h2>SportEvo: new contact message</h2><p>Reference #'.$message->id.' &middot; '.e(ucfirst($message->type)).'</p>'
                .'<p><strong>'.e($message->subject).'</strong></p><p>From: '.e($message->name).' ('.e($message->email).')</p>'
                .'<p>'.nl2br(e($message->message)).'</p><p><a href="'.e($url).'">Open the admin inbox</a></p>';
            $admins = User::whereHas('role', fn ($query) => $query->whereIn('name', ['admin', 'superadmin']))->get(['id', 'email']);
            foreach ($admins->unique(fn ($admin) => mb_strtolower(trim($admin->email))) as $admin) {
                TrackedMail::send($admin->email, 'SportEvo contact message #'.$message->id, $html);
            }

            return $message;
        });

        return response()->json(['message' => 'Your message has been sent to the SportEvo admins.', 'reference' => $message->id], 201);
    }

    public function index(Request $request)
    {
        $data = $request->validate(['status' => ['nullable', Rule::in(['new', 'in_progress', 'resolved'])]]);
        $query = ContactMessage::latest('id');
        if (! empty($data['status'])) {
            $query->where('status', $data['status']);
        }

        return response()->json($query->paginate(20));
    }

    public function update(Request $request, ContactMessage $contactMessage)
    {
        $data = $request->validate(['status' => ['required', Rule::in(['new', 'in_progress', 'resolved'])]]);
        $contactMessage->update($data + ['handled_by' => $request->user()->id]);

        return response()->json(['message' => 'Contact message updated.', 'contact_message' => $contactMessage]);
    }
}
