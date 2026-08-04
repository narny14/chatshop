// server.js - Serveur Node.js avec notifications FCM (version corrigée)
const dotenv = require('dotenv');
dotenv.config(); // Charge les variables d'environnement depuis .env (si présent)

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ============================================================
// 1. INITIALISATION FIREBASE ADMIN (via variables d'environnement)
// ============================================================
try {
  // Récupère les variables d'environnement Firebase
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.error('❌ Erreur : variables Firebase non définies.');
    console.log('   Assurez-vous que FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL et FIREBASE_PRIVATE_KEY sont définies.');
    process.exit(1);
  }

  // Initialise Firebase Admin avec les variables d'environnement
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: projectId,
      clientEmail: clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'), // Gère les retours à la ligne
    }),
  });

  console.log('✅ Firebase Admin initialisé avec succès');
} catch (error) {
  console.error('❌ Erreur Firebase Admin :', error);
  process.exit(1);
}

// ============================================================
// 2. CONNEXION MYSQL (via variables d'environnement)
// ============================================================
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'u543831662_Byteatomeneons',
  password: process.env.DB_PASSWORD || '=KkY@gKhA2',
  database: process.env.DB_NAME || 'u543831662_Byteatomeneons',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ============================================================
// 3. FONCTION : Envoyer une notification FCM
// ============================================================
async function sendFCMNotification(userId, title, body, data = {}) {
  try {
    // Récupérer le token FCM de l'utilisateur
    const [rows] = await pool.query(
      'SELECT fcm_token FROM user_fcm_tokens WHERE id = ?',
      [userId]
    );
    if (rows.length === 0 || !rows[0].fcm_token) {
      console.log(`❌ Aucun token FCM pour l'utilisateur ${userId}`);
      return false;
    }
    const token = rows[0].fcm_token;

    const message = {
      notification: { title, body },
      data: {
        ...data,
        type: 'new_message',
        timestamp: new Date().toISOString()
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'client_notifications'
        }
      },
      token: token
    };

    const response = await admin.messaging().send(message);
    console.log(`✅ Notification envoyée à ${userId} :`, response);
    return true;
  } catch (error) {
    console.error('❌ Erreur FCM:', error);
    return false;
  }
}

// ============================================================
// 4. ROUTES API
// ============================================================

// ---------- 4.1 Inscription / Vérification ----------
app.post('/api/register', async (req, res) => {
  const { email, phone, fcm_token, id_boutique } = req.body;
  if (!email || !phone || !id_boutique) {
    return res.status(400).json({ success: false, error: 'Missing fields' });
  }

  try {
    // Vérifier si déjà inscrit (phone + id_boutique)
    const [existing] = await pool.query(
      'SELECT id, email, phone, is_admin, id_boutique FROM user_fcm_tokens WHERE phone = ? AND id_boutique = ?',
      [phone, id_boutique]
    );
    if (existing.length > 0) {
      const user = existing[0];
      // Mettre à jour l'email si différent
      if (user.email !== email) {
        await pool.query('UPDATE user_fcm_tokens SET email = ? WHERE id = ?', [email, user.id]);
        user.email = email;
      }
      // Mettre à jour le token FCM
      if (fcm_token) {
        await pool.query('UPDATE user_fcm_tokens SET fcm_token = ? WHERE id = ?', [fcm_token, user.id]);
      }
      return res.json({ success: true, user });
    }

    // Premier utilisateur de la boutique = admin
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

    const newUser = {
      id: insertResult.insertId,
      email,
      phone,
      is_admin,
      id_boutique
    };
    res.json({ success: true, user: newUser });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------- 4.2 Vérifier utilisateur ----------
app.post('/api/check_user', async (req, res) => {
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

// ---------- 4.3 Liste des utilisateurs ----------
app.post('/api/get_users', async (req, res) => {
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

// ---------- 4.4 Envoyer un message (avec notification push) ----------
app.post('/api/send', async (req, res) => {
  const { sender_id, receiver_id, message } = req.body;
  if (!sender_id || !receiver_id || !message) {
    return res.status(400).json({ success: false, error: 'Missing parameters' });
  }

  try {
    // Vérifier que les deux utilisateurs sont dans la même boutique
    const [boutiques] = await pool.query(
      'SELECT id_boutique FROM user_fcm_tokens WHERE id = ? OR id = ?',
      [sender_id, receiver_id]
    );
    if (boutiques.length !== 2 || boutiques[0].id_boutique !== boutiques[1].id_boutique) {
      return res.status(403).json({ success: false, error: 'Users not in same boutique' });
    }

    // Insérer le message
    const [insertResult] = await pool.query(
      'INSERT INTO messages (sender_id, receiver_id, message, is_read, created_at) VALUES (?, ?, ?, 0, NOW())',
      [sender_id, receiver_id, message]
    );
    const messageId = insertResult.insertId;

    // Récupérer le nom de l'expéditeur pour la notification
    const [senderRows] = await pool.query(
      'SELECT email, phone FROM user_fcm_tokens WHERE id = ?',
      [sender_id]
    );
    const senderEmail = senderRows[0]?.email || 'Utilisateur';
    const senderName = senderEmail.split('@')[0] || 'Utilisateur';

    // Envoyer une notification push au destinataire
    await sendFCMNotification(
      receiver_id,
      `📩 Nouveau message de ${senderName}`,
      message.length > 100 ? message.substring(0, 100) + '...' : message,
      {
        sender_id: String(sender_id),
        receiver_id: String(receiver_id),
        message_id: String(messageId),
        message: message
      }
    );

    res.json({ success: true, message_id: messageId });
  } catch (error) {
    console.error('Send error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------- 4.5 Lire les messages ----------
app.post('/api/get_messages', async (req, res) => {
  const { user1, user2 } = req.body;
  if (!user1 || !user2) {
    return res.status(400).json({ success: false, error: 'user1 and user2 required' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT * FROM messages
       WHERE (sender_id = ? AND receiver_id = ?)
          OR (sender_id = ? AND receiver_id = ?)
       ORDER BY id ASC`,
      [user1, user2, user2, user1]
    );
    res.json({ success: true, messages: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------- 4.6 Marquer comme lu ----------
app.post('/api/read', async (req, res) => {
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

// ---------- 4.7 Sauvegarder token FCM ----------
app.post('/api/save_token', async (req, res) => {
  const { user_id, token } = req.body;
  if (!user_id || !token) {
    return res.status(400).json({ success: false, error: 'user_id and token required' });
  }

  try {
    await pool.query('UPDATE user_fcm_tokens SET fcm_token = ? WHERE id = ?', [token, user_id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------- 4.8 Synchroniser les admins ----------
app.post('/api/sync_admin', async (req, res) => {
  const { current_user } = req.body;
  if (!current_user) {
    return res.status(400).json({ success: false, error: 'current_user required' });
  }

  try {
    // Vérifier que l'utilisateur est admin
    const [userRows] = await pool.query(
      'SELECT is_admin, id_boutique FROM user_fcm_tokens WHERE id = ?',
      [current_user]
    );
    if (userRows.length === 0 || userRows[0].is_admin !== 1) {
      return res.status(403).json({ success: false, error: 'Only admin can sync' });
    }

    const boutiqueId = userRows[0].id_boutique;
    // Mettre à jour is_admin selon useradminshop
    await pool.query(
      `UPDATE user_fcm_tokens u
       SET u.is_admin = CASE
           WHEN EXISTS (SELECT 1 FROM useradminshop a WHERE a.phone = u.phone AND a.id_boutique = u.id_boutique)
           THEN 1 ELSE 0
       END
       WHERE u.id_boutique = ?`,
      [boutiqueId]
    );
    res.json({ success: true, message: 'Admin status synced' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------- 4.9 Test de performance ----------
app.post('/api/test_performance', async (req, res) => {
  const { sender_id, receiver_id, message } = req.body;
  if (!sender_id || !receiver_id || !message) {
    return res.status(400).json({ success: false, error: 'Missing parameters' });
  }

  const start = Date.now();

  try {
    // Vérifier que les deux utilisateurs sont dans la même boutique
    const [boutiques] = await pool.query(
      'SELECT id_boutique FROM user_fcm_tokens WHERE id = ? OR id = ?',
      [sender_id, receiver_id]
    );
    if (boutiques.length !== 2 || boutiques[0].id_boutique !== boutiques[1].id_boutique) {
      return res.status(403).json({ success: false, error: 'Users not in same boutique' });
    }

    // Insérer le message
    const [insertResult] = await pool.query(
      'INSERT INTO messages (sender_id, receiver_id, message, is_read, created_at) VALUES (?, ?, ?, 0, NOW())',
      [sender_id, receiver_id, message]
    );
    const messageId = insertResult.insertId;

    // Simuler l'envoi d'une notification (on ne l'envoie pas pour le test)
    // On mesure juste le temps de l'insertion

    const elapsed = Date.now() - start;

    res.json({
      success: true,
      message_id: messageId,
      elapsed_ms: elapsed
    });
  } catch (error) {
    console.error('Test performance error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
// Ajouter avant app.listen
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// 5. DÉMARRAGE DU SERVEUR
// ============================================================
app.listen(PORT, () => {
  console.log(`✅ Serveur chat démarré sur le port ${PORT}`);
});