<?php
// API JSON de l'interface d'administration (session PHP).
require __DIR__ . '/config.php';
session_start();

$action = $_GET['action'] ?? '';
$in = json_decode(file_get_contents('php://input'), true) ?? [];

function out($data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    // ---- Authentification ----
    if ($action === 'login') {
        if (hash_equals(ADMIN_USER, (string)($in['username'] ?? '')) &&
            hash_equals(ADMIN_PASS, (string)($in['password'] ?? ''))) {
            session_regenerate_id(true);
            $_SESSION['admin'] = true;
            out(['ok' => true]);
        }
        out(['ok' => false, 'error' => 'Identifiant ou mot de passe incorrect.'], 401);
    }
    if ($action === 'session') {
        out(['ok' => !empty($_SESSION['admin'])]);
    }
    if (empty($_SESSION['admin'])) {
        out(['ok' => false, 'error' => 'Non connecté.'], 401);
    }
    if ($action === 'logout') {
        session_destroy();
        out(['ok' => true]);
    }

    $pdo = db();

    switch ($action) {

        // ---- Tableau de bord ----
        case 'stats':
            $today = date('Y-m-d');
            $users = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
            $st = $pdo->prepare('SELECT COUNT(DISTINCT user_id) FROM logs WHERE log_date = ?');
            $st->execute([$today]);
            $present = (int)$st->fetchColumn();
            $st = $pdo->prepare('SELECT COUNT(*) FROM logs WHERE log_date = ? AND time_out IS NULL');
            $st->execute([$today]);
            $inside = (int)$st->fetchColumn();
            $last = $pdo->query('SELECT * FROM last_event WHERE id = 1')->fetch();
            out(['users' => $users, 'present' => $present, 'inside' => $inside,
                 'absent' => max(0, $users - $present), 'last' => $last,
                 'server_time' => date('Y-m-d H:i:s')]);

        // ---- Utilisateurs ----
        case 'users':
            out($pdo->query('SELECT * FROM users ORDER BY name')->fetchAll());

        case 'user_save':
            $name = trim($in['name'] ?? '');
            if ($name === '') out(['ok' => false, 'error' => 'Le nom est obligatoire.'], 422);
            $uid = strtoupper(trim($in['card_uid'] ?? '')) ?: null;
            if ($uid !== null && !preg_match('/^[0-9A-F]{4,20}$/', $uid)) {
                out(['ok' => false, 'error' => "UID invalide (hexadécimal attendu)."], 422);
            }
            $vals = [$name, trim($in['serial_no'] ?? '') ?: null, trim($in['email'] ?? '') ?: null, $uid];
            try {
                if (!empty($in['id'])) {
                    $pdo->prepare('UPDATE users SET name=?, serial_no=?, email=?, card_uid=? WHERE id=?')
                        ->execute([...$vals, (int)$in['id']]);
                } else {
                    $pdo->prepare('INSERT INTO users (name, serial_no, email, card_uid) VALUES (?,?,?,?)')
                        ->execute($vals);
                    // Le badge vient d'être attribué : on vide le tampon
                    $pdo->exec('UPDATE scan_buffer SET card_uid = NULL, scanned_at = NULL WHERE id = 1');
                }
            } catch (PDOException $e) {
                if ($e->getCode() === '23000') out(['ok' => false, 'error' => 'Ce badge est déjà attribué.'], 409);
                throw $e;
            }
            out(['ok' => true]);

        case 'user_delete':
            $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([(int)($in['id'] ?? 0)]);
            out(['ok' => true]);

        // ---- Journal des présences ----
        case 'logs':
            $from = $_GET['from'] ?? date('Y-m-d');
            $to   = $_GET['to']   ?? date('Y-m-d');
            $uid  = (int)($_GET['user_id'] ?? 0);
            $sql  = 'SELECT l.id, l.log_date, l.time_in, l.time_out, l.card_uid, u.name, u.serial_no, d.name AS device
                     FROM logs l JOIN users u ON u.id = l.user_id
                     LEFT JOIN devices d ON d.id = l.device_id
                     WHERE l.log_date BETWEEN ? AND ?';
            $args = [$from, $to];
            if ($uid) { $sql .= ' AND l.user_id = ?'; $args[] = $uid; }
            $sql .= ' ORDER BY l.log_date DESC, l.time_in DESC';
            $st = $pdo->prepare($sql);
            $st->execute($args);
            out($st->fetchAll());

        case 'log_delete':
            $pdo->prepare('DELETE FROM logs WHERE id = ?')->execute([(int)($in['id'] ?? 0)]);
            out(['ok' => true]);

        // ---- Appareils ----
        case 'devices':
            out($pdo->query('SELECT * FROM devices ORDER BY id')->fetchAll());

        case 'device_mode':
            $mode = ($in['mode'] ?? '') === 'enroll' ? 'enroll' : 'attendance';
            $pdo->prepare('UPDATE devices SET mode = ? WHERE id = ?')->execute([$mode, (int)($in['id'] ?? 0)]);
            out(['ok' => true]);

        case 'device_add':
            $name = trim($in['name'] ?? '');
            if ($name === '') out(['ok' => false, 'error' => 'Le nom est obligatoire.'], 422);
            $token = bin2hex(random_bytes(8));
            $pdo->prepare('INSERT INTO devices (name, device_token) VALUES (?, ?)')->execute([$name, $token]);
            out(['ok' => true, 'token' => $token]);

        case 'device_delete':
            $pdo->prepare('DELETE FROM devices WHERE id = ?')->execute([(int)($in['id'] ?? 0)]);
            out(['ok' => true]);

        // ---- Dernier badge scanné en mode enregistrement ----
        case 'last_scan':
            $row = $pdo->query('SELECT card_uid, scanned_at FROM scan_buffer WHERE id = 1')->fetch();
            out($row);

        case 'scan_clear':
            $pdo->exec('UPDATE scan_buffer SET card_uid = NULL, scanned_at = NULL WHERE id = 1');
            out(['ok' => true]);

        default:
            out(['ok' => false, 'error' => 'Action inconnue.'], 404);
    }
} catch (Throwable $e) {
    out(['ok' => false, 'error' => 'Erreur serveur : ' . $e->getMessage()], 500);
}
