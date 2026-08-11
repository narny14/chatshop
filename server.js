// server.js - Version avec route racine et gestion 404
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware de log
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.url}`);
  next();
});

app.use(cors());
app.use(express.json());

// Route racine
app.get('/', (req, res) => {
  res.json({ message: 'Server is running!' });
});

// Route de santé
app.get('/api/health', (req, res) => {
    console.log('🔥 API HEALTH APPELÉE');

    res.status(200).send({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});
// Middleware 404 (routes non trouvées)
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Gestionnaire d'erreurs global
app.use((err, req, res, next) => {
  console.error('❌ Erreur:', err.stack);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur le port ${PORT}`);
});