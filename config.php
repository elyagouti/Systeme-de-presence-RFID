<?php
// Configuration XAMPP par défaut : utilisateur root, sans mot de passe.
const DB_HOST = 'localhost';
const DB_NAME = 'rfid_attendance';
const DB_USER = 'root';
const DB_PASS = '';

// Accès à l'interface d'administration : changez ce mot de passe.
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';

date_default_timezone_set('Africa/Casablanca');

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]
        );
        // Aligne le fuseau horaire MySQL sur celui de PHP
        $pdo->exec("SET time_zone = '" . date('P') . "'");
    }
    return $pdo;
}
