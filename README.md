# Système de présence RFID (NodeMCU + RC522 + XAMPP)

## 1. Installation sur le PC (serveur)
1. Démarrez **Apache** et **MySQL** dans XAMPP.
2. Copiez le dossier `rfidattendance` dans `C:\xampp\htdocs\`.
3. Ouvrez http://localhost/phpmyadmin → onglet **Importer** → choisissez `sql/database.sql`.
4. Ouvrez http://localhost/rfidattendance/ → connexion : `admin` / `admin123`
   (à changer dans `config.php`).

## 2. Réseau
- Relevez l'IPv4 du PC : `ipconfig` (ex. 192.168.1.8). Le PC et le NodeMCU doivent être sur le même routeur.
- Pare-feu Windows : autorisez Apache (port 80) sur le réseau privé.
- Dans le sketch Arduino, mettez cette IP :
  `const char* URL = "http://192.168.1.8/rfidattendance/getdata.php";`
- Test sans la carte, dans le navigateur :
  `http://192.168.1.8/rfidattendance/getdata.php?card_uid=AABBCCDD&device_token=b3652ada55e4baca`
  → doit répondre `available` (mode enregistrement) ou `notfound` (mode présence).

## 3. Câblage (RC522 → NodeMCU)
3.3V→3V3 · RST→D1 · GND→GND · MISO→D6 · MOSI→D7 · SCK→D5 · SDA/SS→D2 · IRQ non connecté.
Alimentez le RC522 en **3,3 V uniquement** (pas 5 V).

## 4. Utilisation
1. Onglet **Utilisateurs** → *Ajouter un utilisateur* → *Lire un badge* → passez la carte → *Enregistrer*.
2. L'appareil repasse automatiquement en mode **Présence** : 1er passage = entrée, 2e = sortie.
3. **Tableau de bord** : lecteur en direct, statistiques, passages du jour. **Présences** : historique + export CSV.

## Réponses de getdata.php
login<Nom> · logout<Nom> · available (nouveau badge, mode enregistrement) · assigned (badge déjà attribué)
· notfound (badge inconnu) · invalid (token ou UID incorrect)
