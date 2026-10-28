-- ==============================================================================
-- CHACHAJI BRAND DATABASE SCHEMA DUMP
-- Database: chachaji-brand
-- Engine: InnoDB | Character Set: utf8mb4
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS `chachaji-brand` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `chachaji-brand`;

-- ------------------------------------------------------------------------------
-- Table 1: EMPLOYEES (Admins & Sales Representatives)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `employees` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `staff_code` VARCHAR(10) NOT NULL UNIQUE,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('Admin', 'Salesman') NOT NULL DEFAULT 'Salesman',
  `phone` VARCHAR(50) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `reset_token` VARCHAR(255) DEFAULT NULL,
  `reset_token_expires` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------------------------
-- Table 2: CATEGORIES (Product Categories & Taxonomies)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `categories` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) NOT NULL UNIQUE,
  `parent_id` INT DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `image_url` VARCHAR(500) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------------------------
-- Table 3: PRODUCTS (SIMPLE and VARIABLE Parent Products)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `products` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `type` ENUM('SIMPLE', 'VARIABLE') NOT NULL DEFAULT 'SIMPLE',
  `name` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) NOT NULL UNIQUE,
  `sku` VARCHAR(100) NOT NULL UNIQUE,
  `category_id` INT DEFAULT NULL,
  `brand` VARCHAR(100) DEFAULT 'Chachaji',
  `unit` VARCHAR(50) DEFAULT 'pcs',
  `short_description` TEXT DEFAULT NULL,
  `description` LONGTEXT DEFAULT NULL,
  `primary_image` VARCHAR(500) DEFAULT NULL,
  `gallery_images` JSON DEFAULT NULL,
  `regular_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `sale_price` DECIMAL(10, 2) DEFAULT NULL,
  `cost_price` DECIMAL(10, 2) DEFAULT NULL,
  `tax_rate` DECIMAL(5, 2) DEFAULT 0.00,
  `hsn_code` VARCHAR(50) DEFAULT NULL,
  `manage_stock` TINYINT(1) NOT NULL DEFAULT 1,
  `stock_quantity` INT NOT NULL DEFAULT 0,
  `low_stock_threshold` INT NOT NULL DEFAULT 5,
  `stock_status` ENUM('in_stock', 'out_of_stock', 'on_backorder') NOT NULL DEFAULT 'in_stock',
  `attributes` JSON DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------------------------
-- Table 4: PRODUCT_VARIATIONS (Child Variations for VARIABLE Products)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `product_variations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `sku` VARCHAR(100) NOT NULL UNIQUE,
  `attributes` JSON NOT NULL,
  `regular_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `sale_price` DECIMAL(10, 2) DEFAULT NULL,
  `cost_price` DECIMAL(10, 2) DEFAULT NULL,
  `stock_quantity` INT NOT NULL DEFAULT 0,
  `low_stock_threshold` INT NOT NULL DEFAULT 5,
  `stock_status` ENUM('in_stock', 'out_of_stock', 'on_backorder') NOT NULL DEFAULT 'in_stock',
  `image_url` VARCHAR(500) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------------------------
-- Table 5: USERS (Retailers, Wholesalers & Buyer Accounts)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_code` VARCHAR(20) NOT NULL UNIQUE,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) DEFAULT NULL,
  `phone` VARCHAR(50) NOT NULL UNIQUE,
  `password` VARCHAR(255) DEFAULT NULL,
  `company_name` VARCHAR(255) DEFAULT NULL,
  `gstin` VARCHAR(50) DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `city` VARCHAR(100) DEFAULT NULL,
  `state` VARCHAR(100) DEFAULT NULL,
  `pincode` VARCHAR(20) DEFAULT NULL,
  `created_by` INT DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`created_by`) REFERENCES `employees`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------------------------
-- Table 6: ORDERS (Sales POS Order Header)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_number` VARCHAR(50) NOT NULL UNIQUE,
  `salesman_id` INT NOT NULL,
  `buyer_id` INT NOT NULL,
  `subtotal` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `total_discount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `tax_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `grand_total` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `paid_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `pending_balance` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `received_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `return_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `payment_method` VARCHAR(100) NOT NULL DEFAULT 'Cash',
  `payment_status` ENUM('Pending', 'Paid', 'Partial') NOT NULL DEFAULT 'Paid',
  `split_payments` JSON DEFAULT NULL,
  `split_returns` JSON DEFAULT NULL,
  `vehicle_number` VARCHAR(100) DEFAULT NULL,
  `driver_name` VARCHAR(255) DEFAULT NULL,
  `order_status` ENUM('Confirmed', 'Processing', 'Delivered', 'Cancelled') NOT NULL DEFAULT 'Confirmed',
  `notes` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`salesman_id`) REFERENCES `employees`(`id`),
  FOREIGN KEY (`buyer_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------------------------
-- Table 7: ORDER_ITEMS (Order Line Items with Negotiated Discounts)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `order_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL,
  `product_id` INT NOT NULL,
  `variation_id` INT DEFAULT NULL,
  `product_name` VARCHAR(255) NOT NULL,
  `sku` VARCHAR(100) NOT NULL,
  `unit_price` DECIMAL(10, 2) NOT NULL,
  `discount_type` ENUM('fixed', 'percentage') NOT NULL DEFAULT 'fixed',
  `discount_value` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `discounted_price` DECIMAL(10, 2) NOT NULL,
  `quantity` INT NOT NULL DEFAULT 1,
  `total_price` DECIMAL(10, 2) NOT NULL,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------------------------
-- Table 8: OTP_VERIFICATIONS (Inline Mobile OTP Verification)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `otp_verifications` (
  `phone` VARCHAR(50) PRIMARY KEY,
  `otp_code` VARCHAR(10) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------------------------
-- Table 9: SETTINGS (Application System & Policy Settings)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `settings` (
  `key` VARCHAR(100) PRIMARY KEY,
  `value` TEXT NOT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `settings` (`key`, `value`, `description`) VALUES
('otp_enabled', 'true', 'Require OTP verification for new customer creation in POS');

