// server.js - Version finale complète avec correction multer et gestion d'erreur
const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// ============================================================
// 0. GESTION ROBUSTE DE MULTER (fallback si non installé)
// ============================================================
let multer, upload;
try {
  multer = require('multer');
  console.log('✅ multer chargé');
} catch (e) {
  console.warn('⚠️ multer non installé, création d\'un upload factice');
  multer = null;
}

// Si multer est disponible, configurer l'upload
if (multer && typeof multer === 'function' && multer.diskStorage) {
  const uploadDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, `product_${unique}${ext}`);
    }
  });

  upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif'];
      cb(null, allowed.includes(file.mimetype));
    }
  });
} else {
  // Fallback si multer n'est pas disponible
  upload = {
    array: () => (req, res, next) => next(),
    single: () => (req, res, next) => next(),
    fields: () => (req, res, next) => next(),
    none: () => (req, res, next) => next()
  };
}

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// MIDDLEWARE DE LOG (pour tracer les requêtes)
// ============================================================
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.url}`);
  next();
});

app.use(cors());
app.use(express.json());

// ============================================================
// 1. INITIALISATION FIREBASE ADMIN (ROBUSTE)
// ============================================================
let firebaseReady = false;

function cleanPrivateKey(key) {
  if (!key) return null;
  let cleaned = key.replace(/^["']|["']$/g, '').trim();
  if (cleaned.includes('\\n')) cleaned = cleaned.replace(/\\n/g, '\n');
  return cleaned;
}

function getFirebaseCredentials() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (privateKey) privateKey = cleanPrivateKey(privateKey);
  if (projectId && clientEmail && privateKey) return { projectId, clientEmail, privateKey };
  try {
    const keyPath = path.join(__dirname, 'serviceAccountKey.json');
    if (fs.existsSync(keyPath)) {
      const json = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      const pk = json.private_key || json.privateKey;
      return {
        projectId: json.project_id || json.projectId,
        clientEmail: json.client_email || json.clientEmail,
        privateKey: cleanPrivateKey(pk)
      };
    }
  } catch (e) {
    console.warn('⚠️ Erreur lecture fichier clé:', e.message);
  }
  return null;
}

try {
  const creds = getFirebaseCredentials();
  if (creds && creds.projectId && creds.clientEmail && creds.privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: creds.projectId,
        clientEmail: creds.clientEmail,
        privateKey: creds.privateKey
      })
    });
    firebaseReady = true;
    console.log('✅ Firebase Admin initialisé');
  } else {
    console.warn('⚠️ Firebase non configuré (variables manquantes)');
  }
} catch (error) {
  console.error('❌ Erreur Firebase:', error.message);
}

// ============================================================
// 2. CONNEXION MYSQL
// ============================================================
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'u641923167_Bytesatomeneon',
  password: process.env.DB_PASSWORD || '=KkY@gKhA2',
  database: process.env.DB_NAME || 'u641923167_Bytesatomeneon',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test non bloquant
pool.getConnection()
  .then(conn => { console.log('✅ MySQL connecté'); conn.release(); })
  .catch(err => console.error('❌ MySQL erreur:', err.message));

// ============================================================
// 3. FONCTION FCM (avec vérification firebaseReady)
// ============================================================
async function sendFCMNotification(userId, title, body, data = {}) {
  if (!firebaseReady) {
    console.log('⚠️ Firebase non initialisé, notification ignorée');
    return false;
  }
  try {
    const [rows] = await pool.query('SELECT fcm_token FROM user_fcm_tokens WHERE id = ?', [userId]);
    if (!rows.length || !rows[0].fcm_token) {
      console.log(`❌ Aucun token FCM pour l'utilisateur ${userId}`);
      return false;
    }
    const token = rows[0].fcm_token;
    const message = {
      notification: { title, body },
      data: { ...data, type: 'new_message', timestamp: new Date().toISOString() },
      android: { priority: 'high', notification: { sound: 'default', channelId: 'client_notifications' } },
      token
    };
    await admin.messaging().send(message);
    console.log(`✅ Notification envoyée à ${userId}`);
    return true;
  } catch (error) {
    console.error('❌ Erreur FCM:', error);
    return false;
  }
}

// ============================================================
// 4. ROUTES DE TEST (DIAGNOSTIC)
// ============================================================
app.get('/', (req, res) => {
  res.json({ message: 'Server is running!' });
});

app.get('/backend/health', (req, res) => {
  console.log('✅ /backend/health atteinte');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/backend/db-test', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 as test');
    res.json({ success: true, result: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 5. ROUTES backend (TOUTES VOS ROUTES EXISTANTES)
// ============================================================

// ---------- 5.1 Inscription / Vérification utilisateur ----------
app.post('/backend/register', async (req, res) => {
  const { email, phone, fcm_token, id_boutique } = req.body;
  if (!email || !phone || !id_boutique) {
    return res.status(400).json({ success: false, error: 'Missing fields' });
  }

  try {
    const [existing] = await pool.query(
      'SELECT id, email, phone, is_admin, id_boutique FROM user_fcm_tokens WHERE phone = ? AND id_boutique = ?',
      [phone, id_boutique]
    );
    if (existing.length > 0) {
      const user = existing[0];
      if (user.email !== email) {
        await pool.query('UPDATE user_fcm_tokens SET email = ? WHERE id = ?', [email, user.id]);
        user.email = email;
      }
      if (fcm_token) {
        await pool.query('UPDATE user_fcm_tokens SET fcm_token = ? WHERE id = ?', [fcm_token, user.id]);
      }
      return res.json({ success: true, user });
    }

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as cnt FROM user_fcm_tokens WHERE id_boutique = ?',
      [id_boutique]
    );
    const is_admin = countResult[0].cnt === 0 ? 1 : 0;

    const user_id = phone;
    const [insertResult] = await pool.query(
      `INSERT INTO user_fcm_tokens (user_id, email, phone, fcm_token, is_admin, id_boutique, created_at, last_active)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [user_id, email, phone, fcm_token, is_admin, id_boutique]
    );

    res.json({
      success: true,
      user: {
        id: insertResult.insertId,
        email,
        phone,
        is_admin,
        id_boutique
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/backend/check_user', async (req, res) => {
  const { email, phone } = req.body;
  if (!email || !phone) {
    return res.status(400).json({ success: false, error: 'Missing fields' });
  }
  try {
    const [rows] = await pool.query(
      'SELECT id, email, phone, is_admin, id_boutique FROM user_fcm_tokens WHERE email = ? AND phone = ?',
      [email, phone]
    );
    if (rows.length > 0) {
      res.json({ success: true, user: rows[0] });
    } else {
      res.json({ success: false });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------- 5.2 Gestion des utilisateurs ----------
app.post('/backend/get_users', async (req, res) => {
  const { current_user } = req.body;
  if (!current_user) {
    return res.status(400).json({ success: false, error: 'current_user required' });
  }

  try {
    const [userRows] = await pool.query(
      'SELECT is_admin, id_boutique FROM user_fcm_tokens WHERE id = ?',
      [current_user]
    );
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const user = userRows[0];
    const isAdmin = user.is_admin === 1;
    const boutiqueId = user.id_boutique;

    if (!boutiqueId) {
      return res.json({ success: false, error: 'User has no boutique assigned' });
    }

    let sql, params;
    if (isAdmin) {
      sql = 'SELECT id, email, phone, is_admin FROM user_fcm_tokens WHERE id_boutique = ? AND id != ? ORDER BY id DESC';
      params = [boutiqueId, current_user];
    } else {
      sql = 'SELECT id, email, phone, is_admin FROM user_fcm_tokens WHERE id_boutique = ? AND is_admin = 1 ORDER BY id DESC';
      params = [boutiqueId];
    }
    const [users] = await pool.query(sql, params);
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------- 5.3 Chat (messages) ----------
app.post('/backend/send', async (req, res) => {
  const { sender_id, receiver_id, message } = req.body;
  if (!sender_id || !receiver_id || !message) {
    return res.status(400).json({ success: false, error: 'Missing parameters' });
  }

  try {
    const [boutiques] = await pool.query(
      'SELECT id_boutique FROM user_fcm_tokens WHERE id = ? OR id = ?',
      [sender_id, receiver_id]
    );
    if (boutiques.length !== 2 || boutiques[0].id_boutique !== boutiques[1].id_boutique) {
      return res.status(403).json({ success: false, error: 'Users not in same boutique' });
    }

    const boutiqueId = boutiques[0].id_boutique;

    const [insertResult] = await pool.query(
      `INSERT INTO messages (sender_id, receiver_id, message, is_read, created_at, app_id)
       VALUES (?, ?, ?, 0, NOW(), ?)`,
      [sender_id, receiver_id, message, boutiqueId]
    );
    const messageId = insertResult.insertId;

    const [senderRows] = await pool.query(
      'SELECT email, phone FROM user_fcm_tokens WHERE id = ?',
      [sender_id]
    );
    const senderEmail = senderRows[0]?.email || 'Utilisateur';
    const senderName = senderEmail.split('@')[0] || 'Utilisateur';

    setImmediate(async () => {
      await sendFCMNotification(
        receiver_id,
        `📩 Nouveau message de ${senderName}`,
        message.length > 100 ? message.substring(0, 100) + '...' : message,
        {
          sender_id: String(sender_id),
          receiver_id: String(receiver_id),
          message_id: String(messageId),
          message
        }
      );
    });

    res.json({ success: true, message_id: messageId });
  } catch (error) {
    console.error('Send error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/backend/get_messages', async (req, res) => {
  const { user1, user2 } = req.body;
  if (!user1 || !user2) {
    return res.status(400).json({ success: false, error: 'user1 and user2 required' });
  }

  try {
    const [userRows] = await pool.query(
      'SELECT id_boutique FROM user_fcm_tokens WHERE id = ? LIMIT 1',
      [user1]
    );
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const boutiqueId = userRows[0].id_boutique;

    const [rows] = await pool.query(
      `SELECT * FROM messages
       WHERE (sender_id = ? AND receiver_id = ?)
          OR (sender_id = ? AND receiver_id = ?)
       AND app_id = ?
       ORDER BY id ASC`,
      [user1, user2, user2, user1, boutiqueId]
    );
    res.json({ success: true, messages: rows });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/backend/read', async (req, res) => {
  const { sender_id, receiver_id } = req.body;
  if (!sender_id || !receiver_id) {
    return res.status(400).json({ success: false, error: 'sender_id and receiver_id required' });
  }

  try {
    await pool.query(
      'UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0',
      [sender_id, receiver_id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------- 5.4 Gestion des tokens FCM ----------
app.post('/backend/save_token', async (req, res) => {
  const { user_id, phone, fcm_token, device_type, device_name, id_boutique, is_admin } = req.body;

  if (!fcm_token || !phone || !id_boutique) {
    return res.status(400).json({ status: 'error', message: 'fcm_token, phone et id_boutique requis' });
  }

  try {
    const adminFlag = is_admin ? 1 : 0;
    const [result] = await pool.query(
      `INSERT INTO user_fcm_tokens (user_id, phone, fcm_token, device_type, device_name, id_boutique, is_admin, last_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         user_id = VALUES(user_id),
         fcm_token = VALUES(fcm_token),
         device_type = VALUES(device_type),
         device_name = VALUES(device_name),
         is_admin = VALUES(is_admin),
         last_active = NOW()`,
      [user_id, phone, fcm_token, device_type, device_name, id_boutique, adminFlag]
    );
    const action = result.affectedRows === 1 ? 'insert' : 'update';
    res.json({ status: 'success', message: `Token ${action}é`, action });
  } catch (error) {
    console.error('Erreur save_token:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/backend/fcm_stats', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        COUNT(CASE WHEN is_admin = 1 THEN 1 END) as admins,
        COUNT(CASE WHEN is_admin = 0 OR is_admin IS NULL THEN 1 END) as clients,
        COUNT(*) as total
      FROM user_fcm_tokens
      WHERE fcm_token IS NOT NULL AND fcm_token != ''
    `);
    res.json({
      status: 'success',
      admins: rows[0]?.admins || 0,
      clients: rows[0]?.clients || 0,
      total: rows[0]?.total || 0
    });
  } catch (error) {
    console.error('Erreur fcm_stats:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ---------- 5.5 Gestion des produits (admin) ----------
app.get('/backend/products', async (req, res) => {
  const { id_boutique } = req.query;
  if (!id_boutique) {
    return res.status(400).json({ status: 'error', message: 'id_boutique requis' });
  }

  try {
    const [rows] = await pool.query(`
      SELECT p.*,
        (SELECT image FROM images WHERE id_produit = p.id ORDER BY id ASC LIMIT 1) as premiere_image,
        (SELECT COUNT(*) FROM images WHERE id_produit = p.id) as images_count
      FROM produits p
      WHERE p.id_boutique = ?
      ORDER BY p.id DESC
    `, [id_boutique]);

    const products = rows.map(row => ({
      id: row.id,
      type: row.type,
      genre: row.genre,
      taille: row.taille,
      couleur: row.couleur,
      prix: parseFloat(row.prix),
      devise: row.devise,
      description: row.description,
      statut: row.statut,
      created_at: row.created_at,
      premiere_image: row.premiere_image,
      images_count: row.images_count || 0
    }));

    res.json({ status: 'success', data: products });
  } catch (error) {
    console.error('Erreur get_products:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ---------- 5.6 Ajout produit (avec multer) ----------
app.post('/backend/add_product', upload.array('images[]', 10), async (req, res) => {
  try {
    const { id_boutique, type, genre, taille, couleur, prix, devise, description } = req.body;

    if (!id_boutique || !type || !prix) {
      return res.status(400).json({ success: false, error: 'Champs obligatoires manquants' });
    }

    const imageFiles = req.files || [];
    const imageNames = imageFiles.map(f => f.filename);
    const premiere_image = imageNames.length > 0 ? imageNames[0] : null;

    const [insertResult] = await pool.query(
      `INSERT INTO products 
       (id_boutique, type, genre, taille, couleur, prix, devise, description, premiere_image, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [id_boutique, type, genre, taille, couleur, prix, devise, description, premiere_image]
    );

    const productId = insertResult.insertId;

    if (firebaseReady) {
      const [rows] = await pool.query(
        'SELECT fcm_token FROM user_fcm_tokens WHERE id_boutique = ? AND fcm_token IS NOT NULL',
        [id_boutique]
      );
      const tokens = rows.map(row => row.fcm_token).filter(t => t && t.length > 0);

      if (tokens.length > 0) {
        const message = {
          notification: {
            title: `🆕 Nouveau produit : ${type}`,
            body: `${prix} ${devise} - ${genre || 'Nouveauté'}`
          },
          data: {
            type: 'new_product',
            product_id: String(productId),
            id_boutique: String(id_boutique)
          },
          android: {
            priority: 'high',
            notification: {
              sound: 'default',
              channelId: 'client_notifications'
            }
          }
        };

        const sendResult = await admin.messaging().sendEachForMulticast({
          tokens: tokens,
          ...message
        });
        console.log(`✅ Notifications envoyées à ${sendResult.successCount} utilisateurs sur ${tokens.length}`);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Produit ajouté et notifications envoyées',
      product: {
        id: productId,
        type,
        prix,
        image: premiere_image
      }
    });
  } catch (error) {
    console.error('❌ Erreur ajout produit:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------- 5.7 Publier produit ----------
app.post('/backend/products/publish', async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ status: 'error', message: 'ID produit requis' });
  }

  try {
    const [rows] = await pool.query('SELECT statut FROM produits WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Produit non trouvé' });
    }
    const current = rows[0].statut;
    const newStatus = current === 'brouillon' ? 'actif' : 'brouillon';

    await pool.query('UPDATE produits SET statut = ? WHERE id = ?', [newStatus, id]);

    res.json({
      status: 'success',
      message: 'Statut mis à jour',
      data: { id, ancien_statut: current, nouveau_statut: newStatus }
    });
  } catch (error) {
    console.error('Erreur publish:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ---------- 5.8 Supprimer produit ----------
app.post('/backend/products/delete', async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ status: 'error', message: 'ID produit requis' });
  }

  try {
    const [imageRows] = await pool.query('SELECT image FROM images WHERE id_produit = ?', [id]);
    const imageFiles = imageRows.map(r => r.image);

    await pool.query('DELETE FROM images WHERE id_produit = ?', [id]);
    await pool.query('DELETE FROM produits WHERE id = ?', [id]);

    res.json({
      status: 'success',
      message: 'Produit supprimé',
      data: { id, images_deleted: imageFiles.length }
    });
  } catch (error) {
    console.error('Erreur delete:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ---------- 5.9 Envoyer notification produit ----------
app.post('/backend/send_notification', async (req, res) => {
  const { product_id, product_name, boutique_id } = req.body;
  if (!product_id || !product_name || !boutique_id) {
    return res.status(400).json({ status: 'error', message: 'product_id, product_name, boutique_id requis' });
  }

  if (!firebaseReady) {
    return res.status(503).json({ status: 'error', message: 'Firebase non initialisé' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT fcm_token FROM user_fcm_tokens WHERE id_boutique = ? AND fcm_token IS NOT NULL AND fcm_token != ""',
      [boutique_id]
    );
    const tokens = rows.map(r => r.fcm_token);
    if (tokens.length === 0) {
      return res.json({
        status: 'warning',
        message: 'Aucun token trouvé pour cette boutique',
        total: 0,
        success: 0
      });
    }

    const message = {
      notification: {
        title: '🆕 Nouveau produit disponible !',
        body: `${product_name} vient d'être publié !`,
      },
      data: {
        product_id: String(product_id),
        product_name: product_name,
        type: 'new_product'
      },
      android: { priority: 'high' }
    };

    const sendResult = await admin.messaging().sendEachForMulticast({
      tokens: tokens,
      ...message
    });

    res.json({
      status: 'success',
      message: `Notification envoyée à ${sendResult.successCount} appareil(s) sur ${tokens.length}`,
      statistics: {
        boutique_id,
        total_tokens: tokens.length,
        success_count: sendResult.successCount,
        failed_count: sendResult.failureCount
      }
    });
  } catch (error) {
    console.error('Erreur send_notification:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ---------- 5.10 Détails produit (client) ----------
app.get('/backend/products/:id', async (req, res) => {
  const productId = parseInt(req.params.id);
  if (!productId || productId <= 0) {
    return res.status(400).json({ status: 'error', message: 'ID produit invalide' });
  }

  try {
    const [productRows] = await pool.query('SELECT * FROM produits WHERE id = ?', [productId]);
    if (productRows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Produit non trouvé' });
    }
    const product = productRows[0];

    const [imageRows] = await pool.query(
      'SELECT id, image, created_at FROM images WHERE id_produit = ? ORDER BY id ASC',
      [productId]
    );
    const images = imageRows.map(row => ({
      id: row.id,
      url: `uploads/${row.image}`,
      filename: row.image,
      created_at: row.created_at
    }));

    const result = {
      id: product.id,
      id_boutique: product.id_boutique,
      type: product.type,
      genre: product.genre,
      taille: product.taille,
      couleur: product.couleur,
      prix: parseFloat(product.prix),
      devise: product.devise || 'USD',
      description: product.description,
      statut: product.statut,
      created_at: product.created_at,
      images: images,
      images_count: images.length
    };

    res.json({ status: 'success', data: result });
  } catch (error) {
    console.error('Erreur GET /backend/products/:id:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ---------- 5.11 Gestion des notes (ratings) ----------
app.get('/backend/products/:id/ratings', async (req, res) => {
  const productId = parseInt(req.params.id);
  const userId = req.query.user_id ? parseInt(req.query.user_id) : 0;

  if (!productId || productId <= 0) {
    return res.status(400).json({ status: 'error', message: 'ID produit invalide' });
  }

  try {
    const [avgRows] = await pool.query(
      'SELECT AVG(rating) as average, COUNT(*) as total FROM ratings WHERE id_produit = ?',
      [productId]
    );
    const average = avgRows[0]?.average ? parseFloat(avgRows[0].average) : 0;
    const total = avgRows[0]?.total || 0;

    const data = { average: Math.round(average * 10) / 10, total };

    if (userId > 0) {
      const [userRows] = await pool.query(
        'SELECT rating FROM ratings WHERE id_produit = ? AND id_user = ?',
        [productId, userId]
      );
      data.user_rating = userRows.length > 0 ? userRows[0].rating : 0;
    }

    res.json({ status: 'success', data });
  } catch (error) {
    console.error('Erreur GET /backend/products/:id/ratings:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/backend/products/:id/ratings', async (req, res) => {
  const productId = parseInt(req.params.id);
  const { user_id, note, commentaire } = req.body;

  if (!productId || productId <= 0 || !user_id || user_id <= 0 || !note || note < 1 || note > 5) {
    return res.status(400).json({ status: 'error', message: 'Données invalides' });
  }

  try {
    const [productRows] = await pool.query('SELECT id FROM produits WHERE id = ?', [productId]);
    if (productRows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Produit non trouvé' });
    }

    await pool.query(
      `INSERT INTO ratings (id_produit, id_user, rating, comment)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       rating = VALUES(rating), comment = VALUES(comment), created_at = NOW()`,
      [productId, user_id, note, commentaire || '']
    );

    res.json({ status: 'success', message: 'Note enregistrée', rating: note });
  } catch (error) {
    console.error('Erreur POST /backend/products/:id/ratings:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ---------- 5.12 Édition produit (images) ----------
app.get('/backend/products/:id/images', async (req, res) => {
  const productId = parseInt(req.params.id);
  if (!productId || productId <= 0) {
    return res.status(400).json({ status: 'error', message: 'ID produit invalide' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, image, created_at FROM images WHERE id_produit = ? ORDER BY id ASC',
      [productId]
    );
    const images = rows.map(row => ({
      id: row.id,
      url: `uploads/${row.image}`,
      filename: row.image,
      created_at: row.created_at
    }));
    res.json({ status: 'success', data: images });
  } catch (error) {
    console.error('Erreur GET /backend/products/:id/images:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/backend/products/:id/update', upload.array('new_images[]', 10), async (req, res) => {
  const productId = parseInt(req.params.id);
  if (!productId || productId <= 0) {
    return res.status(400).json({ status: 'error', message: 'ID produit invalide' });
  }

  try {
    const { type, genre, taille, couleur, prix, devise, description, delete_images } = req.body;

    if (!type || !prix || parseFloat(prix) <= 0) {
      return res.status(400).json({ status: 'error', message: 'Type et prix valides requis' });
    }

    // Supprimer les images marquées
    let deleteImageIds = [];
    if (delete_images) {
      try {
        deleteImageIds = JSON.parse(delete_images);
      } catch (e) {
        deleteImageIds = Array.isArray(delete_images) ? delete_images : [];
      }
    }

    if (Array.isArray(deleteImageIds) && deleteImageIds.length > 0) {
      for (const imgId of deleteImageIds) {
        const [rows] = await pool.query('SELECT image FROM images WHERE id = ? AND id_produit = ?', [imgId, productId]);
        if (rows.length > 0) {
          const filePath = path.join(uploadDir, rows[0].image);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        await pool.query('DELETE FROM images WHERE id = ? AND id_produit = ?', [imgId, productId]);
      }
    }

    // Ajouter les nouvelles images
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await pool.query(
          'INSERT INTO images (id_produit, image, created_at) VALUES (?, ?, NOW())',
          [productId, file.filename]
        );
      }
    }

    // Mettre à jour le produit
    await pool.query(
      `UPDATE produits SET type = ?, genre = ?, taille = ?, couleur = ?, prix = ?, devise = ?, description = ?
       WHERE id = ?`,
      [type, genre || '', taille || '', couleur || '', parseFloat(prix), devise || 'USD', description || '', productId]
    );

    const [imageRows] = await pool.query('SELECT id, image FROM images WHERE id_produit = ? ORDER BY id ASC', [productId]);
    const allImages = imageRows.map(row => ({
      id: row.id,
      url: `uploads/${row.image}`,
      filename: row.image
    }));

    res.json({
      status: 'success',
      message: 'Produit modifié avec succès',
      data: {
        id: productId,
        type,
        prix: parseFloat(prix),
        images: allImages,
        new_images_added: req.files ? req.files.length : 0
      }
    });
  } catch (error) {
    console.error('Erreur POST /backend/products/:id/update:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ---------- 5.13 Gestion des commandes ----------
app.post('/backend/orders', async (req, res) => {
  const { id_user, id_client, id_boutique, total, devise, items } = req.body;

  if (!id_client || !id_boutique || total === undefined || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ status: 'error', message: 'Données incomplètes' });
  }

  try {
    const userId = id_user || id_client;
    const [userRows] = await pool.query(
      'SELECT id, id_boutique FROM user_fcm_tokens WHERE id = ? AND id_boutique = ?',
      [userId, id_boutique]
    );
    if (userRows.length === 0) {
      return res.status(403).json({ status: 'error', message: 'Utilisateur non autorisé' });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      const [orderResult] = await connection.query(
        `INSERT INTO commandes (id_user, id_client, id_boutique, total, devise, statut, nb_articles, date_commande)
         VALUES (?, ?, ?, ?, ?, 'en_attente', ?, NOW())`,
        [userId, id_client, id_boutique, total, devise || 'USD', 0]
      );
      const orderId = orderResult.insertId;

      let totalArticles = 0;
      for (const item of items) {
        const productId = parseInt(item.id_produit);
        const quantity = parseInt(item.quantite);
        const unitPrice = parseFloat(item.prix_unitaire);
        if (!productId || !quantity || !unitPrice) throw new Error('Données produit invalides');
        await connection.query(
          `INSERT INTO commande_details (id_commande, id_produit, quantite, prix_unitaire)
           VALUES (?, ?, ?, ?)`,
          [orderId, productId, quantity, unitPrice]
        );
        totalArticles += quantity;
      }

      await connection.query('UPDATE commandes SET nb_articles = ? WHERE id = ?', [totalArticles, orderId]);
      await connection.commit();
      connection.release();

      res.status(201).json({
        status: 'success',
        message: 'Commande enregistrée',
        data: { id_commande: orderId, total, devise: devise || 'USD', nb_articles: totalArticles }
      });
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error('Erreur commande:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/backend/orders', async (req, res) => {
  const { user_id, boutique_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ status: 'error', message: 'user_id requis' });
  }

  try {
    const [userRows] = await pool.query('SELECT id FROM user_fcm_tokens WHERE id = ?', [user_id]);
    if (userRows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Utilisateur non trouvé' });
    }

    let sql = `SELECT id, id_user, id_client, id_boutique, total, devise, nb_articles, statut, date_commande, created_at
               FROM commandes WHERE id_user = ? OR id_client = ?`;
    const params = [user_id, user_id];
    if (boutique_id) {
      sql += ' AND id_boutique = ?';
      params.push(boutique_id);
    }
    sql += ' ORDER BY date_commande DESC';

    const [rows] = await pool.query(sql, params);
    const orders = rows.map(row => ({
      id: row.id,
      id_user: row.id_user,
      id_client: row.id_client,
      id_boutique: row.id_boutique,
      total: parseFloat(row.total),
      devise: row.devise,
      nb_articles: row.nb_articles,
      statut: row.statut,
      date_commande: row.date_commande,
      created_at: row.created_at
    }));

    res.json({ status: 'success', data: orders, count: orders.length });
  } catch (error) {
    console.error('Erreur GET /backend/orders:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/backend/orders/delete', async (req, res) => {
  const { id_commande, user_id } = req.body;
  if (!id_commande || !user_id) {
    return res.status(400).json({ status: 'error', message: 'id_commande et user_id requis' });
  }

  try {
    const [checkRows] = await pool.query(
      'SELECT id FROM commandes WHERE id = ? AND (id_user = ? OR id_client = ?)',
      [id_commande, user_id, user_id]
    );
    if (checkRows.length === 0) {
      return res.status(403).json({ status: 'error', message: 'Commande non trouvée ou non autorisée' });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
      await connection.query('DELETE FROM commande_details WHERE id_commande = ?', [id_commande]);
      await connection.query('DELETE FROM commandes WHERE id = ?', [id_commande]);
      await connection.commit();
      connection.release();
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }

    res.json({ status: 'success', message: 'Commande supprimée' });
  } catch (error) {
    console.error('Erreur delete order:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ---------- 5.14 Gestion des favoris ----------
app.get('/backend/favorites', async (req, res) => {
  const { action, id_user, id_produit } = req.query;

  if (!id_user) {
    return res.status(400).json({ status: 'error', message: 'id_user requis' });
  }

  try {
    // Vérifier que l'utilisateur existe
    const [userRows] = await pool.query('SELECT id FROM user_fcm_tokens WHERE id = ?', [id_user]);
    if (userRows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Utilisateur non trouvé' });
    }

    if (action === 'list') {
      const [rows] = await pool.query(
        `SELECT f.id as favorite_id, f.id_user, f.id_produit, f.date_ajout,
                p.id as product_id, p.type, p.prix, p.devise, p.images, p.description, p.premiere_image
         FROM favoris f
         LEFT JOIN produits p ON f.id_produit = p.id
         WHERE f.id_user = ?
         ORDER BY f.date_ajout DESC`,
        [id_user]
      );
      const favorites = rows.map(row => ({
        id: row.product_id,
        id_produit: row.id_produit,
        type: row.type,
        prix: row.prix,
        devise: row.devise,
        images: row.images ? JSON.parse(row.images) : null,
        description: row.description,
        premiere_image: row.premiere_image,
        date_ajout: row.date_ajout
      }));
      return res.json({ status: 'success', data: favorites, count: favorites.length });
    } else if (action === 'check' && id_produit) {
      const [rows] = await pool.query(
        'SELECT id FROM favoris WHERE id_user = ? AND id_produit = ?',
        [id_user, id_produit]
      );
      return res.json({ status: 'success', is_favorite: rows.length > 0 });
    } else {
      return res.status(400).json({ status: 'error', message: 'Action non reconnue' });
    }
  } catch (error) {
    console.error('Erreur GET /backend/favorites:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/backend/favorites', async (req, res) => {
  const { action, id_user, id_produit } = req.body;

  if (!action || !id_user || !id_produit) {
    return res.status(400).json({ status: 'error', message: 'action, id_user et id_produit requis' });
  }

  try {
    // Vérifier que l'utilisateur existe
    const [userRows] = await pool.query('SELECT id FROM user_fcm_tokens WHERE id = ?', [id_user]);
    if (userRows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Utilisateur non trouvé' });
    }
    // Vérifier que le produit existe
    const [productRows] = await pool.query('SELECT id FROM produits WHERE id = ?', [id_produit]);
    if (productRows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Produit non trouvé' });
    }

    if (action === 'add') {
      const [existing] = await pool.query('SELECT id FROM favoris WHERE id_user = ? AND id_produit = ?', [id_user, id_produit]);
      if (existing.length > 0) {
        return res.json({ status: 'error', message: 'Déjà dans les favoris' });
      }
      await pool.query('INSERT INTO favoris (id_user, id_produit, date_ajout) VALUES (?, ?, NOW())', [id_user, id_produit]);
      return res.json({ status: 'success', message: 'Ajouté aux favoris' });
    } else if (action === 'remove') {
      const result = await pool.query('DELETE FROM favoris WHERE id_user = ? AND id_produit = ?', [id_user, id_produit]);
      if (result.affectedRows > 0) {
        return res.json({ status: 'success', message: 'Retiré des favoris' });
      }
      return res.status(404).json({ status: 'error', message: 'Favori non trouvé' });
    } else {
      return res.status(400).json({ status: 'error', message: 'Action non reconnue' });
    }
  } catch (error) {
    console.error('Erreur POST /backend/favorites:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ---------- 5.15 Gestion OTP ----------
app.post('/backend/send_otp', async (req, res) => {
  const { phone, boutique_id } = req.body;

  if (!phone || !boutique_id) {
    return res.status(400).json({ success: false, message: 'phone et boutique_id requis' });
  }

  try {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 9) {
      return res.status(400).json({ success: false, message: 'Numéro invalide' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query('DELETE FROM otp_codes WHERE phone = ? AND boutique = ?', [cleanPhone, boutique_id]);
    await pool.query(
      'INSERT INTO otp_codes (phone, code, boutique, created_at) VALUES (?, ?, ?, NOW())',
      [cleanPhone, code, boutique_id]
    );

    res.json({ success: true, message: 'OTP généré', code: code });
  } catch (error) {
    console.error('Erreur send_otp:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

app.post('/backend/verify_otp', async (req, res) => {
  const { phone, code, boutique_id } = req.body;

  if (!phone || !boutique_id) {
    return res.status(400).json({ success: false, message: 'phone, code et boutique_id requis' });
  }

  try {
    const cleanPhone = phone.replace(/\D/g, '');
    const cleanCode = code.replace(/\D/g, '');

    const [rows] = await pool.query(
      'SELECT * FROM otp_codes WHERE phone = ? AND code = ? AND boutique = ?',
      [cleanPhone, cleanCode, boutique_id]
    );

    if (rows.length > 0) {
      await pool.query('DELETE FROM otp_codes WHERE phone = ? AND code = ? AND boutique = ?', [
        cleanPhone,
        cleanCode,
        boutique_id
      ]);
      res.json({ success: true, message: 'OTP valide', phone: cleanPhone, boutique: boutique_id });
    } else {
      res.json({ success: false, message: 'Code incorrect', phone: cleanPhone, boutique: boutique_id });
    }
  } catch (error) {
    console.error('Erreur verify_otp:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ---------- 5.16 Servir les images statiques ----------
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// ============================================================
// GESTIONNAIRE D'ERREURS GLOBAL (après toutes les routes)
// ============================================================
app.use((err, req, res, next) => {
  console.error('❌ Erreur capturée:', err.stack);
  res.status(500).json({
    success: false,
    error: err.message,
    stack: err.stack
  });
});

// ============================================================
// 6. DÉMARRAGE DU SERVEUR
// ============================================================
app.listen(PORT, () => {
  console.log(`✅ Serveur chat démarré sur le port ${PORT}`);
});