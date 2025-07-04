const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const MESSAGES_FILE = 'messages.json';
let messages = {};

// Загрузка сообщений из файла
async function loadMessages() {
  try {
    const data = await fs.readFile(MESSAGES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.log('Создаем новый файл сообщений...');
    await fs.writeFile(MESSAGES_FILE, '{}');
    return {};
  }
}

// Сохранение сообщений в файл
async function saveMessages() {
  try {
    await fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2));
    console.log('Сообщения сохранены');
  } catch (err) {
    console.error('Ошибка сохранения сообщений:', err);
  }
}

// Инициализация сервера
async function startServer() {
  try {
    messages = await loadMessages();
    
    // Обработка favicon
    app.get('/favicon.ico', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
    });
    
    app.use(express.static('public', {
      setHeaders: (res, path) => {
        if (path.endsWith('.css')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      }
    }));
    
    app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
    
    app.get('/chat', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'chat.html'));
    });
    
    io.on('connection', (socket) => {
      console.log('Новый пользователь:', socket.id);
      
      socket.on('joinRoom', async ({ username, room }) => {
        // Создаем комнату если не существует
        if (!messages[room]) {
          messages[room] = [];
        }
        
        // Сохраняем комнату пользователя
        socket.room = room;
        socket.username = username;
        
        console.log(`${username} присоединился к ${room}`);
        
        // Отправляем историю сообщений
        socket.emit('roomHistory', messages[room]);
        
        // Уведомляем о новом пользователе
        socket.broadcast.to(room).emit('systemMessage', {
          text: `${username} присоединился к чату`,
          time: new Date().toLocaleTimeString()
        });
      });
      
      socket.on('join', () => {
        if (socket.room) {
          socket.join(socket.room);
        }
      });
      
      socket.on('message', async ({ text }) => {
        if (!socket.room || !socket.username) return;
        
        const newMessage = {
          id: Date.now(),
          username: socket.username,
          text,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        
        // Сохраняем сообщение
        messages[socket.room].push(newMessage);
        await saveMessages();
        
        // Отправляем всем в комнате
        io.to(socket.room).emit('message', newMessage);
      });
      
      socket.on('disconnect', () => {
        if (socket.room && socket.username) {
          console.log(`${socket.username} вышел из ${socket.room}`);
          socket.broadcast.to(socket.room).emit('systemMessage', {
            text: `${socket.username} покинул чат`,
            time: new Date().toLocaleTimeString()
          });
        }
      });
    });
    
    const PORT = 8080;
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Сервер запущен: http://localhost:${PORT}`);
    });
    
  } catch (err) {
    console.error('Ошибка запуска сервера:', err);
  }
}

startServer();