// test-perf.js - Version utilisant des utilisateurs existants
const axios = require('axios');

// Configuration
const BASE_URL = 'https://bytesshop.byteatomeneons.com/api';
const NB_MESSAGES = 5; // Nombre de messages à envoyer

// ✅ Utiliser les IDs existants de ta table
const CLIENT1_ID = 364; // Admin (is_admin = 1, phone = 243818278312, boutique = 3)
const CLIENT2_ID = 395; // Client (phone = 243977558612, boutique = 3)

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
  console.log('🚀 Démarrage du test de performance...');
  console.log(`✅ Utilisateur 1 (Admin) : ID ${CLIENT1_ID}`);
  console.log(`✅ Utilisateur 2 (Client) : ID ${CLIENT2_ID}`);
  console.log(`\n📤 Envoi de ${NB_MESSAGES} messages de l'admin vers le client...`);

  const sendDurations = [];
  for (let i = 0; i < NB_MESSAGES; i++) {
    const message = `Test message ${i+1} à ${new Date().toISOString()}`;
    const result = await sendMessage(CLIENT1_ID, CLIENT2_ID, message);
    if (result.success) {
      sendDurations.push(result.duration);
      process.stdout.write('.');
    } else {
      console.log(`\n❌ Échec du message ${i+1}`);
    }
  }
  console.log(`\n✅ ${sendDurations.length} messages envoyés avec succès.`);

  // Récupérer les messages (pour vérifier la latence de lecture)
  console.log(`\n📥 Récupération des messages entre les deux utilisateurs...`);
  const getResult = await getMessages(CLIENT1_ID, CLIENT2_ID);
  if (getResult.success) {
    console.log(`✅ ${getResult.messages.length} messages récupérés en ${getResult.duration} ms.`);
  } else {
    console.error('❌ Échec de la récupération des messages:', getResult.error);
  }

  // Statistiques
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

  console.log('\n✅ Test terminé.');
}

// Lancer le test
runTest().catch(console.error);