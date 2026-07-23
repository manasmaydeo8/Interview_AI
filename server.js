require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
app.use(cors());

async function fileText(file) {
  if (!file) throw new Error('Both a job description and resume are required.');
  if (file.mimetype === 'application/pdf') return (await pdf(file.buffer)).text;
  if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return (await mammoth.extractRawText({ buffer: file.buffer })).value;
  if (file.mimetype === 'text/plain') return file.buffer.toString('utf8');
  throw new Error('Use a PDF, DOCX, or TXT file.');
}

function parseJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('The AI returned an unreadable response. Please try again.');
  return JSON.parse(match[0]);
}

app.post('/api/analyze', upload.fields([{ name: 'job', maxCount: 1 }, { name: 'resume', maxCount: 1 }]), async (req, res) => {
  try {
    if (!process.env.OPENROUTER_API_KEY) throw new Error('Server is missing OPENROUTER_API_KEY. Add it to .env and restart the server.');
    const job = await fileText(req.files?.job?.[0]);
    const resume = await fileText(req.files?.resume?.[0]);
    const prompt = `Compare this job description with this resume. Create practical, truthful interview preparation. Return ONLY valid JSON in this exact shape: {"matchScore":0,"summary":"","strengths":[""],"gaps":[""],"questions":[{"question":"","answer":""}]}. matchScore is 0-100. Include 5 questions with concise answers grounded only in the resume; say when evidence is missing.\n\nJOB DESCRIPTION:\n${job}\n\nRESUME:\n${resume}`;
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'http://localhost:5173', 'X-Title': 'Matchwise' },
      body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001', messages: [{ role: 'user', content: prompt }] })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'OpenRouter could not complete the analysis.');
    res.json(parseJson(data.choices?.[0]?.message?.content || ''));
  } catch (error) {
    res.status(400).json({ error: error.message || 'Analysis failed.' });
  }
});

app.use((error, _req, res, _next) => res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Files must be 5 MB or smaller.' : 'Upload failed.' }));
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
app.listen(process.env.PORT || 3001, () => console.log(`API listening on port ${process.env.PORT || 3001}`));
