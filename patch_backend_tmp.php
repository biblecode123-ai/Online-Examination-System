<?php
// Temporary patch script (deleted after use). Verifies a unique match before writing.

$base = 'C:/Users/PC/Documents/ofijan-backend/';

function patch(string $path, array $pairs): void
{
    $raw = file_get_contents($path);
    if ($raw === false) {
        fwrite(STDERR, "READ FAIL: $path\n");
        exit(1);
    }
    foreach ($pairs as [$needle, $replacement]) {
        $crlf = str_replace("\n", "\r\n", $needle);
        $crlfRepl = str_replace("\n", "\r\n", $replacement);
        $lfCount  = substr_count($raw, $needle);
        $crlfCount = substr_count($raw, $crlf);
        if ($lfCount === 1) {
            $raw = str_replace($needle, $replacement, $raw);
        } elseif ($crlfCount === 1) {
            $raw = str_replace($crlf, $crlfRepl, $raw);
        } else {
            fwrite(STDERR, "MATCH FAIL ($lfCount lf / $crlfCount crlf) in $path for: " . substr($needle, 0, 70) . "\n");
            exit(2);
        }
    }
    if (file_put_contents($path, $raw) === false) {
        fwrite(STDERR, "WRITE FAIL: $path\n");
        exit(3);
    }
    echo "PATCHED $path\n";
}

// 1) Student-only login guard on POST /api/v1/login.
$guard = "        // This endpoint backs the online examination portal, a student-facing\n"
    . "        // surface: privileged roles (admin, teacher, encoder) must authenticate\n"
    . "        // through their own entry points. Mirrors the student-only rule already\n"
    . "        // enforced in TelegramAuthController::login.\n"
    . "        \$roleSlug = \$user->role?->slug;\n"
    . "        if (\$roleSlug && \$roleSlug !== 'student') {\n"
    . "            \\Log::warning('Non-student account blocked from student login', [\n"
    . "                'user_id' => \$user->id,\n"
    . "                'role' => \$roleSlug,\n"
    . "                'ip' => \$request->ip(),\n"
    . "            ]);\n"
    . "\n"
    . "            return \$this->forbiddenResponse('The online examination portal is available to student accounts only.');\n"
    . "        }\n"
    . "\n";

patch($base . 'app/Http/Controllers/Api/V1/Auth/AuthController.php', [[
    "        \$token = \$user->createToken('auth_token', [\n",
    $guard . "        \$token = \$user->createToken('auth_token', [\n",
]]);

// 2) CORS: allow the exam-portal deployment origin (+ its Vercel previews).
patch($base . 'config/cors.php', [
    [
        "        'https://www.ofijan.com',\n",
        "        'https://www.ofijan.com',\n"
        . "        // Online examination portal (student-facing exam app)\n"
        . "        'https://online-examination-system-olive.vercel.app',\n",
    ],
    [
        "        '/^https:\\/\\/ofijan-cms-.*\\.vercel\\.app\$/',\n",
        "        '/^https:\\/\\/ofijan-cms-.*\\.vercel\\.app\$/',\n"
        . "        // Exam portal previews only — NOT any *.vercel.app\n"
        . "        '/^https:\\/\\/online-examination-system-.*\\.vercel\\.app\$/',\n",
    ],
]);
