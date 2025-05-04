require('dotenv').config();
const express = require('express');
const cors = require('cors');
const AWS = require('aws-sdk');
const { OpenAI } = require('openai');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// AWS S3 Configuration
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: 'ap-south-1'
});

// Azure AI Configuration for DeepSeek-V3-0324
const openai = new OpenAI({
  apiKey: process.env.AZURE_AI_API_KEY,
  baseURL: 'https://jhash-ma9fwww9-eastus2.services.ai.azure.com/models'
});

// Test Azure AI DeepSeek-V3-0324 Endpoint
app.get('/test-openai', async (req, res) => {
  try {
    const response = await openai.chat.completions.create({
      model: 'DeepSeek-V3-0324',
      messages: [
        { role: 'system', content: 'You are a supportive mental health companion.' },
        { role: 'user', content: 'Test prompt: Say hello!' }
      ],
      max_tokens: 150,
      temperature: 0.3 // DeepSeek's recommended temperature
    });
    const reply = response.choices[0].message.content.trim();
    res.json({ message: 'Azure AI DeepSeek-V3-0324 test successful', reply });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save Journal Entry to S3
app.post('/journal', async (req, res) => {
  const { entry, userId, mood, tags } = req.body;

  if (!entry || !userId) {
    return res.status(400).json({ error: 'Entry and userId are required' });
  }

  const entryId = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  const key = `journals/${userId}/entry_${entryId}.json`;

  const journalEntry = {
    id: entryId,
    entry,
    userId,
    mood: mood || null,
    tags: tags || [],
    createdAt: new Date().toISOString()
  };

  try {
    await s3.putObject({
      Bucket: 'mental-health-companion',
      Key: key,
      Body: JSON.stringify(journalEntry),
      ContentType: 'application/json'
    }).promise();
    console.log(`S3 Upload Success: https://mental-health-companion.s3.ap-south-1.amazonaws.com/${key}`);
    res.json({ message: 'Journal saved', entryId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save journal to S3: ' + error.message });
  }
});

// Retrieve Journal Entries from S3
app.get('/journal/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const listParams = {
      Bucket: 'mental-health-companion',
      Prefix: `journals/${userId}/`
    };
    const data = await s3.listObjectsV2(listParams).promise();

    const entries = [];
    for (const obj of data.Contents) {
      const getParams = {
        Bucket: 'mental-health-companion',
        Key: obj.Key
      };
      const file = await s3.getObject(getParams).promise();
      const entry = JSON.parse(file.Body.toString());
      entries.push(entry);
    }

    entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ entries });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve journals from S3: ' + error.message });
  }
});

// Delete Journal Entry from S3
app.delete('/journal/:userId/:entryId', async (req, res) => {
  const { userId, entryId } = req.params;

  try {
    const objects = await s3.listObjectsV2({
      Bucket: 'mental-health-companion',
      Prefix: `journals/${userId}/`
    }).promise();

    const objectToDelete = objects.Contents.find(obj => obj.Key.includes(entryId));
    if (!objectToDelete) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    await s3.deleteObject({
      Bucket: 'mental-health-companion',
      Key: objectToDelete.Key
    }).promise();

    res.json({ message: 'Journal entry deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete journal entry: ' + error.message });
  }
});

// Chat Endpoint with DeepSeek-V3-0324
app.post('/chat', async (req, res) => {
  const { message, userId, mood } = req.body;

  if (!message || !userId) {
    return res.status(400).json({ error: 'Message and userId are required' });
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'DeepSeek-V3-0324',
      messages: [
        { 
          role: 'system', 
          content: 'You are a supportive mental health companion. Provide empathetic, helpful responses. Keep replies concise and supportive.' 
        },
        { 
          role: 'user', 
          content: `User ID: ${userId}${mood ? '\nCurrent mood: ' + mood : ''}\nMessage: ${message}`
        }
      ],
      max_tokens: 150,
      temperature: 0.3 // DeepSeek's recommended temperature
    });

    const reply = response.choices[0].message.content.trim();
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mocked Chat Endpoint (for testing, comment out when using DeepSeek-V3-0324)
// app.post('/chat', async (req, res) => {
//   res.json({ reply: "I'm glad you're feeling happy! How can I support you today?" });
// });

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});