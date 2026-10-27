<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="{{ asset('favicon.svg') }}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SportEvo - Turf Booking Platform</title>
    @if (is_file(public_path('build/manifest.json')))
      @vite('index.html')
    @endif
  </head>
  <body>
    <div id="root"></div>
    <noscript>Enable JavaScript to use SportEvo.</noscript>
    @unless (is_file(public_path('build/manifest.json')))
      <p>Build the local frontend with <code>npm run build:local</code> from the frontend directory.</p>
    @endunless
  </body>
</html>
