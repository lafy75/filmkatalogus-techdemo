-- Filmkatalogus - kozos adatbazis a negy backendhez
-- Importalas: XAMPP -> phpMyAdmin -> Importalas -> ez a fajl (UTF-8)
-- vagy parancssorbol: mysql -u root < filmkatalogus.sql
-- MariaDB 10.4 (XAMPP) es MySQL 8 kompatibilis.

SET NAMES utf8mb4;

DROP DATABASE IF EXISTS filmkatalogus;
CREATE DATABASE filmkatalogus
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_hungarian_ci;

USE filmkatalogus;

CREATE TABLE filmek (
  id        INT          NOT NULL AUTO_INCREMENT,
  cim       VARCHAR(100) NOT NULL,
  ev        INT          NOT NULL,
  perc      INT          NOT NULL,
  mufaj     VARCHAR(30)  NOT NULL,
  ertekeles INT          NOT NULL DEFAULT 0,      -- 0 = meg nincs ertekelve, 1-5 csillag
  kedvenc   BOOLEAN      NOT NULL DEFAULT FALSE,  -- a BOOLEAN valojaban TINYINT(1)
  PRIMARY KEY (id)
);

-- A frontend orak ot filmje, valtozatlanul
INSERT INTO filmek (id, cim, ev, perc, mufaj, ertekeles, kedvenc) VALUES
  (1, 'Mátrix',       1999, 136, 'sci-fi', 5, TRUE),
  (2, 'Alien',        1979, 117, 'horror', 4, FALSE),
  (3, 'Duna',         2021, 155, 'sci-fi', 4, FALSE),
  (4, 'Hetedik',      1995, 127, 'krimi',  5, TRUE),
  (5, 'Interstellar', 2014, 169, 'sci-fi', 0, FALSE);
