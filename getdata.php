<?php
// Appelé par le NodeMCU :  getdata.php?card_uid=XXXXXXXX&device_token=XXXX
// Réponses (texte brut) compatibles avec le sketch Arduino :
//   login<Nom> | logout<Nom> | succesful | available | assigned | notfound | invalid
require __DIR__ . '/config.php';
header('Content-Type: text/plain; charset=utf-8');

$uid   = strtoupper(trim($_GET['card_uid'] ?? ''));
$token = trim($_GET['device_token'] ?? '');

if (!preg_match('/^[0-9A-F]{4,20}$/', $uid) || $token === '') {
    echo 'invalid';
    exit;
}

$pdo = db();

// 1) Appareil autorisé ?
$st = $pdo->prepare('SELECT * FROM devices WHERE device_token = ?');
$st->execute([$token]);
$device = $st->fetch();
if (!$device) {
    echo 'invalid';
    exit;
}
$pdo->prepare('UPDATE devices SET last_seen = NOW() WHERE id = ?')->execute([$device['id']]);

// 2) Badge connu ?
$st = $pdo->prepare('SELECT * FROM users WHERE card_uid = ?');
$st->execute([$uid]);
$user = $st->fetch();

$setEvent = $pdo->prepare(
    'UPDATE last_event SET card_uid = ?, user_name = ?, event = ?, event_at = NOW() WHERE id = 1'
);

// ---- Mode enregistrement : on mémorise l'UID pour le formulaire « Ajouter » ----
if ($device['mode'] === 'enroll') {
    if ($user) {
        $setEvent->execute([$uid, $user['name'], 'enroll', ]);
        echo 'assigned';
        exit;
    }
    $pdo->prepare('UPDATE scan_buffer SET card_uid = ?, scanned_at = NOW() WHERE id = 1')->execute([$uid]);
    $setEvent->execute([$uid, null, 'enroll']);
    echo 'available';
    exit;
}

// ---- Mode présence ----
if (!$user) {
    $setEvent->execute([$uid, null, 'unknown']);
    echo 'notfound';
    exit;
}

$today = date('Y-m-d');
$now   = date('H:i:s');

// Dernière ligne du jour de cette personne
$st = $pdo->prepare('SELECT * FROM logs WHERE user_id = ? AND log_date = ? ORDER BY id DESC LIMIT 1');
$st->execute([$user['id'], $today]);
$last = $st->fetch();

// Anti-rebond : ignorer un second passage dans les 10 secondes
if ($last) {
    $lastTime = $last['time_out'] ?: $last['time_in'];
    if (strtotime("$today $now") - strtotime("$today $lastTime") < 10) {
        echo ($last['time_out'] ? 'logout' : 'login') . $user['name'];
        exit;
    }
}

if ($last && $last['time_out'] === null) {
    // Sortie
    $pdo->prepare('UPDATE logs SET time_out = ? WHERE id = ?')->execute([$now, $last['id']]);
    $setEvent->execute([$uid, $user['name'], 'logout']);
    echo 'logout' . $user['name'];
} else {
    // Entrée
    $pdo->prepare('INSERT INTO logs (user_id, device_id, card_uid, log_date, time_in) VALUES (?,?,?,?,?)')
        ->execute([$user['id'], $device['id'], $uid, $today, $now]);
    $setEvent->execute([$uid, $user['name'], 'login']);
    echo 'login' . $user['name'];
}
