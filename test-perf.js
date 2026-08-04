// test-perf.js - Test de performance de l'API chat
const axios = require('axios');
const { v4: uuidv4 } = require('uuid'); // Installe si besoin : npm install uuid

// Configuration
const BASE_URL = 'https://bytesshop.byteatomeneons.com/api';
// Ou utilisez l'URL locale pour un test en développement : http://localhost:3000/api
const NB_MESSAGES = 10; // Nombre de messages à envoyer pour le test
const BOUTIQUE_ID = '3'; // Même boutique que vos utilisateurs existants

let client1 = { id: null, email: null, phone: null };
let client2 = { id: null, email: null, phone: null };

// Fonction pour créer ou récupérer un utilisateur
async function getOrCreateUser(email, phone, boutiqueId) {
  try {
    // 1. Vérifier si l'utilisateur existe
    const checkRes = await axios.post(`${BASE_URL}/check_user`, { email, phone });
    if (checkRes.data.success) {
      return checkRes.data.user;
    }

    // 2. Créer l'utilisateur
    const registerRes = await axios.post(`${BASE_URL}/register`, {
      email,
      phone,
      fcm_token: `test-token-${phone}`,
      id_boutique: boutiqueId
    });
    if (registerRes.data.success) {
      return registerRes.data.user;
    }
    throw new Error(`Inscription échouée: ${registerRes.data.error}`);
  } catch (error) {
    console.error('Erreur lors de la création/récupération de l\'utilisateur:', error.message);
    throw error;
  }
}

// Fonction pour envoyer un message et mesurer le temps
async function sendMessage(senderId, receiverId, message) {
  const start = Date.now();
  try {
    const res = await axios.post(`${BASE_URL}/send`, {
      sender_id: senderId,
      receiver_id: receiverId,
      message
    });
    const duration = Date.now() - start;
    if (res.data.success) {
      return { success: true, duration, messageId: res.data.message_id };
    } else {
      console.error(`Échec d'envoi : ${res.data.error}`);
      return { success: false, duration };
    }
  } catch (error) {
    console.error('Erreur réseau:', error.message);
    return { success: false, duration: Date.now() - start };
  }
}

// Fonction pour récupérer les messages entre deux utilisateurs
async function getMessages(user1Id, user2Id) {
  const start = Date.now();
  try {
    const res = await axios.post(`${BASE_URL}/get_messages`, {
      user1: user1Id,
      user2: user2Id
    });
    const duration = Date.now() - start;
    if (res.data.success) {
      return { success: true, duration, messages: res.data.messages };
    } else {
      return { success: false, duration, error: res.data.error };
    }
  } catch (error) {
    return { success: false, duration: Date.now() - start, error: error.message };
  }
}

// Fonction principale de test
async function runTest() {
  console.log('🚀 Démarrage du test de performance...\n');

  // 1. Créer / récupérer les deux utilisateurs de test
  try {
    client1 = await getOrCreateUser(`test1-${Date.now()}@test.com`, `243${Math.floor(100000000 + Math.random() * 900000000)}`, BOUTIQUE_ID);
    client2 = await getOrCreateUser(`test2-${Date.now()}@test.com`, `243${Math.floor(100000000 + Math.random() * 900000000)}`, BOUTIQUE_ID);
    console.log(`✅ Utilisateur 1 : id=${client1.id} (${client1.email})`);
    console.log(`✅ Utilisateur 2 : id=${client2.id} (${client2.email})`);
  } catch (error) {
    console.error('❌ Impossible de créer les utilisateurs de test.');
    process.exit(1);
  }

  // 2. Effectuer des envois de messages
  console.log(`\n📤 Envoi de ${NB_MESSAGES} messages de l'utilisateur 1 vers l'utilisateur 2...`);
  const sendDurations = [];
  for (let i = 0; i < NB_MESSAGES; i++) {
    const message = `Test message ${i+1} à ${new Date().toISOString()}`;
    const result = await sendMessage(client1.id, client2.id, message);
    if (result.success) {
      sendDurations.push(result.duration);
      process.stdout.write('.');
    } else {
      console.log(`\n❌ Échec du message ${i+1}`);
    }
  }
  console.log(`\n✅ ${sendDurations.length} messages envoyés avec succès.`);

  // 3. Récupérer les messages (pour vérifier la latence de lecture)
  console.log(`\n📥 Récupération des messages entre les deux utilisateurs...`);
  const getResult = await getMessages(client1.id, client2.id);
  if (getResult.success) {
    console.log(`✅ ${getResult.messages.length} messages récupérés en ${getResult.duration} ms.`);
  } else {
    console.error('❌ Échec de la récupération des messages:', getResult.error);
  }

  // 4. Statistiques
  if (sendDurations.length > 0) {
    const sum = sendDurations.reduce((a, b) => a + b, 0);
    const avg = sum / sendDurations.length;
    const min = Math.min(...sendDurations);
    const max = Math.max(...sendDurations);
    console.log('\n📊 Statistiques d\'envoi :');
    console.log(`   - Messages envoyés : ${sendDurations.length}`);
    console.log(`   - Temps moyen : ${avg.toFixed(2)} ms`);
    console.log(`   - Temps min : ${min} ms`);
    console.log(`   - Temps max : ${max} ms`);
    console.log(`   - Débit moyen : ${(sendDurations.length / (sum / 1000)).toFixed(2)} msg/s`);
  }

  // 5. Temps total du test
  console.log('\n✅ Test terminé.');
}

// Lancer le test
runTest().catch(console.error);