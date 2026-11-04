CREATE DATABASE IF NOT EXISTS paws;
USE paws;

-- A separate table leaves the professor's existing student table untouched.
CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash CHAR(128) NOT NULL,
    salt CHAR(32) NOT NULL
);
