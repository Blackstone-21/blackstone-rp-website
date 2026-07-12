<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Cache-Control: public, max-age=10, stale-while-revalidate=60');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$endpoint = '163.227.178.25:30123';
$joinCode = '4xlaj5';
$joinUrl = 'https://cfx.re/join/4xlaj5';

function fetch_json($url) {
    $started = microtime(true);

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 5,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'User-Agent: BlackstoneRP-Website/4.2'
            ]
        ]);
        $body = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($body !== false && $status >= 200 && $status < 300) {
            $json = json_decode($body, true);
            if (is_array($json)) {
                return [
                    'payload' => $json,
                    'responseMs' => (int)round((microtime(true) - $started) * 1000)
                ];
            }
        }
        return null;
    }

    $context = stream_context_create(['http' => [
        'timeout' => 5,
        'ignore_errors' => true,
        'header' => "Accept: application/json\r\nUser-Agent: BlackstoneRP-Website/4.2\r\n"
    ]]);
    $body = @file_get_contents($url, false, $context);
    if ($body === false) return null;

    $json = json_decode($body, true);
    if (!is_array($json)) return null;

    return [
        'payload' => $json,
        'responseMs' => (int)round((microtime(true) - $started) * 1000)
    ];
}

function clean_name($value) {
    $value = preg_replace('/\^[0-9A-Za-z]/', '', (string)$value);
    $value = preg_replace('/[\x00-\x1F\x7F]/', '', $value);
    return trim(strip_tags($value));
}

function first_number($values) {
    foreach ($values as $value) {
        if ($value === null || $value === '') continue;
        if (is_numeric($value)) return (float)$value;
    }
    return 0;
}

function normalise($payload, $source, $endpoint, $joinUrl, $responseMs) {
    $data = $payload['Data'] ?? $payload['data'] ?? $payload;
    if (!is_array($data) || isset($payload['error'])) return null;

    $vars = (isset($data['vars']) && is_array($data['vars'])) ? $data['vars'] : [];
    $rawPlayers = [];
    if (isset($data['players']) && is_array($data['players'])) {
        $rawPlayers = $data['players'];
    } elseif (isset($payload['playerList']) && is_array($payload['playerList'])) {
        $rawPlayers = $payload['playerList'];
    }

    $playerList = [];
    foreach ($rawPlayers as $player) {
        $name = is_array($player) ? ($player['name'] ?? '') : $player;
        $name = clean_name($name);
        if ($name !== '') $playerList[] = $name;
        if (count($playerList) >= 64) break;
    }

    $payloadPlayers = $payload['players'] ?? null;
    if (is_array($payloadPlayers)) $payloadPlayers = count($payloadPlayers);

    $players = first_number([
        $data['clients'] ?? null,
        $data['playerCount'] ?? null,
        $payloadPlayers,
        count($playerList)
    ]);
    $maxPlayers = first_number([
        $data['svMaxclients'] ?? null,
        $data['svMaxClients'] ?? null,
        $data['sv_maxclients'] ?? null,
        $data['maxClients'] ?? null,
        $data['maxplayers'] ?? null,
        $payload['maxPlayers'] ?? null,
        $vars['sv_maxClients'] ?? null,
        $vars['sv_maxclients'] ?? null
    ]);

    $name = clean_name(
        $data['hostname']
        ?? $payload['name']
        ?? $vars['sv_projectName']
        ?? $vars['sv_projectDesc']
        ?? 'Blackstone RP'
    );

    return [
        'online' => true,
        'name' => $name !== '' ? $name : 'Blackstone RP',
        'players' => max(0, (int)round($players)),
        'maxPlayers' => max(0, (int)round($maxPlayers)),
        'playerList' => $playerList,
        'endpoint' => $endpoint,
        'joinUrl' => $joinUrl,
        'source' => $source,
        'responseMs' => max(0, (int)$responseMs),
        'message' => 'Live server data received successfully.',
        'checkedAt' => gmdate('c')
    ];
}

$attempts = [
    ['https://servers-frontend.fivem.net/api/servers/single/' . $joinCode, 'CFX SERVER LIST'],
    ['http://' . $endpoint . '/dynamic.json', 'DIRECT SERVER FEED'],
    ['http://' . $endpoint . '/info.json', 'DIRECT SERVER INFO']
];

$errors = [];
foreach ($attempts as $attempt) {
    $result = fetch_json($attempt[0]);
    if ($result !== null) {
        $normalised = normalise($result['payload'], $attempt[1], $endpoint, $joinUrl, $result['responseMs']);
        if ($normalised !== null) {
            echo json_encode($normalised, JSON_UNESCAPED_SLASHES);
            exit;
        }
    }
    $errors[] = $attempt[1] . ': no usable response';
}

echo json_encode([
    'online' => false,
    'name' => 'Blackstone RP',
    'players' => 0,
    'maxPlayers' => 0,
    'playerList' => [],
    'endpoint' => $endpoint,
    'joinUrl' => $joinUrl,
    'source' => 'PHP STATUS PROXY',
    'responseMs' => 0,
    'message' => 'No live response was received. The server may be offline, restarting, or temporarily unavailable.',
    'checkedAt' => gmdate('c'),
    'diagnostics' => $errors
], JSON_UNESCAPED_SLASHES);
