-- Base de données du système de présence RFID
-- Import : phpMyAdmin > Importer, ou  mysql -u root < database.sql

CREATE DATABASE IF NOT EXISTS rfid_attendance
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE rfid_attendance;

-- Personnes (étudiants / employés)
CREATE TABLE IF NOT EXISTS users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  serial_no   VARCHAR(50)  DEFAULT NULL,          -- matricule / CNE
  email       VARCHAR(120) DEFAULT NULL,
  card_uid    VARCHAR(20)  DEFAULT NULL UNIQUE,   -- UID hexadécimal du badge
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Appareils (un NodeMCU = une ligne)
CREATE TABLE IF NOT EXISTS devices (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(80) NOT NULL,
  device_token  VARCHAR(32) NOT NULL UNIQUE,
  mode          ENUM('attendance','enroll') NOT NULL DEFAULT 'attendance',
  last_seen     DATETIME DEFAULT NULL
) ENGINE=InnoDB;

-- Journal des présences
CREATE TABLE IF NOT EXISTS logs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  device_id   INT DEFAULT NULL,
  card_uid    VARCHAR(20) NOT NULL,
  log_date    DATE NOT NULL,
  time_in     TIME NOT NULL,
  time_out    TIME DEFAULT NULL,
  INDEX idx_date (log_date),
  CONSTRAINT fk_logs_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
  CONSTRAINT fk_logs_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Dernier badge scanné en mode « enregistrement » (une seule ligne)
CREATE TABLE IF NOT EXISTS scan_buffer (
  id          TINYINT PRIMARY KEY DEFAULT 1,
  card_uid    VARCHAR(20) DEFAULT NULL,
  scanned_at  DATETIME DEFAULT NULL
) ENGINE=InnoDB;
INSERT IGNORE INTO scan_buffer (id) VALUES (1);

-- Dernier scan (tous modes) pour l'affichage en direct du tableau de bord
CREATE TABLE IF NOT EXISTS last_event (
  id          TINYINT PRIMARY KEY DEFAULT 1,
  card_uid    VARCHAR(20) DEFAULT NULL,
  user_name   VARCHAR(100) DEFAULT NULL,
  event       VARCHAR(20) DEFAULT NULL,   -- login | logout | unknown | enroll
  event_at    DATETIME DEFAULT NULL
) ENGINE=InnoDB;
INSERT IGNORE INTO last_event (id) VALUES (1);

-- Appareil de départ : même token que dans le sketch Arduino
INSERT IGNORE INTO devices (name, device_token, mode)
VALUES ('Porte principale', 'b3652ada55e4baca', 'attendance');
