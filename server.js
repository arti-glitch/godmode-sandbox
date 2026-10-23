const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

let worldState = {
  gravity: 1.0,
  timeScale: 1.0,
  bounciness: 0.8
};

app.post('/api/parse-prompt', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt is required" });

  if (!genAI) {
    return res.json(fallbackParse(prompt));
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const aiPrompt = `Analyze this prompt for a physics sandbox item: "${prompt}".
Return ONLY a valid JSON object with NO markdown formatting, NO backticks.
JSON format:
{
  "shape": "circle" or "rectangle",
  "width": number (30 to 120),
  "height": number (30 to 120),
  "radius": number (15 to 60),
  "restitution": number (0 to 1.5),
  "density": number (0.001 to 0.08),
  "color": "hex color code e.g. #38bdf8"
}`;

    const result = await model.generateContent(aiPrompt);
    const responseText = result.response.text().trim().replace(/```json|```/g, '');
    const physicsData = JSON.parse(responseText);
    
    return res.json(physicsData);
  } catch (err) {
    console.error("Gemini Parsing Error, using fallback:", err.message);
    return res.json(fallbackParse(prompt));
  }
});

function fallbackParse(prompt) {
  const text = prompt.toLowerCase();
  const isBall = text.includes('ball') || text.includes('circle') || text.includes('orb');
  const isHeavy = text.includes('heavy') || text.includes('giant');
  const isBouncy = text.includes('bouncy') || text.includes('elastic');

  let color = '#38bdf8';
  if (text.includes('red')) color = '#f43f5e';
  else if (text.includes('green') || text.includes('neon')) color = '#22c55e';
  else if (text.includes('yellow')) color = '#eab308';
  else if (text.includes('purple')) color = '#a855f7';

  return {
    shape: isBall ? 'circle' : 'rectangle',
    radius: isHeavy ? 45 : 25,
    width: isHeavy ? 80 : 45,
    height: isHeavy ? 80 : 45,
    restitution: isBouncy ? 1.2 : 0.8,
    density: isHeavy ? 0.05 : 0.002,
    color: color
  };
}

io.on('connection', (socket) => {
  socket.emit('world-config', worldState);

  socket.on('spawn-object', (objectData) => {
    io.emit('object-spawned', { ...objectData, sender: socket.id });
  });

  socket.on('update-physics-rule', (rule) => {
    worldState = { ...worldState, ...rule };
    socket.broadcast.emit('physics-rule-updated', rule);
  });

  socket.on('clear-world', () => {
    io.emit('world-cleared');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server Live on Port ${PORT}`);
});
