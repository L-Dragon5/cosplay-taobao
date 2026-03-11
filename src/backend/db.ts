import { SQL } from "bun"

const { DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_DATABASE } = process.env

export const db = new SQL(
  `mysql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_DATABASE}`,
)

export async function initDb() {
  await db`CREATE TABLE IF NOT EXISTS items (
		id INT AUTO_INCREMENT PRIMARY KEY,
		image_url VARCHAR(2083) NULL,
		original_title VARCHAR(2083) NOT NULL,
		custom_title VARCHAR(2083) NULL,
		seller_name VARCHAR(255) NULL,
		listing_url VARCHAR(2083) NOT NULL,
		notes TEXT NULL,
		original_price VARCHAR(255) NULL,
		is_archived TINYINT(1) DEFAULT 0,
		archived_at TIMESTAMP NULL,
		created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
	)`
}
