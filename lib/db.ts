import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

let db: any = null;

export async function getDb() {
  if (!db) {
    try {
      db = await open({
        filename: path.join(process.cwd(), 'database.sqlite'),
        driver: sqlite3.Database
      });

      console.log('Database connected successfully');

      // Create users table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create categories table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          color TEXT DEFAULT '#6366f1',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(user_id, name)
        )
      `);

      // Create credentials table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS credentials (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          category_id INTEGER,
          title TEXT NOT NULL,
          site_link TEXT,
          username TEXT,
          password TEXT NOT NULL,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
        )
      `);

      console.log('All database tables created/verified');
    } catch (error) {
      console.error('Database initialization error:', error);
      throw error;
    }
  }
  
  return db;
}

// User functions
export async function createUser(username: string, passwordHash: string, salt: string) {
  const db = await getDb();
  
  try {
    const result = await db.run(
      'INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)',
      [username, passwordHash, salt]
    );
    return { success: true, userId: result.lastID };
  } catch (error: any) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return { success: false, error: 'Username already exists' };
    }
    return { success: false, error: 'Database error' };
  }
}

export async function getUserByUsername(username: string) {
  const db = await getDb();
  const user = await db.get(
    'SELECT id, username, password_hash, salt FROM users WHERE username = ?',
    [username]
  );
  return user;
}

// Category functions
export async function createCategory(userId: number, name: string, color: string = '#6366f1') {
  const db = await getDb();
  
  try {
    const result = await db.run(
      'INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)',
      [userId, name, color]
    );
    return { success: true, categoryId: result.lastID };
  } catch (error: any) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return { success: false, error: 'Category already exists' };
    }
    return { success: false, error: 'Database error' };
  }
}

export async function getCategories(userId: number) {
  const db = await getDb();
  const categories = await db.all(
    'SELECT * FROM categories WHERE user_id = ? ORDER BY name',
    [userId]
  );
  return categories;
}

export async function deleteCategory(categoryId: number, userId: number) {
  const db = await getDb();
  const result = await db.run(
    'DELETE FROM categories WHERE id = ? AND user_id = ?',
    [categoryId, userId]
  );
  return result.changes > 0;
}

// Credential functions
export async function createCredential(
  userId: number,
  categoryId: number | null,
  title: string,
  siteLink: string,
  username: string,
  password: string,
  description: string
) {
  const db = await getDb();
  
  const result = await db.run(
    `INSERT INTO credentials (user_id, category_id, title, site_link, username, password, description) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, categoryId, title, siteLink, username, password, description]
  );
  
  return { success: true, credentialId: result.lastID };
}

export async function getCredentials(userId: number, categoryId?: number | null) {
  const db = await getDb();
  
  let query = `
    SELECT c.*, cat.name as category_name, cat.color as category_color
    FROM credentials c
    LEFT JOIN categories cat ON c.category_id = cat.id
    WHERE c.user_id = ?
  `;
  
  const params: any[] = [userId];
  
  if (categoryId !== undefined) {
    if (categoryId === null) {
      query += ' AND c.category_id IS NULL';
    } else {
      query += ' AND c.category_id = ?';
      params.push(categoryId);
    }
  }
  
  query += ' ORDER BY c.created_at DESC';
  
  const credentials = await db.all(query, params);
  return credentials;
}

export async function updateCredential(
  credentialId: number,
  userId: number,
  data: {
    categoryId?: number | null;
    title?: string;
    siteLink?: string;
    username?: string;
    password?: string;
    description?: string;
  }
) {
  const db = await getDb();
  
  const fields = [];
  const values = [];
  
  if (data.categoryId !== undefined) {
    fields.push('category_id = ?');
    values.push(data.categoryId);
  }
  if (data.title) {
    fields.push('title = ?');
    values.push(data.title);
  }
  if (data.siteLink !== undefined) {
    fields.push('site_link = ?');
    values.push(data.siteLink);
  }
  if (data.username !== undefined) {
    fields.push('username = ?');
    values.push(data.username);
  }
  if (data.password) {
    fields.push('password = ?');
    values.push(data.password);
  }
  if (data.description !== undefined) {
    fields.push('description = ?');
    values.push(data.description);
  }
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  
  values.push(credentialId, userId);
  
  const result = await db.run(
    `UPDATE credentials SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
    values
  );
  
  return result.changes > 0;
}

export async function deleteCredential(credentialId: number, userId: number) {
  const db = await getDb();
  const result = await db.run(
    'DELETE FROM credentials WHERE id = ? AND user_id = ?',
    [credentialId, userId]
  );
  return result.changes > 0;
}

export async function searchCredentials(userId: number, searchTerm: string) {
  const db = await getDb();
  
  const credentials = await db.all(
    `SELECT c.*, cat.name as category_name, cat.color as category_color
     FROM credentials c
     LEFT JOIN categories cat ON c.category_id = cat.id
     WHERE c.user_id = ? 
     AND (c.title LIKE ? OR c.description LIKE ? OR cat.name LIKE ? OR c.site_link LIKE ?)
     ORDER BY c.created_at DESC`,
    [userId, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]
  );
  
  return credentials;
}