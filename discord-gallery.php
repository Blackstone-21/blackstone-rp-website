<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'message' => 'Method not allowed.']);
    exit;
}

function env_value($name) {
    $value = getenv($name);
    if ($value === false || $value === '') {
        $value = $_SERVER[$name] ?? $_ENV[$name] ?? '';
    }
    return trim((string)$value);
}

function clean_gallery_text($value, $maxLength = 220) {
    $value = preg_replace('/<@!?\d+>/', '', (string)$value);
    $value = preg_replace('/<@&\d+>/', '', $value);
    $value = preg_replace('/<#\d+>/', '', $value);
    $value = preg_replace('/<a?:[A-Za-z0-9_]+:\d+>/', '', $value);
    $value = preg_replace('/[\x00-\x1F\x7F]/', ' ', $value);
    $value = preg_replace('/\s+/', ' ', $value);
    $value = trim($value);
    return function_exists('mb_substr') ? mb_substr($value, 0, $maxLength) : substr($value, 0, $maxLength);
}

function is_discord_cdn_url($value) {
    $parts = parse_url((string)$value);
    if (!is_array($parts)) return false;
    $scheme = strtolower($parts['scheme'] ?? '');
    $host = strtolower($parts['host'] ?? '');
    return $scheme === 'https' && in_array($host, ['cdn.discordapp.com', 'media.discordapp.net'], true);
}

function is_image_attachment($attachment) {
    if (!is_array($attachment)) return false;
    $url = $attachment['url'] ?? $attachment['proxy_url'] ?? '';
    if (!is_discord_cdn_url($url)) return false;
    $contentType = strtolower((string)($attachment['content_type'] ?? ''));
    $filename = strtolower((string)($attachment['filename'] ?? $url));
    return strpos($contentType, 'image/') === 0 || preg_match('/\.(png|jpe?g|gif|webp|avif)(?:$|\?)/i', $filename);
}

function fetch_discord_messages($token, $channelId) {
    $url = 'https://discord.com/api/v10/channels/' . rawurlencode($channelId) . '/messages?limit=100';
    $headers = [
        'Accept: application/json',
        'Authorization: Bot ' . $token,
        'User-Agent: BlackstoneRP-Website/3.0 (Discord Gallery)'
    ];

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 9,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTPHEADER => $headers
        ]);
        $body = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);
        return ['status' => $status, 'body' => $body, 'error' => $curlError];
    }

    $context = stream_context_create(['http' => [
        'method' => 'GET',
        'timeout' => 9,
        'ignore_errors' => true,
        'header' => implode("\r\n", $headers) . "\r\n"
    ]]);
    $body = @file_get_contents($url, false, $context);
    $status = 0;
    if (isset($http_response_header) && is_array($http_response_header)) {
        foreach ($http_response_header as $headerLine) {
            if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $headerLine, $match)) {
                $status = (int)$match[1];
                break;
            }
        }
    }
    return ['status' => $status, 'body' => $body, 'error' => $body === false ? 'Request failed.' : ''];
}

function error_message_for_status($status) {
    if ($status === 401) return 'The Discord bot token was rejected.';
    if ($status === 403) return 'The Discord bot cannot view this channel or read its message history.';
    if ($status === 404) return 'The configured Discord channel could not be found.';
    if ($status === 429) return 'Discord is temporarily rate limiting the gallery feed. Please try again shortly.';
    return 'The Discord gallery feed could not be loaded.';
}

$token = env_value('DISCORD_BOT_TOKEN');
$channelId = env_value('DISCORD_GALLERY_CHANNEL_ID');
if ($channelId === '') $channelId = env_value('DISCORD_CHANNEL_ID');
if ($channelId === '') $channelId = '1520414735772811394';
$limitValue = env_value('DISCORD_GALLERY_LIMIT');
$imageLimit = is_numeric($limitValue) ? max(1, min(48, (int)$limitValue)) : 24;

if ($token === '' || $channelId === '' || !preg_match('/^\d+$/', $channelId)) {
    header('Cache-Control: no-store, max-age=0');
    http_response_code(503);
    echo json_encode([
        'ok' => false,
        'configured' => false,
        'message' => 'The Discord gallery connection has not been configured on the website host.',
        'fetchedAt' => gmdate('c')
    ], JSON_UNESCAPED_SLASHES);
    exit;
}

$cacheFile = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'blackstone-discord-gallery-' . hash('sha256', $channelId) . '.json';
if (is_file($cacheFile) && filemtime($cacheFile) !== false && filemtime($cacheFile) > time() - 60) {
    $cached = @file_get_contents($cacheFile);
    if ($cached !== false) {
        header('Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300');
        echo $cached;
        exit;
    }
}

$result = fetch_discord_messages($token, $channelId);
$status = (int)$result['status'];
$messages = json_decode((string)$result['body'], true);

if ($status < 200 || $status >= 300 || !is_array($messages)) {
    header('Cache-Control: no-store, max-age=0');
    http_response_code($status === 429 ? 503 : 502);
    echo json_encode([
        'ok' => false,
        'configured' => true,
        'message' => error_message_for_status($status),
        'fetchedAt' => gmdate('c')
    ], JSON_UNESCAPED_SLASHES);
    exit;
}

$images = [];
$seen = [];
foreach ($messages as $message) {
    if (!is_array($message)) continue;
    $attachments = isset($message['attachments']) && is_array($message['attachments']) ? $message['attachments'] : [];
    foreach ($attachments as $attachment) {
        if (!is_image_attachment($attachment)) continue;
        $url = $attachment['url'] ?? $attachment['proxy_url'];
        $key = (string)($attachment['id'] ?? $url);
        if (isset($seen[$key])) continue;
        $seen[$key] = true;

        $caption = clean_gallery_text($message['content'] ?? '');
        if ($caption === '') $caption = clean_gallery_text($attachment['description'] ?? '');
        if ($caption === '') $caption = clean_gallery_text($attachment['filename'] ?? '', 120);
        if ($caption === '') $caption = 'Blackstone RP community screenshot';

        $images[] = [
            'id' => (string)($message['id'] ?? '') . '-' . (string)($attachment['id'] ?? ''),
            'url' => $url,
            'filename' => clean_gallery_text($attachment['filename'] ?? '', 140),
            'caption' => $caption,
            'alt' => clean_gallery_text($attachment['description'] ?? '') ?: $caption,
            'timestamp' => $message['timestamp'] ?? $message['edited_timestamp'] ?? gmdate('c'),
            'width' => isset($attachment['width']) && is_numeric($attachment['width']) ? (int)$attachment['width'] : null,
            'height' => isset($attachment['height']) && is_numeric($attachment['height']) ? (int)$attachment['height'] : null
        ];

        if (count($images) >= $imageLimit) break 2;
    }
}

$payload = json_encode([
    'ok' => true,
    'configured' => true,
    'source' => 'DISCORD CHANNEL',
    'count' => count($images),
    'images' => $images,
    'fetchedAt' => gmdate('c')
], JSON_UNESCAPED_SLASHES);

@file_put_contents($cacheFile, $payload, LOCK_EX);
header('Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300');
echo $payload;
