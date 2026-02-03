const { BOT_TOKEN, CHAT_ID } = require("./config");
const express = require("express");
const https = require("https");
const axios = require("axios");
const cors = require("cors");
const app = express();
const db = require('./db')


// Разрешаем запросы с фронтенда
app.use(cors({
    origin: 'http://localhost:5173', // адрес  Vue проекта
    methods: ['GET', 'POST'],
}));
app.use(express.json()); // для JSON

app.post("/form", async (req, res) => {
    try {
        const data = req.body; // данные формы: { name, phone, message }

        if (!data.name || !data.phone) {
            return res.status(400).json({ status: "error", message: "Имя и телефон обязательны" });
        }

        console.log("Новая заявка:", data);

        // Формируем сообщение для Telegram
        const message = `📩 Новая заявка с сайта!
**Имя:** ${data.name}
**Телефон:** ${data.phone}
**Сообщение:** ${data.message || "Нет"}`;

        await axios.post(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
            {
                chat_id: CHAT_ID,
                text: message,
                parse_mode: "Markdown"
            },
            {
                httpsAgent: new https.Agent({ keepAlive: false })
            }
        );

        res.json({ status: "ok", message: "Заявка отправлена!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "error", error: err.message });
    }
});
app.post('/reviews',  (req, res) => {
    const { name, text, rating } = req.body

    if (!name || !text || !rating) {
        return res.status(400).json({ error: 'Заполните все поля' })
    }

    db.run(
        `INSERT INTO reviews (name, text, rating) VALUES (?, ?, ?)`,
        [name, text, rating],
        function (err) {
            if (err) return res.status(500).json(err)
        },
        res.json({ success: true })

    )
})
app.get('/reviews', (req, res) => {
    db.all(
        `SELECT * FROM reviews WHERE approved = 1 ORDER BY created_at DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json(err)
            res.json(rows)
        }
    )
})

app.listen(3000, () => console.log("Server running on port 3000"));
