require('dotenv').config(); // подключаем dotenv

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const PORT = process.env.PORT || 3000;

module.exports = {
    BOT_TOKEN,
    CHAT_ID,
    PORT
};