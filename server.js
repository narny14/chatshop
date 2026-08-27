const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_BASE_URL = "https://bytesshop.byteatomeneons.com";


// ============================================================
// DOSSIER DES IMAGES
// ============================================================

const uploadDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

console.log('📁 Dossier images:', uploadDir);

// ============================================================
// MULTER
// ============================================================

let multer, upload;

try {
  multer = require('multer');
  console.log('✅ multer chargé');
} catch (e) {
  console.warn('⚠️ multer non installé');
  multer = null;
}

if (multer && typeof multer === 'function' && multer.diskStorage) {

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },

    filename: (req, file, cb) => {
      const unique =
        Date.now() + '-' + Math.round(Math.random() * 1E9);

      const ext = path.extname(file.originalname);

      cb(null, `product_${unique}${ext}`);
    }
  });

  upload = multer({
    storage,

    limits: {
      fileSize: 5 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {

      const allowed = [
        'image/jpeg',
        'image/png',
        'image/jpg',
        'image/gif'
      ];

      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Format image non autorisé'));
      }
    }
  });

} else {

  upload = {
    array: () => (req, res, next) => next(),
    single: () => (req, res, next) => next(),
    fields: () => (req, res, next) => next(),
    none: () => (req, res, next) => next()
  };
}

// ============================================================
// MIDDLEWARE
// ============================================================

app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.url}`);
  next();
});

app.use(cors());
app.use(express.json());

// ============================================================
// SERVIR LES IMAGES
// ============================================================

app.use('/uploads', express.static(uploadDir));

console.log('🖼️ Images accessibles via /uploads');
console.log('=================================');
console.log('📁 __dirname =', __dirname);
console.log('📁 uploadDir =', uploadDir);
console.log(
  '📷 fichier existe =',
  fs.existsSync(
    path.join(
      uploadDir,
      'product_1787333236768-381284924.jpg'
    )
  )
);
console.log('=================================');

app.get("/.well-known/assetlinks.json", (req, res) => {
  res.type("application/json");

  res.sendFile(
    path.join(
      __dirname,
      ".well-known",
      "assetlinks.json"
    )
  );
});
// ============================================================
// 1. INITIALISATION FIREBASE ADMIN (ROBUSTE)
// ============================================================

// ============================================================
// FIREBASE ADMIN
// ============================================================

// ============================================================
// FIREBASE ADMIN - FICHIER DANS DOSSIER PERMANENT
// ============================================================

// ============================================================
// FIREBASE ADMIN - FICHIER SERVICE ACCOUNT
// ============================================================

let firebaseReady = false;
let firebaseApp = null;

async function initFirebase() {

  try {

    console.log("=================================");
    console.log("🔥 INITIALISATION FIREBASE");
    console.log("=================================");

    const serviceAccountUrl =
      "https://bytesshop.byteatomeneons.com/serviceAccountKey.json";

    console.log(
      "🌐 Fichier Firebase :",
      serviceAccountUrl
    );

    // --------------------------------------------------------
    // RÉCUPÉRATION DU FICHIER JSON
    // --------------------------------------------------------

    const response = await fetch(serviceAccountUrl);

    if (!response.ok) {

      throw new Error(
        `Impossible de récupérer serviceAccountKey.json : HTTP ${response.status}`
      );

    }

    const serviceAccount =
      await response.json();

    // --------------------------------------------------------
    // VÉRIFICATIONS
    // --------------------------------------------------------

    if (!serviceAccount.project_id) {

      throw new Error(
        "project_id absent du fichier Firebase"
      );

    }

    if (!serviceAccount.client_email) {

      throw new Error(
        "client_email absent du fichier Firebase"
      );

    }

    if (!serviceAccount.private_key) {

      throw new Error(
        "private_key absente du fichier Firebase"
      );

    }

    console.log(
      "🔥 Firebase Project ID :",
      serviceAccount.project_id
    );

    console.log(
      "🔥 Firebase Client Email :",
      serviceAccount.client_email
    );

    // --------------------------------------------------------
    // CORRECTION DES \n
    // --------------------------------------------------------

    serviceAccount.private_key =
      serviceAccount.private_key.replace(
        /\\n/g,
        "\n"
      );

    console.log(
      "🔥 BEGIN PRIVATE KEY :",
      serviceAccount.private_key.includes(
        "-----BEGIN PRIVATE KEY-----"
      )
    );

    console.log(
      "🔥 END PRIVATE KEY :",
      serviceAccount.private_key.includes(
        "-----END PRIVATE KEY-----"
      )
    );

    // --------------------------------------------------------
    // VALIDATION DE LA CLÉ
    // --------------------------------------------------------

    if (
      !serviceAccount.private_key.includes(
        "-----BEGIN PRIVATE KEY-----"
      )
    ) {

      throw new Error(
        "private_key : mauvais début PEM"
      );

    }

    if (
      !serviceAccount.private_key.includes(
        "-----END PRIVATE KEY-----"
      )
    ) {

      throw new Error(
        "private_key : mauvaise fin PEM"
      );

    }

    // --------------------------------------------------------
    // INITIALISATION FIREBASE
    // --------------------------------------------------------

    firebaseApp = admin.initializeApp({

      credential:
        admin.credential.cert(
          serviceAccount
        )

    });

    firebaseReady = true;

    console.log("=================================");
    console.log("✅ FIREBASE ADMIN INITIALISÉ");
    console.log("✅ FCM DISPONIBLE");
    console.log("=================================");

    return firebaseApp;

  } catch (error) {

    firebaseReady = false;
    firebaseApp = null;

    console.error("=================================");
    console.error("❌ ERREUR FIREBASE");
    console.error("=================================");
    console.error(error.message);
    console.error("=================================");
    console.error("⚠️ FCM DÉSACTIVÉ");
    console.error("=================================");

    return null;
  }
}
initFirebase();
app.get("/backend/test-firebase", async (req, res) => {

  try {

    if (!firebaseReady || !firebaseApp) {

      return res.status(500).json({

        success: false,

        firebaseReady: false,

        message:
          "Firebase Admin n'est pas initialisé"

      });

    }

    return res.json({

      success: true,

      firebaseReady: true,

      message:
        "Firebase Admin fonctionne correctement"

    });

  } catch (error) {

    return res.status(500).json({

      success: false,

      error: error.message

    });

  }

});
// ============================================================
// 2. CONNEXION MYSQL
// ============================================================
const pool = mysql.createPool({
  host: '127.0.0.1', // FORCÉ
  user: 'u641923167_Bytesatomeneon',
  password: '=KkY@gKhA2',
  database: 'u641923167_Bytesatomeneon',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test non bloquant
pool.getConnection()
  .then(conn => { console.log('✅ MySQL connecté'); conn.release(); })
  .catch(err => console.error('❌ MySQL erreur:', err.message));


// Synchronisation périodique toutes les 5 minutes
setInterval(async () => {
  try {
    const [result] = await pool.query(`
      UPDATE user_fcm_tokens u
      JOIN useradminshop a ON u.phone = a.phone AND u.id_boutique = a.id_boutique
      SET u.is_admin = 1
      WHERE u.is_admin != 1 OR u.is_admin IS NULL
    `);
    const [result2] = await pool.query(`
      UPDATE user_fcm_tokens u
      LEFT JOIN useradminshop a ON u.phone = a.phone AND u.id_boutique = a.id_boutique
      SET u.is_admin = 0
      WHERE a.id IS NULL AND u.is_admin = 1
    `);
    console.log(`🔄 Sync admin automatique : ${result.affectedRows} activés, ${result2.affectedRows} désactivés`);
  } catch (error) {
    console.error('❌ Erreur sync automatique:', error);
  }
}, 5 * 60 * 1000); // 5 minutes  
// ============================================================
// 3. FONCTION FCM (avec vérification firebaseReady)
// ============================================================
// ============================================================
// ENVOI NOTIFICATION FCM
// ============================================================

async function sendFCMNotification(tokens, title, body, data = {}) {

  try {

    if (!firebaseReady || !firebaseApp) {

      console.error(
        "❌ Firebase non disponible - notification impossible"
      );

      return {
        success: false,
        successCount: 0,
        failureCount: 0,
        total: 0,
      };
    }

    // --------------------------------------------------------
    // NORMALISATION DES TOKENS
    // --------------------------------------------------------

    if (!Array.isArray(tokens)) {
      tokens = [tokens];
    }

    tokens = tokens
      .filter(token => token)
      .map(token => String(token).trim());

    if (tokens.length === 0) {

      console.log("⚠️ Aucun token FCM disponible");

      return {
        success: false,
        successCount: 0,
        failureCount: 0,
        total: 0,
      };
    }

    console.log(
      `📨 Envoi FCM à ${tokens.length} appareil(s)`
    );

    // --------------------------------------------------------
    // FIREBASE MULTICAST
    // --------------------------------------------------------

    const message = {
      tokens,

      notification: {
        title: String(title),
        body: String(body),
      },

      data: Object.fromEntries(
        Object.entries(data).map(([key, value]) => [
          key,
          String(value),
        ])
      ),

      android: {
        priority: "high",

        notification: {
          channelId: "default",
          sound: "default",
        },
      },

      apns: {
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
    };

    const response =
      await admin.messaging().sendEachForMulticast(message);

    console.log("=================================");
    console.log("📨 RÉSULTAT FCM");
    console.log("=================================");

    console.log(
      "✅ Succès :",
      response.successCount
    );

    console.log(
      "❌ Échecs :",
      response.failureCount
    );

    console.log(
      "📱 Total :",
      tokens.length
    );

    // --------------------------------------------------------
    // AFFICHER LES ERREURS
    // --------------------------------------------------------

    response.responses.forEach((result, index) => {

      if (!result.success) {

        console.error(
          `❌ Token ${index} :`,
          result.error?.code,
          result.error?.message
        );

      }

    });

    console.log("=================================");

    return {
      success: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
      total: tokens.length,
    };

  } catch (error) {

    console.error(
      "❌ Erreur envoi FCM :",
      error
    );

    return {
      success: false,
      successCount: 0,
      failureCount: tokens.length,
      total: tokens.length,
    };
  }
}

// ============================================================
// NOTIFICATION NOUVEAU PRODUIT
// Envoie à TOUS les appareils de la boutique
// ADMIN + CLIENTS
// ============================================================

// ============================================================
// NOTIFICATION NOUVEAU PRODUIT
// Envoie une notification à tous les appareils
// de la boutique concernée
// ============================================================

async function sendNewProductNotification({
  boutiqueId,
  productId,
  productType,
  prix,
  devise,
  genre
}) {

  console.log("======================================");
  console.log("🔔 NOTIFICATION NOUVEAU PRODUIT");
  console.log("======================================");

  console.log("🏪 Boutique :", boutiqueId);
  console.log("📦 Produit  :", productId);
  console.log("🏷️ Type     :", productType);
  console.log("💰 Prix     :", prix);
  console.log("💵 Devise   :", devise);
  console.log("👤 Genre    :", genre);

  // ----------------------------------------------------------
  // Vérification Firebase
  // ----------------------------------------------------------

  if (!firebaseReady || !firebaseApp) {

    console.log(
      "⚠️ Firebase non disponible - notification ignorée"
    );

    return {
      success: false,
      successCount: 0,
      failureCount: 0,
      total: 0,
      error: "Firebase non disponible"
    };
  }

  // ----------------------------------------------------------
  // Vérification boutique
  // ----------------------------------------------------------

  if (!boutiqueId) {

    console.error(
      "❌ boutiqueId manquant"
    );

    return {
      success: false,
      successCount: 0,
      failureCount: 0,
      total: 0,
      error: "boutiqueId manquant"
    };
  }

  // ----------------------------------------------------------
  // Vérification produit
  // ----------------------------------------------------------

  if (!productId) {

    console.error(
      "❌ productId manquant"
    );

    return {
      success: false,
      successCount: 0,
      failureCount: 0,
      total: 0,
      error: "productId manquant"
    };
  }

  try {

    // --------------------------------------------------------
    // 1. RÉCUPÉRER LES TOKENS FCM
    // --------------------------------------------------------

    const [rows] = await pool.query(
      `
      SELECT
        id,
        user_id,
        phone,
        fcm_token,
        is_admin
      FROM user_fcm_tokens
      WHERE id_boutique = ?
        AND fcm_token IS NOT NULL
        AND TRIM(fcm_token) <> ''
      `,
      [boutiqueId]
    );

    console.log(
      `📱 ${rows.length} enregistrement(s) FCM trouvé(s)`
    );

    // --------------------------------------------------------
    // Aucun token
    // --------------------------------------------------------

    if (!rows || rows.length === 0) {

      console.log(
        "ℹ️ Aucun utilisateur avec un token FCM"
      );

      return {
        success: true,
        successCount: 0,
        failureCount: 0,
        total: 0
      };
    }

    // --------------------------------------------------------
    // 2. NETTOYER LES TOKENS
    // --------------------------------------------------------

    const uniqueTokens = [
      ...new Set(
        rows
          .map(row =>
            String(row.fcm_token || "").trim()
          )
          .filter(token => token.length > 0)
      )
    ];

    console.log(
      `📱 Tokens uniques : ${uniqueTokens.length}`
    );

    if (uniqueTokens.length === 0) {

      console.log(
        "⚠️ Aucun token FCM valide"
      );

      return {
        success: true,
        successCount: 0,
        failureCount: 0,
        total: 0
      };
    }

    // --------------------------------------------------------
    // 3. PRÉPARER LA NOTIFICATION
    // --------------------------------------------------------

    const title =
      `🆕 Nouveau produit : ${productType || "Produit"}`;

    const body =
      `${prix || ""} ${devise || ""} - ${
        genre || "Nouvelle arrivée"
      }`;

    const data = {

      type: "new_product",

      product_id:
        String(productId),

      id_boutique:
        String(boutiqueId),

      product_type:
        String(productType || ""),

      prix:
        String(prix || ""),

      devise:
        String(devise || ""),

      genre:
        String(genre || ""),

      timestamp:
        String(Date.now())
    };

    console.log("======================================");
    console.log("📨 ENVOI FCM");
    console.log("======================================");

    console.log("Title :", title);
    console.log("Body  :", body);
    console.log("Data  :", data);
    console.log(
      "Tokens :",
      uniqueTokens.length
    );

    // --------------------------------------------------------
    // 4. UTILISER NOTRE FONCTION FCM UNIQUE
    // --------------------------------------------------------

    const notificationResult =
      await sendFCMNotification(
        uniqueTokens,
        title,
        body,
        data
      );

    console.log("======================================");
    console.log("📨 RÉSULTAT NOTIFICATION");
    console.log("======================================");

    console.log(
      "✅ Succès :",
      notificationResult.successCount
    );

    console.log(
      "❌ Échecs :",
      notificationResult.failureCount
    );

    console.log(
      "📱 Total :",
      notificationResult.total
    );

    // --------------------------------------------------------
    // 5. SUPPRESSION DES TOKENS INVALIDES
    // --------------------------------------------------------

    // Cette partie est déjà gérée par sendFCMNotification()
    // si tu veux la centraliser.
    //
    // On ne refait donc PAS un deuxième envoi ici.

    console.log("======================================");

    return notificationResult;

  } catch (error) {

    console.error("======================================");
    console.error(
      "❌ ERREUR sendNewProductNotification"
    );
    console.error("======================================");

    console.error(
      error
    );

    return {
      success: false,
      successCount: 0,
      failureCount: 0,
      total: 0,
      error: error.message
    };
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
// ============================================================
// Synchronisation des droits admin (useradminshop → user_fcm_tokens)
// ============================================================
app.post('/backend/sync_admin', async (req, res) => {
  try {
    // Mettre à jour is_admin = 1 pour les utilisateurs présents dans useradminshop
    const [result] = await pool.query(`
      UPDATE user_fcm_tokens u
      JOIN useradminshop a ON u.phone = a.phone AND u.id_boutique = a.id_boutique
      SET u.is_admin = 1
      WHERE u.is_admin != 1 OR u.is_admin IS NULL
    `);

    // Mettre à jour is_admin = 0 pour les utilisateurs qui ne sont plus dans useradminshop
    const [result2] = await pool.query(`
      UPDATE user_fcm_tokens u
      LEFT JOIN useradminshop a ON u.phone = a.phone AND u.id_boutique = a.id_boutique
      SET u.is_admin = 0
      WHERE a.id IS NULL AND u.is_admin = 1
    `);

    res.json({
      status: 'success',
      message: `Synchronisation terminée : ${result.affectedRows} mis à jour à 1, ${result2.affectedRows} mis à jour à 0`
    });
  } catch (error) {
    console.error('❌ Erreur sync_admin:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});
// ---------- 5.2 Gestion des utilisateurs ----------
app.post('/backend/get_users', async (req, res) => {
  console.log('📥 GET_USERS : current_user =', req.body.current_user);

  const { current_user } = req.body;

  if (!current_user) {
    return res.status(400).json({
      success: false,
      error: 'current_user required'
    });
  }

  try {

    const [userRows] = await pool.query(
      `SELECT
         id,
         user_id,
         email,
         phone,
         is_admin,
         id_boutique
       FROM user_fcm_tokens
       WHERE id = ? OR user_id = ?
       LIMIT 1`,
      [current_user, current_user]
    );

    if (userRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const currentUser = userRows[0];

    const userId = currentUser.id;
    const boutiqueId = currentUser.id_boutique;
    const isAdmin = Number(currentUser.is_admin) === 1;

    if (!boutiqueId) {
      return res.status(400).json({
        success: false,
        error: 'User has no boutique assigned'
      });
    }

    let users;

    if (isAdmin) {

      // ADMIN :
      // afficher tous les clients de sa boutique
      const [rows] = await pool.query(
        `SELECT
           id,
           email,
           phone,
           is_admin
         FROM user_fcm_tokens
         WHERE id_boutique = ?
           AND id != ?
         ORDER BY id DESC`,
        [boutiqueId, userId]
      );

      users = rows;

    } else {

      // CLIENT :
      // afficher tous les administrateurs de sa boutique
      const [rows] = await pool.query(
        `SELECT
           id,
           email,
           phone,
           is_admin
         FROM user_fcm_tokens
         WHERE id_boutique = ?
           AND is_admin = 1
         ORDER BY id DESC`,
        [boutiqueId]
      );

      users = rows;
    }

    console.log(
      `👤 User ${userId} | admin=${isAdmin} | boutique=${boutiqueId} | interlocuteurs=${users.length}`
    );

    res.json({
      success: true,

      current_user: {
        id: userId,
        email: currentUser.email,
        phone: currentUser.phone,
        is_admin: isAdmin ? 1 : 0,
        id_boutique: boutiqueId
      },

      users: users || []
    });

  } catch (error) {

    console.error('❌ Erreur get_users:', error);

    res.status(500).json({
      success: false,
      error: error.message
    });
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

  const notificationResult =
    await sendChatFCMNotification({

      receiverId: receiver_id,

      boutiqueId: boutiqueId,

      senderId: sender_id,

      senderName: senderName,

      message: message,

      messageId: messageId

    });

  console.log(
    "📨 Notification chat terminée :",
    notificationResult
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
       WHERE (
    (sender_id = ? AND receiver_id = ?)
    OR
    (sender_id = ? AND receiver_id = ?)
)
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
  const {
    user_id,
    phone,
    fcm_token,
    device_type,
    device_name,
    id_boutique
  } = req.body;

  if (!fcm_token || !phone || !id_boutique) {
    return res.status(400).json({
      status: 'error',
      message: 'fcm_token, phone et id_boutique requis'
    });
  }

  try {
    // Vérifier si l'utilisateur existe déjà
    const [existing] = await pool.query(
      `SELECT id, is_admin
       FROM user_fcm_tokens
       WHERE phone = ? AND id_boutique = ?
       LIMIT 1`,
      [phone, id_boutique]
    );

    if (existing.length > 0) {

      // IMPORTANT :
      // On met uniquement à jour le token FCM.
      // On NE TOUCHE PAS à is_admin.
      await pool.query(
        `UPDATE user_fcm_tokens
         SET
           user_id = ?,
           fcm_token = ?,
           device_type = ?,
           device_name = ?,
           last_active = NOW()
         WHERE phone = ? AND id_boutique = ?`,
        [
          user_id,
          fcm_token,
          device_type,
          device_name,
          phone,
          id_boutique
        ]
      );

      return res.json({
        status: 'success',
        message: 'Token FCM mis à jour',
        action: 'update',
        is_admin: Number(existing[0].is_admin) === 1 ? 1 : 0
      });
    }

    // Nouvel utilisateur :
    // vérifier son rôle directement dans useradminshop
    const [admins] = await pool.query(
      `SELECT id
       FROM useradminshop
       WHERE phone = ? AND id_boutique = ?
       LIMIT 1`,
      [phone, id_boutique]
    );

    const adminFlag = admins.length > 0 ? 1 : 0;

    await pool.query(
      `INSERT INTO user_fcm_tokens
       (
         user_id,
         phone,
         fcm_token,
         device_type,
         device_name,
         id_boutique,
         is_admin,
         last_active
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        user_id,
        phone,
        fcm_token,
        device_type,
        device_name,
        id_boutique,
        adminFlag
      ]
    );

    return res.json({
      status: 'success',
      message: 'Token FCM enregistré',
      action: 'insert',
      is_admin: adminFlag
    });

  } catch (error) {
    console.error('❌ Erreur save_token:', error);

    return res.status(500).json({
      status: 'error',
      message: error.message
    });
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
// ---------- 5.6 Ajout produit (avec multer) ----------
app.post(
  '/backend/add_product',
  upload.array('images[]', 10),
  async (req, res) => {

    let connection = null;
    let transactionStarted = false;

    const imageFiles = req.files || [];

    try {

      // =====================================================
      // 1. RÉCUPÉRATION DES DONNÉES
      // =====================================================

      const {
        id_boutique,
        type,
        genre,
        taille,
        couleur,
        prix,
        devise,
        description
      } = req.body;

      console.log('======================================');
      console.log('📦 AJOUT PRODUIT');
      console.log('======================================');
      console.log('id_boutique =', id_boutique);
      console.log('type        =', type);
      console.log('genre       =', genre);
      console.log('taille      =', taille);
      console.log('couleur     =', couleur);
      console.log('prix        =', prix);
      console.log('devise      =', devise);
      console.log('description =', description);
      console.log('images      =', imageFiles.length);
      console.log('======================================');


      // =====================================================
      // 2. VÉRIFICATION DES CHAMPS OBLIGATOIRES
      // =====================================================

      if (!id_boutique) {
        return res.status(400).json({
          success: false,
          error: 'ID boutique manquant'
        });
      }

      if (!type || String(type).trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'Le type du produit est obligatoire'
        });
      }

      if (
        prix === undefined ||
        prix === null ||
        String(prix).trim() === ''
      ) {
        return res.status(400).json({
          success: false,
          error: 'Le prix est obligatoire'
        });
      }


      // =====================================================
      // 3. CONVERSION ID BOUTIQUE
      // =====================================================

      const boutiqueId = Number.parseInt(
        String(id_boutique).trim(),
        10
      );

      if (
        !Number.isInteger(boutiqueId) ||
        boutiqueId <= 0
      ) {

        return res.status(400).json({
          success: false,
          error: 'ID boutique invalide'
        });
      }


      // =====================================================
      // 4. CONVERSION DU PRIX
      // =====================================================

      const parsedPrix = Number.parseFloat(
        String(prix).replace(',', '.').trim()
      );

      if (
        !Number.isFinite(parsedPrix) ||
        parsedPrix <= 0
      ) {

        return res.status(400).json({
          success: false,
          error: 'Prix invalide'
        });
      }


      // =====================================================
      // 5. NORMALISATION DES TEXTES
      // =====================================================

      const productType = String(type).trim();

      const productGenre =
        genre !== undefined &&
        genre !== null
          ? String(genre).trim()
          : '';

      const productTaille =
        taille !== undefined &&
        taille !== null
          ? String(taille).trim()
          : '';

      const productCouleur =
        couleur !== undefined &&
        couleur !== null
          ? String(couleur).trim()
          : '';

      const productDevise =
        devise !== undefined &&
        devise !== null &&
        String(devise).trim() !== ''
          ? String(devise).trim()
          : 'USD';

      const productDescription =
        description !== undefined &&
        description !== null
          ? String(description).trim()
          : '';


      // =====================================================
      // 6. VÉRIFIER QUE LA BOUTIQUE EXISTE
      // =====================================================

      const [boutiqueRows] = await pool.query(
        `
        SELECT \`id\`
        FROM \`boutiques\`
        WHERE \`id\` = ?
        LIMIT 1
        `,
        [boutiqueId]
      );

      if (!boutiqueRows || boutiqueRows.length === 0) {

        return res.status(400).json({
          success: false,
          error: `La boutique ${boutiqueId} n'existe pas`
        });
      }

      console.log(
        `✅ Boutique vérifiée : ${boutiqueId}`
      );


      // =====================================================
      // 7. CONNEXION MYSQL
      // =====================================================

      connection = await pool.getConnection();

      console.log('✅ Connexion MySQL obtenue');


      // =====================================================
      // 8. DÉBUT TRANSACTION
      // =====================================================

      await connection.beginTransaction();

      transactionStarted = true;

      console.log('🔄 Transaction démarrée');


      // =====================================================
      // 9. INSERTION DU PRODUIT
      // =====================================================
      //
      // IMPORTANT :
      // On utilise CURRENT_TIMESTAMP directement dans SQL.
      // Les noms des colonnes sont protégés par ``
      //
      // =====================================================

      const productSql = `
        INSERT INTO \`produits\`
        (
          \`id_boutique\`,
          \`type\`,
          \`genre\`,
          \`taille\`,
          \`couleur\`,
          \`prix\`,
          \`devise\`,
          \`description\`,
          \`created_at\`
        )
        VALUES
        (
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          CURRENT_TIMESTAMP
        )
      `;

      const productParams = [
        boutiqueId,
        productType,
        productGenre,
        productTaille,
        productCouleur,
        parsedPrix,
        productDevise,
        productDescription
      ];


      // =====================================================
      // 10. LOG SQL POUR DIAGNOSTIC
      // =====================================================

      console.log('======================================');
      console.log('📝 INSERT PRODUIT');
      console.log('======================================');

      try {

        console.log(
          connection.format(
            productSql,
            productParams
          )
        );

      } catch (formatError) {

        console.log(
          '⚠️ Impossible de formatter le SQL :',
          formatError.message
        );
      }

      console.log('======================================');


      // =====================================================
      // 11. EXÉCUTION INSERT PRODUIT
      // =====================================================

      const [insertResult] = await connection.query(
        productSql,
        productParams
      );


      if (
        !insertResult ||
        !insertResult.insertId
      ) {

        throw new Error(
          'MySQL n’a pas retourné l’ID du produit'
        );
      }


      const productId = insertResult.insertId;

      console.log(
        `✅ Produit créé : ID ${productId}`
      );


      // =====================================================
      // 12. INSERTION DES IMAGES
      // =====================================================

      if (imageFiles.length > 0) {

        console.log(
          `🖼️ ${imageFiles.length} image(s) à enregistrer`
        );

        const imageSql = `
          INSERT INTO \`images\`
          (
            \`id_produit\`,
            \`image\`,
            \`created_at\`
          )
          VALUES
          (
            ?,
            ?,
            CURRENT_TIMESTAMP
          )
        `;


        for (const file of imageFiles) {

          if (!file || !file.filename) {
            console.log(
              '⚠️ Fichier image invalide ignoré'
            );
            continue;
          }


          console.log(
            `🖼️ Enregistrement image : ${file.filename}`
          );


          await connection.query(
            imageSql,
            [
              productId,
              file.filename
            ]
          );

        }

        console.log(
          '✅ Toutes les images ont été enregistrées'
        );

      } else {

        console.log(
          'ℹ️ Aucun fichier image envoyé'
        );
      }


      // =====================================================
      // 13. VALIDATION TRANSACTION
      // =====================================================

      await connection.commit();

      transactionStarted = false;

      console.log(
        `✅ Transaction validée pour produit ${productId}`
      );


      // =====================================================
      // 14. LIBÉRATION CONNEXION
      // =====================================================

      connection.release();
      connection = null;


      // =====================================================
// 15. NOTIFICATION FCM NOUVEAU PRODUIT
// =====================================================

let notificationResult = {
  success: false,
  successCount: 0,
  failureCount: 0,
  total: 0
};

try {

  const notificationResult =
    await sendNewProductNotification({

      boutiqueId: id_boutique,
      productId: productId,
      productType: type,
      prix: prix,
      devise: devise,
      genre: genre

    });

  if (notificationResult.success) {

    console.log(
      `✅ Notification nouveau produit envoyée : ` +
      `${notificationResult.successCount}/${notificationResult.total}`
    );

  } else {

    console.log(
      "⚠️ Notification non envoyée :",
      notificationResult.error || "raison inconnue"
    );

  }

} catch (notificationError) {

  console.error(
    "❌ Erreur FCM :",
    notificationError.message
  );

}

      // =====================================================
      // 16. RÉPONSE AU MOBILE
      // =====================================================

      return res.status(201).json({

        success: true,

        message: 'Produit ajouté avec succès',

        product: {

          id: productId,

          id_boutique: boutiqueId,

          type: productType,

          genre: productGenre,

          taille: productTaille,

          couleur: productCouleur,

          prix: parsedPrix,

          devise: productDevise,

          description: productDescription,

          images: imageFiles
            .filter(file => file && file.filename)
            .map(file => ({
              filename: file.filename,
              url: `${PUBLIC_BASE_URL}/uploads/${file.filename}`
            })),

          images_count:
            imageFiles.filter(
              file => file && file.filename
            ).length

        }

      });


    } catch (error) {

      // =====================================================
      // 17. ERREUR
      // =====================================================

      console.error(
        '======================================'
      );

      console.error(
        '❌ ERREUR AJOUT PRODUIT'
      );

      console.error(
        '======================================'
      );

      console.error(
        'Message :',
        error.message
      );

      console.error(
        'Code :',
        error.code
      );

      console.error(
        'SQL State :',
        error.sqlState
      );

      console.error(
        'SQL Message :',
        error.sqlMessage
      );

      console.error(
        'Stack :',
        error.stack
      );

      console.error(
        '======================================'
      );


      // =====================================================
      // 18. ROLLBACK
      // =====================================================

      if (
        connection &&
        transactionStarted
      ) {

        try {

          await connection.rollback();

          console.log(
            '↩️ Transaction annulée'
          );

        } catch (rollbackError) {

          console.error(
            '⚠️ Erreur rollback :',
            rollbackError.message
          );
        }

      }


      // =====================================================
      // 19. LIBÉRATION CONNEXION
      // =====================================================

      if (connection) {

        try {
          connection.release();
        } catch (releaseError) {
          console.error(
            '⚠️ Erreur release :',
            releaseError.message
          );
        }

        connection = null;
      }


      // =====================================================
      // 20. SUPPRESSION DES IMAGES
      // =====================================================

      if (imageFiles.length > 0) {

        for (const file of imageFiles) {

          if (
            !file ||
            !file.filename
          ) {
            continue;
          }


          try {

            const filePath = path.join(
              uploadDir,
              file.filename
            );


            if (fs.existsSync(filePath)) {

              fs.unlinkSync(filePath);

              console.log(
                `🗑️ Image supprimée : ${file.filename}`
              );
            }


          } catch (deleteError) {

            console.error(
              `⚠️ Impossible de supprimer ` +
              `${file.filename}:`,
              deleteError.message
            );
          }

        }

      }


      // =====================================================
      // 21. RÉPONSE ERREUR
      // =====================================================

      return res.status(500).json({

        success: false,

        error:
          error.sqlMessage ||
          error.message ||
          'Erreur lors de l’ajout du produit'

      });

    }

  }
);

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

// ============================================================
// FCM CHAT UNIQUEMENT
// ============================================================

async function sendChatFCMNotification({
  receiverId,
  boutiqueId,
  senderId,
  senderName,
  message,
  messageId
}) {

  console.log("=================================");
  console.log("💬 NOTIFICATION CHAT");
  console.log("=================================");
  console.log("👤 Destinataire :", receiverId);
  console.log("🏪 Boutique     :", boutiqueId);
  console.log("👤 Expéditeur   :", senderId);
  console.log("🆔 Message ID    :", messageId);

  try {

    // ----------------------------------------------------------
    // 1. Vérifier Firebase
    // ----------------------------------------------------------

    if (!firebaseReady || !firebaseApp) {

      console.log(
        "⚠️ Firebase non disponible - notification chat ignorée"
      );

      return {
        success: false,
        successCount: 0,
        failureCount: 0,
        total: 0,
        error: "Firebase non disponible"
      };
    }

    // ----------------------------------------------------------
    // 2. Récupérer les tokens du destinataire
    // ----------------------------------------------------------

    const [rows] = await pool.query(
      `
      SELECT fcm_token
      FROM user_fcm_tokens
      WHERE id = ?
        AND id_boutique = ?
        AND fcm_token IS NOT NULL
        AND TRIM(fcm_token) <> ''
      `,
      [
        receiverId,
        boutiqueId
      ]
    );

    console.log(
      `📱 Enregistrements FCM trouvés : ${rows.length}`
    );

    if (rows.length === 0) {

      console.log(
        `⚠️ Aucun token FCM pour l'utilisateur ${receiverId}`
      );

      return {
        success: false,
        successCount: 0,
        failureCount: 0,
        total: 0,
        error: "Aucun token FCM"
      };
    }

    // ----------------------------------------------------------
    // 3. Nettoyer et supprimer les doublons
    // ----------------------------------------------------------

    const tokens = [
      ...new Set(
        rows
          .map(row => String(row.fcm_token).trim())
          .filter(Boolean)
      )
    ];

    console.log(
      `📱 Tokens uniques : ${tokens.length}`
    );

    if (tokens.length === 0) {

      return {
        success: false,
        successCount: 0,
        failureCount: 0,
        total: 0,
        error: "Aucun token FCM valide"
      };
    }

    // ----------------------------------------------------------
    // 4. Préparer la notification
    // ----------------------------------------------------------

    const title = `💬 ${senderName}`;

    const body =
      String(message).length > 100
        ? String(message).substring(0, 100) + "..."
        : String(message);

    const data = {
      type: "chat_message",
      sender_id: String(senderId),
      receiver_id: String(receiverId),
      message_id: String(messageId),
      message: String(message),
      id_boutique: String(boutiqueId)
    };

    console.log("=================================");
    console.log("📨 ENVOI FCM CHAT");
    console.log("=================================");
    console.log("Title :", title);
    console.log("Body  :", body);
    console.log("Data  :", JSON.stringify(data));
    console.log("Tokens :", tokens.length);

    // ----------------------------------------------------------
    // 5. Envoyer à Firebase
    // ----------------------------------------------------------

    const firebaseMessage = {

      tokens: tokens,

      notification: {
        title: title,
        body: body
      },

      data: data,

      android: {
        priority: "high",

        notification: {
          channelId: "chat_notifications",
          sound: "default"
        }
      },

      apns: {
        payload: {
          aps: {
            sound: "default"
          }
        }
      }
    };

    const response =
      await admin
        .messaging()
        .sendEachForMulticast(firebaseMessage);

    console.log("=================================");
    console.log("📨 RÉSULTAT FCM CHAT");
    console.log("=================================");

    console.log(
      "✅ Succès :",
      response.successCount
    );

    console.log(
      "❌ Échecs :",
      response.failureCount
    );

    console.log(
      "📱 Total :",
      tokens.length
    );

    // ----------------------------------------------------------
    // 6. Afficher les erreurs
    // ----------------------------------------------------------

    response.responses.forEach(
      (result, index) => {

        if (!result.success) {

          console.error(
            `❌ Token ${index} :`,
            result.error?.code,
            result.error?.message
          );

        }

      }
    );

    console.log("=================================");

    return {

      success: response.successCount > 0,

      successCount:
        response.successCount,

      failureCount:
        response.failureCount,

      total:
        tokens.length

    };

  } catch (error) {

    console.error(
      "❌ ERREUR FCM CHAT :",
      error
    );

    return {

      success: false,

      successCount: 0,

      failureCount: 1,

      total: 1,

      error: error.message

    };
  }
}
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
      url: `${PUBLIC_BASE_URL}/uploads/${row.image}`,
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
      url: `${PUBLIC_BASE_URL}/uploads/${row.image}`,
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
      url: `${PUBLIC_BASE_URL}/uploads/${row.image}`,
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
// ============================================================
// FAVORIS
// ============================================================

// GET /backend/favorites
app.get('/backend/favorites', async (req, res) => {
  const { action, id_user, id_produit } = req.query;

  if (!id_user) {
    return res.status(400).json({
      status: 'error',
      message: 'id_user requis'
    });
  }

  try {

    // ========================================================
    // LISTE DES FAVORIS
    // ========================================================
    if (action === 'list') {

      const [rows] = await pool.query(`
        SELECT
          f.id AS favorite_id,
          f.id_user,
          f.id_produit,
          f.date_ajout,

          p.id AS product_id,
          p.type,
          p.genre,
          p.taille,
          p.couleur,
          p.prix,
          p.devise,
          p.description,

          (
            SELECT JSON_ARRAYAGG(
              JSON_OBJECT(
                'id', i.id,
                'image', i.image,
                'url', CONCAT('/uploads/', i.image),
                'filename', i.image,
                'created_at', i.created_at
              )
            )
            FROM images i
            WHERE i.id_produit = p.id
          ) AS images

        FROM favoris f

        INNER JOIN produits p
          ON p.id = f.id_produit

        WHERE f.id_user = ?

        ORDER BY f.date_ajout DESC
      `, [id_user]);

      const favorites = rows.map(row => {

        let images = [];

        if (row.images) {
          try {
            images =
              typeof row.images === 'string'
                ? JSON.parse(row.images)
                : row.images;
          } catch (e) {
            console.warn(
              '⚠️ Erreur parsing images produit',
              row.product_id,
              e.message
            );

            images = [];
          }
        }

        if (!Array.isArray(images)) {
          images = [];
        }

        return {
          id: row.product_id,
          id_produit: row.id_produit,

          favorite_id: row.favorite_id,
          id_user: row.id_user,

          type: row.type,
          genre: row.genre,
          taille: row.taille,
          couleur: row.couleur,

          prix: row.prix,
          devise: row.devise,
          description: row.description,

          images: images,

          date_ajout: row.date_ajout
        };
      });

      console.log(
        `❤️ Favoris utilisateur ${id_user}: ${favorites.length}`
      );

      return res.json({
        status: 'success',
        data: favorites,
        count: favorites.length
      });
    }


    // ========================================================
    // VERIFIER SI PRODUIT FAVORI
    // ========================================================
    if (action === 'check') {

      if (!id_produit) {
        return res.status(400).json({
          status: 'error',
          message: 'id_produit requis'
        });
      }

      const [rows] = await pool.query(`
        SELECT id
        FROM favoris
        WHERE id_user = ?
          AND id_produit = ?
        LIMIT 1
      `, [id_user, id_produit]);

      return res.json({
        status: 'success',
        is_favorite: rows.length > 0
      });
    }


    // ========================================================
    // ACTION INCONNUE
    // ========================================================
    return res.status(400).json({
      status: 'error',
      message: 'Action non reconnue'
    });

  } catch (error) {

    console.error(
      'Erreur GET /backend/favorites:',
      error
    );

    return res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});


// ============================================================
// POST /backend/favorites
// ============================================================

app.post('/backend/favorites', async (req, res) => {

  const {
    action,
    id_user,
    id_produit
  } = req.body;

  if (!action || !id_user || !id_produit) {
    return res.status(400).json({
      status: 'error',
      message: 'action, id_user et id_produit requis'
    });
  }

  try {

    // ========================================================
    // VERIFIER UTILISATEUR
    // ========================================================

    const [userRows] = await pool.query(`
      SELECT id
      FROM user_fcm_tokens
      WHERE id = ?
      LIMIT 1
    `, [id_user]);

    if (userRows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Utilisateur non trouvé'
      });
    }


    // ========================================================
    // VERIFIER PRODUIT
    // ========================================================

    const [productRows] = await pool.query(`
      SELECT id
      FROM produits
      WHERE id = ?
      LIMIT 1
    `, [id_produit]);

    if (productRows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Produit non trouvé'
      });
    }


    // ========================================================
    // AJOUT
    // ========================================================

    if (action === 'add') {

      const [existing] = await pool.query(`
        SELECT id
        FROM favoris
        WHERE id_user = ?
          AND id_produit = ?
        LIMIT 1
      `, [id_user, id_produit]);

      if (existing.length > 0) {
        return res.json({
          status: 'error',
          message: 'Déjà dans les favoris'
        });
      }

      await pool.query(`
        INSERT INTO favoris
        (
          id_user,
          id_produit,
          date_ajout
        )
        VALUES (?, ?, NOW())
      `, [id_user, id_produit]);

      return res.json({
        status: 'success',
        message: 'Ajouté aux favoris'
      });
    }


    // ========================================================
    // SUPPRESSION
    // ========================================================

    if (action === 'remove') {

      const [result] = await pool.query(`
        DELETE FROM favoris
        WHERE id_user = ?
          AND id_produit = ?
      `, [id_user, id_produit]);

      if (result.affectedRows > 0) {
        return res.json({
          status: 'success',
          message: 'Retiré des favoris'
        });
      }

      return res.status(404).json({
        status: 'error',
        message: 'Favori non trouvé'
      });
    }


    // ========================================================
    // ACTION INCONNUE
    // ========================================================

    return res.status(400).json({
      status: 'error',
      message: 'Action non reconnue'
    });

  } catch (error) {

    console.error(
      'Erreur POST /backend/favorites:',
      error
    );

    return res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ---------- 5.15 Gestion OTP ----------
// ---------- 5.15 Gestion OTP ----------
app.post('/backend/send_otp', async (req, res) => {
  const { phone, boutique_id } = req.body;

  console.log('📩 send_otp reçu:', { phone, boutique_id });

  if (!phone || !boutique_id) {
    return res.status(400).json({ success: false, message: 'phone et boutique_id requis' });
  }

  try {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 9) {
      return res.status(400).json({ success: false, message: 'Numéro invalide' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    console.log('📩 cleanPhone:', cleanPhone, 'code généré:', code);

    await pool.query('DELETE FROM otp_codes WHERE phone = ? AND boutique = ?', [cleanPhone, boutique_id]);
    await pool.query(
      'INSERT INTO otp_codes (phone, code, boutique, created_at) VALUES (?, ?, ?, NOW())',
      [cleanPhone, code, boutique_id]
    );

    res.json({ success: true, message: 'OTP généré', code: code });
  } catch (error) {
    console.error('❌ Erreur send_otp:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

app.post('/backend/verify_otp', async (req, res) => {
  const { phone, code, boutique_id } = req.body;

  console.log('🔍 verify_otp reçu:', { phone, code, boutique_id });

  if (!phone || !boutique_id) {
    return res.status(400).json({ success: false, message: 'phone, code et boutique_id requis' });
  }

  try {
    const cleanPhone = phone.replace(/\D/g, '');
    const cleanCode = code.replace(/\D/g, '');

    console.log('🔍 cleanPhone:', cleanPhone, 'cleanCode:', cleanCode);

    const [rows] = await pool.query(
      'SELECT * FROM otp_codes WHERE phone = ? AND code = ? AND boutique = ?',
      [cleanPhone, cleanCode, boutique_id]
    );

    console.log('🔍 lignes trouvées:', rows.length, rows);

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
    console.error('❌ Erreur verify_otp:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ---------- 5.16 Servir les images statiques ----------

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
// Sauvegarde du token FCM (version Node.js)
// ============================================================
app.post('/backend/save_fcm_token', async (req, res) => {
  const {
    user_id,
    phone,
    fcm_token,
    device_type,
    device_name,
    id_boutique,
    is_admin
  } = req.body;

  // Paramètres obligatoires
  if (!fcm_token || !phone) {
    return res.status(400).json({
      status: 'error',
      message: 'Paramètres manquants : fcm_token et phone requis',
      received: req.body
    });
  }

  try {
    // Si id_boutique n'est pas fourni, on essaie de le récupérer
    let boutiqueId = id_boutique;
    if (!boutiqueId) {
      const [rows] = await pool.query(
        'SELECT id_boutique FROM user_fcm_tokens WHERE phone = ? ORDER BY id DESC LIMIT 1',
        [phone]
      );
      if (rows.length > 0) {
        boutiqueId = rows[0].id_boutique;
      } else {
        // On pourrait aussi refuser, mais on peut attribuer une valeur par défaut (ex: 1)
        // Ici on renvoie une erreur pour forcer le client à fournir id_boutique
        return res.status(400).json({
          status: 'error',
          message: 'id_boutique manquant et aucun enregistrement existant pour ce phone'
        });
      }
    }

    const adminFlag = is_admin ? 1 : 0;
    const userId = user_id || phone; // fallback

    // UPSERT basé sur (phone, id_boutique) UNIQUE
    const [result] = await pool.query(
      `INSERT INTO user_fcm_tokens 
         (user_id, phone, fcm_token, device_type, device_name, id_boutique, is_admin, last_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         user_id = VALUES(user_id),
         fcm_token = VALUES(fcm_token),
         device_type = VALUES(device_type),
         device_name = VALUES(device_name),
         is_admin = VALUES(is_admin),
         last_active = NOW()`,
      [
        userId,
        phone,
        fcm_token,
        device_type || 'unknown',
        device_name || 'unknown',
        boutiqueId,
        adminFlag
      ]
    );

    const action = result.affectedRows === 1 ? 'insert' : 'update';
    const message = action === 'insert'
      ? 'Nouvel enregistrement inséré'
      : 'Enregistrement mis à jour';

    res.json({
      status: 'success',
      message,
      action
    });
  } catch (error) {
    console.error('❌ Erreur save_fcm_token:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});
// ============================================================
// Vérification admin (endpoint propre Node.js)
// ============================================================
// ============================================================
// Vérification admin (table useradminshop)
// ============================================================
app.post('/backend/apicheckadmin', async (req, res) => {
  const { phone, id_boutique } = req.body;

  if (!phone || !id_boutique) {
    return res.status(400).json({
      status: 'error',
      message: 'Paramètres manquants (phone et id_boutique)'
    });
  }

  try {
    // Requête sur la table useradminshop
    const [rows] = await pool.query(
      `SELECT * FROM useradminshop 
       WHERE phone = ? AND id_boutique = ? 
       LIMIT 1`,
      [phone, id_boutique]
    );

    const isAdmin = rows.length > 0; // true si un enregistrement existe

    res.json({
      status: 'success',
      data: { is_admin: isAdmin }
    });
  } catch (error) {
    console.error('❌ Erreur check_admin:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});
/*
app.post('/backend/apicheckadmin', async (req, res) => {
  const { phone, id_boutique } = req.body;

  if (!phone || !id_boutique) {
    return res.status(400).json({
      status: 'error',
      message: 'Paramètres manquants (phone et id_boutique)'
    });
  }

  try {
    const [rows] = await pool.query(
      `SELECT is_admin 
       FROM user_fcm_tokens 
       WHERE phone = ? AND id_boutique = ? 
       ORDER BY id DESC LIMIT 1`,
      [phone, id_boutique]
    );

    const isAdmin = rows.length > 0 && rows[0].is_admin === 1;

    res.json({
      status: 'success',
      data: { is_admin: isAdmin }
    });
  } catch (error) {
    console.error('❌ Erreur check_admin:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});*/
// ============================================================
// 6. DÉMARRAGE DU SERVEUR
// ============================================================
app.listen(PORT, () => {
  console.log(`✅ Serveur chat démarré sur le port ${PORT}`);
});